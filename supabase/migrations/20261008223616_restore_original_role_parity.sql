begin;

-- Restore the original product contract; do not promote to a remote project automatically.

create or replace function public.admin_create_gym(
  p_request_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_brand_color text default '#CCFF00'
)
returns table(gym_id uuid, gym_access_code text)
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_brand_color text := upper(coalesce(nullif(trim(coalesce(p_brand_color, '')), ''), '#CCFF00'));
  v_gym_id uuid;
  v_access_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Creation request id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.coaches c where c.id = v_actor_id) then
    raise exception 'Coach profile not found' using errcode = 'P0002';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Gym name must contain between 2 and 120 characters' using errcode = '22023';
  end if;
  if v_email is not null and (
    char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Invalid gym email' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'Gym phone is too long' using errcode = '22023';
  end if;
  if v_address is not null and char_length(v_address) > 300 then
    raise exception 'Gym address is too long' using errcode = '22023';
  end if;
  if v_brand_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Invalid gym brand color' using errcode = '22023';
  end if;

  -- Serialize requests per actor. If the browser retries after losing the
  -- response, the same request id returns the gym already created.
  perform pg_advisory_xact_lock(hashtextextended(v_actor_id::text, 0));

  select g.id, g.access_code
  into v_gym_id, v_access_code
  from public.gyms g
  where g.creation_request_id = p_request_id;

  if v_gym_id is null then
    for v_attempt in 1..12 loop
      v_access_code := '';
      for v_index in 1..8 loop
        v_access_code := v_access_code || substr(
          v_alphabet,
          1 + floor(random() * char_length(v_alphabet))::integer,
          1
        );
      end loop;
      v_gym_id := gen_random_uuid();

      begin
        insert into public.gyms (
          id,
          name,
          email,
          phone,
          address,
          brand_color,
          access_code,
          owner_id,
          creation_request_id
        ) values (
          v_gym_id,
          v_name,
          v_email,
          v_phone,
          v_address,
          v_brand_color,
          v_access_code,
          null,
          p_request_id
        );
        exit;
      exception when unique_violation then
        select g.id, g.access_code
        into v_gym_id, v_access_code
        from public.gyms g
        where g.creation_request_id = p_request_id;
        if v_gym_id is not null then exit; end if;
        v_gym_id := null;
      end;
    end loop;
  end if;

  if v_gym_id is null then
    raise exception 'Could not generate a unique gym access code' using errcode = 'P0001';
  end if;

  return query select v_gym_id, v_access_code;
end;
$function$;

comment on function public.admin_create_gym(uuid, text, text, text, text, text) is
  'Administrators create gyms with an access code and idempotency key; owner assignment is a separate action.';


revoke all on function public.admin_create_gym(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.admin_create_gym(uuid, text, text, text, text, text) to authenticated, service_role;

-- Retain the old endpoint for compatibility, with the same admin-only rule.
create or replace function public.create_owned_gym(
  p_request_id uuid, p_name text, p_email text default null, p_phone text default null,
  p_address text default null, p_brand_color text default '#CCFF00'
) returns table (gym_id uuid, gym_access_code text)
language sql security invoker set search_path = public
as $$ select * from public.admin_create_gym(p_request_id, p_name, p_email, p_phone, p_address, p_brand_color) $$;
revoke all on function public.create_owned_gym(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.create_owned_gym(uuid, text, text, text, text, text) to authenticated, service_role;

drop policy if exists gyms_insert on public.gyms;
create policy gyms_insert on public.gyms for insert to authenticated
with check ((select public.is_admin()));

-- A user's editable profile is not a source of self-assigned authorization.
create or replace function public.protect_coach_authorization_fields()
returns trigger language plpgsql security invoker set search_path = public, auth as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role <> 'coach' or new.account_type <> 'independent' or new.coach_plan <> 'standard'
      or new.next_plan_payment_date is not null then
      raise exception 'Authorization fields are managed by administrators' using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role or new.account_type is distinct from old.account_type
    or new.coach_plan is distinct from old.coach_plan
    or new.next_plan_payment_date is distinct from old.next_plan_payment_date then
    raise exception 'Authorization fields are managed by administrators' using errcode = '42501';
  end if;
  return new;
end; $$;
drop trigger if exists protect_coach_authorization_fields on public.coaches;
create trigger protect_coach_authorization_fields before insert or update on public.coaches
for each row execute function public.protect_coach_authorization_fields();
revoke all on function public.protect_coach_authorization_fields() from public, anon, authenticated;

-- Membership assignment stays with owners; reception may still edit due dates.
create or replace function public.protect_gym_membership_billing_fields()
returns trigger language plpgsql security invoker set search_path = public, auth as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_gym_owner(new.gym_id) and (new.membership_plan_id is not null or new.subscription_status <> 'pending') then
      raise exception 'Owner access required for membership plan and status' using errcode = '42501';
    end if;
  else
    if (new.membership_plan_id is distinct from old.membership_plan_id
      or new.subscription_status is distinct from old.subscription_status)
      and not public.is_gym_owner(old.gym_id) then
      raise exception 'Owner access required for membership plan and status' using errcode = '42501';
    end if;
    if new.next_payment_due_date is distinct from old.next_payment_due_date
      and not public.can_view_payments(old.gym_id) then
      raise exception 'Payment access required' using errcode = '42501';
    end if;
  end if;
  if new.membership_plan_id is not null and not exists (
    select 1 from public.membership_plans p where p.id = new.membership_plan_id and p.gym_id = new.gym_id
  ) then raise exception 'Membership plan belongs to another gym' using errcode = '42501'; end if;
  return new;
end; $$;
drop trigger if exists protect_gym_membership_billing_fields on public.client_gym_memberships;
create trigger protect_gym_membership_billing_fields before insert or update on public.client_gym_memberships
for each row execute function public.protect_gym_membership_billing_fields();
revoke all on function public.protect_gym_membership_billing_fields() from public, anon, authenticated;

create or replace function public.set_gym_client_membership_plan(p_gym_id uuid, p_client_id uuid, p_plan_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null or not public.is_gym_owner(p_gym_id) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if p_plan_id is not null and not exists (
    select 1 from public.membership_plans where id = p_plan_id and gym_id = p_gym_id
  ) then raise exception 'Invalid membership plan' using errcode = '42501'; end if;
  update public.client_gym_memberships set membership_plan_id = p_plan_id, updated_at = now()
  where gym_id = p_gym_id and client_id = p_client_id;
  if not found then raise exception 'Membership not found' using errcode = 'P0002'; end if;
end; $$;
revoke all on function public.set_gym_client_membership_plan(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_gym_client_membership_plan(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.create_gym_client(
  p_gym_id uuid,
  p_client jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_client_id uuid;
  v_email text := lower(trim(coalesce(p_client->>'email', '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_manage_clients(p_gym_id) then
    raise exception 'Client management permission required' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_client->>'name', '')), '') is null or v_email = '' then
    raise exception 'Client name and email are required' using errcode = '22023';
  end if;
  if exists (select 1 from public.coaches where lower(email) = v_email)
    or exists (select 1 from public.clients where lower(email) = v_email) then
    raise exception 'Email already registered' using errcode = '23505';
  end if;

  if nullif(p_client->>'membership_plan_id', '') is not null then
    if not public.is_gym_owner(p_gym_id) or not exists (select 1 from public.membership_plans p where p.id = (p_client->>'membership_plan_id')::uuid and p.gym_id = p_gym_id and p.active) then
      raise exception 'Owner access and a valid membership plan required' using errcode = '42501';
    end if;
  end if;

  insert into public.clients (
    name, email, phone, birth_date, age, weight, height, goal, notes, address,
    primary_coach_id
  ) values (
    trim(p_client->>'name'),
    v_email,
    nullif(trim(coalesce(p_client->>'phone', '')), ''),
    nullif(p_client->>'birth_date', '')::date,
    greatest(0, coalesce((p_client->>'age')::integer, 0)),
    nullif(p_client->>'weight', '')::numeric,
    nullif(p_client->>'height', '')::numeric,
    coalesce(nullif(trim(coalesce(p_client->>'goal', '')), ''), '-'),
    nullif(trim(coalesce(p_client->>'notes', '')), ''),
    nullif(trim(coalesce(p_client->>'address', '')), ''),
    null
  ) returning id into v_client_id;

  insert into public.client_gym_memberships (
    client_id, gym_id, assigned_coach_id, subscription_status, membership_plan_id, next_payment_due_date
  ) values (
    v_client_id, p_gym_id, auth.uid(), 'pending',
    nullif(p_client->>'membership_plan_id', '')::uuid, (current_date + interval '1 month')
  );

  return v_client_id;
end;
$$;


create or replace function public.save_gym_routine_plan(
  p_gym_id uuid,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_coach_id uuid := case when public.is_admin() then coalesce(nullif(p_plan->>'coach_id', '')::uuid, auth.uid()) else auth.uid() end;
  v_client_id uuid := nullif(p_plan->>'client_id', '')::uuid;
  v_membership_id uuid;
  v_routine_id uuid;
  v_previous_primary_coach_id uuid;
  v_effective_plan jsonb := p_plan;
begin
  if v_coach_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_create_routines(p_gym_id) then
    raise exception 'Routine permission required' using errcode = '42501';
  end if;

  select membership.id into v_membership_id
  from public.client_gym_memberships membership
  where membership.gym_id = p_gym_id and membership.client_id = v_client_id;
  if v_membership_id is null then
    raise exception 'Client is not part of this gym' using errcode = '42501';
  end if;

  if nullif(p_plan->>'id', '') is not null then
    select coach_id into v_coach_id from public.routines
    where id = (p_plan->>'id')::uuid and client_id = v_client_id and client_gym_membership_id = v_membership_id;
    if not found then raise exception 'Plan not found in this gym' using errcode = '42501'; end if;
    if not public.is_admin() and v_coach_id <> auth.uid() then
      raise exception 'Only the author or an administrator can edit this plan' using errcode = '42501';
    end if;
  end if;

  select primary_coach_id into v_previous_primary_coach_id
  from public.clients where id = v_client_id for update;
  update public.clients set primary_coach_id = v_coach_id where id = v_client_id;

  if nullif(p_plan->>'id', '') is null then
    insert into public.routines (
      coach_id, client_id, client_gym_membership_id, name, objective,
      training_days_count, duration_weeks
    ) values (
      v_coach_id, v_client_id, v_membership_id, 'Borrador', 'Borrador', 0, 1
    ) returning id into v_routine_id;
    v_effective_plan := jsonb_set(v_effective_plan, '{id}', to_jsonb(v_routine_id::text));
  else
    v_routine_id := (p_plan->>'id')::uuid;
    if not exists (
      select 1 from public.routines
      where id = v_routine_id
        and client_id = v_client_id
        and client_gym_membership_id = v_membership_id
    ) then
      raise exception 'Routine is not part of this gym client' using errcode = '42501';
    end if;
    -- Preserve the original author.
  end if;

  v_routine_id := public.save_routine_plan(v_coach_id, v_effective_plan);
  update public.routines
  set client_gym_membership_id = v_membership_id
  where id = v_routine_id;
  update public.clients
  set primary_coach_id = v_previous_primary_coach_id
  where id = v_client_id;
  return v_routine_id;
end;
$$;


create or replace function public.save_gym_competitor_sheet(
  p_gym_id uuid,
  p_sheet jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_coach_id uuid := case when public.is_admin() then coalesce(nullif(p_sheet->>'coach_id', '')::uuid, auth.uid()) else auth.uid() end;
  v_client_id uuid := nullif(p_sheet->>'client_id', '')::uuid;
  v_membership_id uuid;
  v_sheet_id uuid;
  v_previous_primary_coach_id uuid;
  v_effective_sheet jsonb := p_sheet;
begin
  if v_coach_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_create_routines(p_gym_id) then
    raise exception 'Routine permission required' using errcode = '42501';
  end if;

  select membership.id into v_membership_id
  from public.client_gym_memberships membership
  where membership.gym_id = p_gym_id and membership.client_id = v_client_id;
  if v_membership_id is null then
    raise exception 'Client is not part of this gym' using errcode = '42501';
  end if;

  if nullif(p_sheet->>'id', '') is not null then
    select coach_id into v_coach_id from public.competitor_sheets
    where id = (p_sheet->>'id')::uuid and client_id = v_client_id and client_gym_membership_id = v_membership_id;
    if not found then raise exception 'Plan not found in this gym' using errcode = '42501'; end if;
    if not public.is_admin() and v_coach_id <> auth.uid() then
      raise exception 'Only the author or an administrator can edit this plan' using errcode = '42501';
    end if;
  end if;

  select primary_coach_id into v_previous_primary_coach_id
  from public.clients where id = v_client_id for update;
  update public.clients set primary_coach_id = v_coach_id where id = v_client_id;

  if nullif(p_sheet->>'id', '') is null then
    insert into public.competitor_sheets (
      coach_id, client_id, client_gym_membership_id, mesocycle_title,
      macrocycle_title, frequency_text, split_text, training_days_text
    ) values (
      v_coach_id, v_client_id, v_membership_id, 'Borrador', 'Borrador',
      'Borrador', 'Borrador', 'Borrador'
    ) returning id into v_sheet_id;
    v_effective_sheet := jsonb_set(v_effective_sheet, '{id}', to_jsonb(v_sheet_id::text));
  else
    v_sheet_id := (p_sheet->>'id')::uuid;
    if not exists (
      select 1 from public.competitor_sheets
      where id = v_sheet_id
        and client_id = v_client_id
        and client_gym_membership_id = v_membership_id
    ) then
      raise exception 'Competitor sheet is not part of this gym client' using errcode = '42501';
    end if;
    -- Preserve the original author.
  end if;

  v_sheet_id := public.save_competitor_sheet(v_coach_id, v_effective_sheet);
  update public.competitor_sheets
  set client_gym_membership_id = v_membership_id
  where id = v_sheet_id;
  update public.clients
  set primary_coach_id = v_previous_primary_coach_id
  where id = v_client_id;
  return v_sheet_id;
end;
$$;


revoke all on function public.add_gym_staff_by_email(uuid, text, public.gym_staff_role, boolean, boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function public.update_gym_staff_member(uuid, uuid, public.gym_staff_role, boolean, boolean, boolean, boolean) from public, anon, authenticated;

-- Align protected manager removal in the UI and API. Self-removal remains allowed.
create or replace function public.remove_gym_staff_member(
  p_gym_id uuid,
  p_coach_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_actor_id uuid := public.current_user_id();
  v_primary_owner_id uuid;
  v_target_role public.gym_staff_role;
  v_actor_is_owner boolean;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select g.owner_id into v_primary_owner_id
  from public.gyms g
  where g.id = p_gym_id
  for update;
  if not found then
    raise exception 'Gym not found' using errcode = 'P0002';
  end if;
  if p_coach_id = v_primary_owner_id then
    raise exception 'The primary owner must be reassigned before removal' using errcode = '42501';
  end if;

  select gs.role into v_target_role
  from public.gym_staff gs
  where gs.gym_id = p_gym_id
    and gs.coach_id = p_coach_id
  for update;
  if not found then
    raise exception 'Gym staff member not found' using errcode = 'P0002';
  end if;

  v_actor_is_owner := public.is_gym_owner(p_gym_id);
  if not (
    public.is_admin()
    or v_actor_is_owner
    or (
      public.can_manage_staff(p_gym_id)
      and v_target_role <> 'owner'::public.gym_staff_role
      and not exists (select 1 from public.gym_staff target where target.gym_id = p_gym_id and target.coach_id = p_coach_id and target.can_manage_staff)
    )
    or (
      v_actor_id = p_coach_id
      and v_target_role <> 'owner'::public.gym_staff_role
    )
  ) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;

  delete from public.gym_staff
  where gym_id = p_gym_id
    and coach_id = p_coach_id;
end;
$function$;


create or replace function public.can_write_client_measurement(p_client_id uuid, p_membership_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() is not null and (public.is_admin() or (
    exists (select 1 from public.coaches where id = auth.uid()) and (
      (p_membership_id is null and exists (select 1 from public.clients where id = p_client_id and primary_coach_id = auth.uid()))
      or exists (select 1 from public.client_gym_memberships m where m.id = p_membership_id
        and m.client_id = p_client_id and public.can_manage_clients(m.gym_id))
    )
  ));
$$;
revoke all on function public.can_write_client_measurement(uuid, uuid) from public, anon;
grant execute on function public.can_write_client_measurement(uuid, uuid) to authenticated, service_role;
drop policy if exists measurements_insert on public.measurements;
drop policy if exists measurements_update on public.measurements;
drop policy if exists measurements_delete on public.measurements;
create policy measurements_insert on public.measurements for insert to authenticated
with check (public.can_write_client_measurement(client_id, client_gym_membership_id));
create policy measurements_update on public.measurements for update to authenticated
using (public.can_write_client_measurement(client_id, client_gym_membership_id))
with check (public.can_write_client_measurement(client_id, client_gym_membership_id));
create policy measurements_delete on public.measurements for delete to authenticated
using (public.can_write_client_measurement(client_id, client_gym_membership_id));

create or replace function public.update_client_portal_profile(
  p_client_id uuid,
  p_membership_id uuid,
  p_name text,
  p_phone text,
  p_birth_date date,
  p_address text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_authorized boolean := false;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_client_id is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Invalid profile name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_phone, '')) > 50
    or char_length(coalesce(p_address, '')) > 500
    or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Profile field is too long' using errcode = '22023';
  end if;
  if p_birth_date is not null
    and (p_birth_date > current_date or p_birth_date < current_date - interval '120 years') then
    raise exception 'Invalid birth date' using errcode = '22023';
  end if;

  if p_membership_id is null then
    v_authorized := public.has_active_independent_client_portal_access(p_client_id, v_actor_id);
  else
    select exists (
      select 1
      from public.client_portal_access access
      join public.client_gym_memberships membership
        on membership.id = access.client_gym_membership_id
      where access.user_id = v_actor_id
        and membership.id = p_membership_id
        and membership.client_id = p_client_id
    ) into v_authorized;
  end if;

  if not v_authorized then
    raise exception 'Profile access denied' using errcode = '42501';
  end if;

  update public.clients
  set name = v_name,
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      birth_date = coalesce(p_birth_date, birth_date),
      age = case
        when p_birth_date is null then age
        else extract(year from age(current_date, p_birth_date))::integer
      end,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = p_client_id;

  if not found then
    raise exception 'Client profile not found' using errcode = 'P0002';
  end if;
end;
$$;


-- Administrative maintenance is atomic and explicitly authorized.
create or replace function public.admin_remove_client_context(
  p_client_id uuid, p_coach_id uuid, p_membership_id uuid default null
) returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select user_id into v_user_id from public.clients where id = p_client_id for update;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
  if p_membership_id is not null then
    perform 1 from public.client_gym_memberships where id = p_membership_id and client_id = p_client_id for update;
    if not found then raise exception 'Client membership not found' using errcode = 'P0002'; end if;
    delete from public.routines where client_gym_membership_id = p_membership_id;
    delete from public.competitor_sheets where client_gym_membership_id = p_membership_id;
    delete from public.measurements where client_gym_membership_id = p_membership_id;
    delete from public.payments where client_gym_membership_id = p_membership_id;
    delete from public.client_portal_access where client_gym_membership_id = p_membership_id;
    delete from public.client_gym_memberships where id = p_membership_id;
  else
    if not exists (select 1 from public.clients where id = p_client_id and primary_coach_id = p_coach_id) then
      raise exception 'Independent client context not found' using errcode = 'P0002';
    end if;
    delete from public.routines where client_id = p_client_id and client_gym_membership_id is null and coach_id = p_coach_id;
    delete from public.competitor_sheets where client_id = p_client_id and client_gym_membership_id is null and coach_id = p_coach_id;
    delete from public.measurements where client_id = p_client_id and client_gym_membership_id is null;
    delete from public.independent_client_portal_access where client_id = p_client_id and coach_id = p_coach_id;
    update public.clients set primary_coach_id = null where id = p_client_id;
  end if;
  if not exists (select 1 from public.client_gym_memberships where client_id = p_client_id)
    and not exists (select 1 from public.clients where id = p_client_id and primary_coach_id is not null)
    and not exists (select 1 from public.routines where client_id = p_client_id)
    and not exists (select 1 from public.competitor_sheets where client_id = p_client_id) then
    delete from public.clients where id = p_client_id;
    if v_user_id is not null and not exists (select 1 from public.coaches where id = v_user_id)
      and not exists (select 1 from public.clients where user_id = v_user_id)
      and not exists (select 1 from public.client_portal_access where user_id = v_user_id)
      and not exists (select 1 from public.independent_client_portal_access where user_id = v_user_id) then
      delete from public.activity_logins where user_id = v_user_id;
      delete from auth.users where id = v_user_id;
    end if;
  end if;
end; $$;
revoke all on function public.admin_remove_client_context(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_remove_client_context(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.admin_delete_gym_fully(p_gym_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform 1 from public.gyms where id = p_gym_id for update;
  if not found then raise exception 'Gym not found' using errcode = 'P0002'; end if;
  delete from public.routines where client_gym_membership_id in (select id from public.client_gym_memberships where gym_id = p_gym_id);
  delete from public.competitor_sheets where client_gym_membership_id in (select id from public.client_gym_memberships where gym_id = p_gym_id);
  delete from public.measurements where client_gym_membership_id in (select id from public.client_gym_memberships where gym_id = p_gym_id);
  delete from public.payments where client_gym_membership_id in (select id from public.client_gym_memberships where gym_id = p_gym_id);
  delete from public.client_gym_memberships where gym_id = p_gym_id;
  delete from public.gym_staff where gym_id = p_gym_id;
  delete from public.exercises where gym_id = p_gym_id;
  delete from public.membership_plans where gym_id = p_gym_id;
  delete from public.gyms where id = p_gym_id;
end; $$;
revoke all on function public.admin_delete_gym_fully(uuid) from public, anon;
grant execute on function public.admin_delete_gym_fully(uuid) to authenticated, service_role;

create or replace function public.admin_delete_coach_fully(p_coach_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_client record; v_gym record;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_coach_id = auth.uid() then raise exception 'Cannot delete the current administrator' using errcode = '42501'; end if;
  perform 1 from public.coaches where id = p_coach_id for update;
  if not found then raise exception 'Coach not found' using errcode = 'P0002'; end if;
  for v_client in select id from public.clients where primary_coach_id = p_coach_id loop
    perform public.admin_remove_client_context(v_client.id, p_coach_id, null);
  end loop;
  for v_gym in select id from public.gyms where owner_id = p_coach_id loop
    perform public.admin_delete_gym_fully(v_gym.id);
  end loop;
  delete from public.routines where coach_id = p_coach_id;
  delete from public.competitor_sheets where coach_id = p_coach_id;
  delete from public.exercises where coach_id = p_coach_id;
  update public.client_gym_memberships set assigned_coach_id = null where assigned_coach_id = p_coach_id;
  delete from public.gym_staff where coach_id = p_coach_id;
  delete from public.coaches where id = p_coach_id;
  if not exists (select 1 from public.clients where user_id = p_coach_id)
    and not exists (select 1 from public.client_portal_access where user_id = p_coach_id)
    and not exists (select 1 from public.independent_client_portal_access where user_id = p_coach_id) then
    delete from public.activity_logins where user_id = p_coach_id;
    delete from auth.users where id = p_coach_id;
  end if;
end; $$;
revoke all on function public.admin_delete_coach_fully(uuid) from public, anon;
grant execute on function public.admin_delete_coach_fully(uuid) to authenticated, service_role;

create or replace function public.admin_clone_client_context(
  p_client_id uuid, p_source_coach_id uuid, p_target_coach_id uuid, p_membership_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_client public.clients; v_routine public.routines; v_day public.routine_days;
  v_ex public.routine_day_exercises; v_config public.routine_week_configs;
  v_measurement public.measurements; v_warmup public.routine_warmup_exercises;
  v_library_exercise public.exercises; v_library_id uuid;
  v_client_id uuid := gen_random_uuid(); v_routine_id uuid; v_day_id uuid; v_ex_id uuid;
  v_routine_map jsonb := '{}'::jsonb; v_exercise_map jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into v_client from public.clients where id = p_client_id for share;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.coaches where id = p_target_coach_id and role <> 'admin') then
    raise exception 'Target coach not found' using errcode = 'P0002';
  end if;
  if p_membership_id is null then
    if v_client.primary_coach_id is distinct from p_source_coach_id then raise exception 'Source context not found' using errcode = '42501'; end if;
  elsif not exists (select 1 from public.client_gym_memberships where id = p_membership_id and client_id = p_client_id) then
    raise exception 'Source membership not found' using errcode = '42501';
  end if;
  insert into public.clients select * from jsonb_populate_record(null::public.clients,
    to_jsonb(v_client) || jsonb_build_object('id', v_client_id, 'primary_coach_id', p_target_coach_id,
      'user_id', null, 'portal_status', 'pending', 'portal_invited_at', null, 'created_at', now(), 'updated_at', now()));
  -- A clone belongs to the target's independent workspace. Copy private catalog
  -- entries once, including warmups, so it remains readable and editable there.
  for v_library_exercise in
    select e.* from public.exercises e where e.id in (
      select ex.exercise_id from public.routine_day_exercises ex
      join public.routine_days d on d.id = ex.routine_day_id
      join public.routines r on r.id = d.routine_id
      where r.client_id = p_client_id
        and r.client_gym_membership_id is not distinct from p_membership_id
        and (p_membership_id is not null or r.coach_id = p_source_coach_id)
      union
      select w.exercise_id from public.routine_warmup_exercises w
      join public.routines r on r.id = w.routine_id
      where r.client_id = p_client_id
        and r.client_gym_membership_id is not distinct from p_membership_id
        and (p_membership_id is not null or r.coach_id = p_source_coach_id)
    )
  loop
    v_library_id := v_library_exercise.id;
    if v_library_exercise.source <> 'global'
      and not (v_library_exercise.coach_id = p_target_coach_id and v_library_exercise.gym_id is null) then
      v_library_id := gen_random_uuid();
      insert into public.exercises select * from jsonb_populate_record(null::public.exercises,
        to_jsonb(v_library_exercise) || jsonb_build_object('id', v_library_id, 'source', 'coach',
          'coach_id', p_target_coach_id, 'gym_id', null, 'created_at', now(), 'updated_at', now()));
    end if;
    v_exercise_map := v_exercise_map || jsonb_build_object(v_library_exercise.id::text, v_library_id);
  end loop;
  for v_routine in select * from public.routines where client_id = p_client_id
    and client_gym_membership_id is not distinct from p_membership_id
    and (p_membership_id is not null or coach_id = p_source_coach_id) loop
    v_routine_id := gen_random_uuid();
    v_routine_map := v_routine_map || jsonb_build_object(v_routine.id::text, v_routine_id);
    insert into public.routines select * from jsonb_populate_record(null::public.routines,
      to_jsonb(v_routine) || jsonb_build_object('id', v_routine_id, 'client_id', v_client_id,
        'coach_id', p_target_coach_id, 'client_gym_membership_id', null, 'created_at', now(), 'updated_at', now()));
    for v_day in select * from public.routine_days where routine_id = v_routine.id loop
      v_day_id := gen_random_uuid();
      insert into public.routine_days select * from jsonb_populate_record(null::public.routine_days,
        to_jsonb(v_day) || jsonb_build_object('id', v_day_id, 'routine_id', v_routine_id));
      for v_ex in select * from public.routine_day_exercises where routine_day_id = v_day.id loop
        v_ex_id := gen_random_uuid();
        insert into public.routine_day_exercises select * from jsonb_populate_record(null::public.routine_day_exercises,
          to_jsonb(v_ex) || jsonb_build_object('id', v_ex_id, 'routine_day_id', v_day_id,
            'exercise_id', v_exercise_map->>v_ex.exercise_id::text));
        for v_config in select * from public.routine_week_configs where routine_day_exercise_id = v_ex.id loop
          insert into public.routine_week_configs select * from jsonb_populate_record(null::public.routine_week_configs,
            to_jsonb(v_config) || jsonb_build_object('id', gen_random_uuid(), 'routine_day_exercise_id', v_ex_id));
        end loop;
      end loop;
    end loop;
    for v_warmup in select * from public.routine_warmup_exercises where routine_id = v_routine.id loop
      insert into public.routine_warmup_exercises select * from jsonb_populate_record(null::public.routine_warmup_exercises,
        to_jsonb(v_warmup) || jsonb_build_object('id', gen_random_uuid(), 'routine_id', v_routine_id,
          'exercise_id', v_exercise_map->>v_warmup.exercise_id::text));
    end loop;
  end loop;
  for v_measurement in select * from public.measurements where client_id = p_client_id
    and client_gym_membership_id is not distinct from p_membership_id loop
    insert into public.measurements select * from jsonb_populate_record(null::public.measurements,
      to_jsonb(v_measurement) || jsonb_build_object('id', gen_random_uuid(), 'client_id', v_client_id,
        'client_gym_membership_id', null, 'routine_id', v_routine_map->>v_measurement.routine_id::text,
        'created_at', now(), 'updated_at', now()));
  end loop;
  return v_client_id;
end; $$;
revoke all on function public.admin_clone_client_context(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_clone_client_context(uuid, uuid, uuid, uuid) to authenticated, service_role;

-- The same staff removal rules apply to direct REST deletes.
drop policy if exists gym_staff_delete on public.gym_staff;
create policy gym_staff_delete on public.gym_staff for delete to authenticated using (
  public.is_admin() or (
    not exists(select 1 from public.gyms g where g.id = gym_staff.gym_id and g.owner_id = gym_staff.coach_id)
    and (public.is_gym_owner(gym_id)
      or (public.can_manage_staff(gym_id) and role <> 'owner' and not can_manage_staff)
      or (coach_id = auth.uid() and role <> 'owner'))
  )
);
-- Permit shared gym exercises in both working sets and warmups.
CREATE OR REPLACE FUNCTION public.save_routine_plan(p_coach_id uuid, p_plan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_routine_id uuid;
  v_gym_id uuid;
  v_client_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_day_count integer;
  v_exercise jsonb;
  v_day_exercise_id uuid;
  v_week jsonb;
  v_warmup_id text;
  v_warmup_order integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_coach_id is null or (p_coach_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Coach scope not allowed' using errcode = '42501';
  end if;

  v_client_id := nullif(p_plan->>'client_id', '')::uuid;
  if v_client_id is null or not exists (
    select 1
    from public.clients c
    where c.id = v_client_id
      and (c.primary_coach_id = p_coach_id or public.is_admin())
  ) then
    raise exception 'Client not available for this coach' using errcode = '42501';
  end if;

  if nullif(p_plan->>'name', '') is null
    or nullif(p_plan->>'objective', '') is null
    or jsonb_array_length(coalesce(p_plan->'days', '[]'::jsonb)) = 0 then
    raise exception 'Routine name, objective and days are required' using errcode = '22023';
  end if;
  v_day_count := jsonb_array_length(p_plan->'days');

  if nullif(p_plan->>'id', '') is null then
    insert into public.routines (
      coach_id, client_id, name, objective, training_days_count,
      duration_weeks, start_date, end_date, notes,
      warmup_enabled, warmup_custom_text
    ) values (
      p_coach_id,
      v_client_id,
      trim(p_plan->>'name'),
      trim(p_plan->>'objective'),
      v_day_count,
      greatest(1, coalesce((p_plan->>'duration_weeks')::integer, 1)),
      nullif(p_plan->>'start_date', '')::date,
      nullif(p_plan->>'end_date', '')::date,
      nullif(trim(coalesce(p_plan->>'notes', '')), ''),
      coalesce((p_plan->'warmup'->>'enabled')::boolean, false),
      nullif(trim(coalesce(p_plan->'warmup'->>'custom_text', '')), '')
    ) returning id into v_routine_id;
  else
    v_routine_id := (p_plan->>'id')::uuid;

    if not exists (
      select 1 from public.routines r
      where r.id = v_routine_id
        and r.coach_id = p_coach_id
        and r.client_id = v_client_id
    ) then
      raise exception 'Routine not available for this coach' using errcode = '42501';
    end if;

    update public.routines
    set name = trim(p_plan->>'name'),
        objective = trim(p_plan->>'objective'),
        training_days_count = v_day_count,
        duration_weeks = greatest(1, coalesce((p_plan->>'duration_weeks')::integer, 1)),
        start_date = nullif(p_plan->>'start_date', '')::date,
        end_date = nullif(p_plan->>'end_date', '')::date,
        notes = nullif(trim(coalesce(p_plan->>'notes', '')), ''),
        warmup_enabled = coalesce((p_plan->'warmup'->>'enabled')::boolean, false),
        warmup_custom_text = nullif(trim(coalesce(p_plan->'warmup'->>'custom_text', '')), ''),
        updated_at = now()
    where id = v_routine_id;

    -- Training sessions reference routine_days with ON DELETE CASCADE. Keep the
    -- existing day IDs when editing so saved RIR history is not erased.
    if exists (
      select 1
      from public.training_sessions ts
      join public.routine_days rd on rd.id = ts.routine_day_id
      where rd.routine_id = v_routine_id
        and rd.day_number > v_day_count
    ) then
      raise exception 'Cannot remove a routine day with training history' using errcode = '23503';
    end if;
    delete from public.routine_days
    where routine_id = v_routine_id and day_number > v_day_count;
    delete from public.routine_warmup_exercises where routine_id = v_routine_id;
  end if;

  select m.gym_id into v_gym_id from public.routines r
  join public.client_gym_memberships m on m.id = r.client_gym_membership_id
  where r.id = v_routine_id;
  if v_gym_id is not null and not public.can_create_routines(v_gym_id) then
    raise exception 'Routine permission required' using errcode = '42501';
  end if;

  for v_day in
    select value from jsonb_array_elements(p_plan->'days')
  loop
    select id into v_day_id
    from public.routine_days
    where routine_id = v_routine_id
      and day_number = (v_day->>'day_number')::integer
    for update;

    if v_day_id is null then
      insert into public.routine_days (
        routine_id, day_number, day_name, muscle_groups, notes
      ) values (
        v_routine_id,
        (v_day->>'day_number')::integer,
        trim(v_day->>'day_name'),
        array(select jsonb_array_elements_text(coalesce(v_day->'muscle_groups', '[]'::jsonb))),
        nullif(trim(coalesce(v_day->>'notes', '')), '')
      ) returning id into v_day_id;
    else
      update public.routine_days
      set day_name = trim(v_day->>'day_name'),
          muscle_groups = array(select jsonb_array_elements_text(coalesce(v_day->'muscle_groups', '[]'::jsonb))),
          notes = nullif(trim(coalesce(v_day->>'notes', '')), '')
      where id = v_day_id;
      delete from public.routine_day_exercises where routine_day_id = v_day_id;
    end if;

    for v_exercise in
      select value from jsonb_array_elements(coalesce(v_day->'exercises', '[]'::jsonb))
    loop
      if not exists (
        select 1 from public.exercises e
        where e.id = (v_exercise->>'exercise_id')::uuid
          and (e.source = 'global'
            or (v_gym_id is null and e.coach_id = p_coach_id and e.gym_id is null)
            or (v_gym_id is not null and e.gym_id = v_gym_id))
      ) then
        raise exception 'Exercise not available for this coach' using errcode = '42501';
      end if;

      insert into public.routine_day_exercises (
        routine_day_id, exercise_id, sets, reps, rest, notes,
        is_superset, video_url, image_url, order_index,
        block_type, block_id, block_label, block_position, block_rest
      ) values (
        v_day_id,
        (v_exercise->>'exercise_id')::uuid,
        greatest(1, (v_exercise->>'sets')::integer),
        trim(v_exercise->>'reps'),
        trim(v_exercise->>'rest'),
        nullif(trim(coalesce(v_exercise->>'notes', '')), ''),
        coalesce(v_exercise->>'block_type', 'single') in ('biserie', 'triserie'),
        nullif(v_exercise->>'video_url', ''),
        nullif(v_exercise->>'image_url', ''),
        (v_exercise->>'order_index')::integer,
        coalesce(v_exercise->>'block_type', 'single'),
        nullif(v_exercise->>'block_id', '')::uuid,
        nullif(trim(coalesce(v_exercise->>'block_label', '')), ''),
        nullif(v_exercise->>'block_position', '')::integer,
        nullif(trim(coalesce(v_exercise->>'block_rest', '')), '')
      ) returning id into v_day_exercise_id;

      for v_week in
        select value from jsonb_array_elements(coalesce(v_exercise->'week_configs', '[]'::jsonb))
      loop
        insert into public.routine_week_configs (
          routine_day_exercise_id, start_week, end_week, sets, reps, rest, notes
        ) values (
          v_day_exercise_id,
          (v_week->>'start_week')::integer,
          (v_week->>'end_week')::integer,
          greatest(1, (v_week->>'sets')::integer),
          trim(v_week->>'reps'),
          trim(v_week->>'rest'),
          nullif(trim(coalesce(v_week->>'notes', '')), '')
        );
      end loop;
    end loop;
  end loop;

  if coalesce((p_plan->'warmup'->>'enabled')::boolean, false) then
    for v_warmup_id in
      select value #>> '{}'
      from jsonb_array_elements(coalesce(p_plan->'warmup'->'exercise_ids', '[]'::jsonb))
    loop
      if not exists (
        select 1 from public.exercises e
        where e.id = v_warmup_id::uuid
          and (e.source = 'global'
            or (v_gym_id is null and e.coach_id = p_coach_id and e.gym_id is null)
            or (v_gym_id is not null and e.gym_id = v_gym_id))
      ) then
        raise exception 'Warmup exercise not available for this coach' using errcode = '42501';
      end if;

      insert into public.routine_warmup_exercises (routine_id, exercise_id, order_index)
      values (v_routine_id, v_warmup_id::uuid, v_warmup_order);
      v_warmup_order := v_warmup_order + 1;
    end loop;
  end if;

  return v_routine_id;
end;
$function$;

revoke execute on function public.complete_portal_training_session(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_competitor_sheet(p_coach_id uuid, p_sheet jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_sheet_id uuid;
  v_gym_id uuid;
  v_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_coach_id is null or (p_coach_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Coach scope not allowed' using errcode = '42501';
  end if;

  select m.gym_id into v_gym_id from public.competitor_sheets s
  join public.client_gym_memberships m on m.id = s.client_gym_membership_id
  where s.id = nullif(p_sheet->>'id', '')::uuid;
  if v_gym_id is not null and not public.can_create_routines(v_gym_id) then
    raise exception 'Routine permission required' using errcode = '42501';
  end if;

  v_client_id := nullif(p_sheet->>'client_id', '')::uuid;
  if v_client_id is null or not exists (
    select 1 from public.clients c
    where c.id = v_client_id
      and (c.primary_coach_id = p_coach_id or public.is_admin())
  ) then
    raise exception 'Client not available for this coach' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_sheet->>'mesocycle_title', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'macrocycle_title', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'frequency_text', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'split_text', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'training_days_text', '')), '') is null
    or jsonb_typeof(coalesce(p_sheet->'workouts', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_sheet->'workouts') = 0
    or jsonb_typeof(coalesce(p_sheet->'day_labels', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_sheet->'day_labels') = 0 then
    raise exception 'Competitor sheet fields, days and workouts are required' using errcode = '22023';
  end if;

  if nullif(p_sheet->>'id', '') is null then
    insert into public.competitor_sheets (
      coach_id, client_id, program_title, mesocycle_title, macrocycle_title,
      frequency_text, split_text, training_days_text, day_labels, week_plans, workouts
    ) values (
      p_coach_id,
      v_client_id,
      nullif(trim(coalesce(p_sheet->>'program_title', '')), ''),
      trim(p_sheet->>'mesocycle_title'),
      trim(p_sheet->>'macrocycle_title'),
      trim(p_sheet->>'frequency_text'),
      trim(p_sheet->>'split_text'),
      trim(p_sheet->>'training_days_text'),
      array(select jsonb_array_elements_text(p_sheet->'day_labels')),
      coalesce(p_sheet->'week_plans', '[]'::jsonb),
      p_sheet->'workouts'
    ) returning id into v_sheet_id;
  else
    v_sheet_id := (p_sheet->>'id')::uuid;
    if not exists (
      select 1 from public.competitor_sheets s
      where s.id = v_sheet_id and s.coach_id = p_coach_id and s.client_id = v_client_id
    ) then
      raise exception 'Competitor sheet not available for this coach' using errcode = '42501';
    end if;

    update public.competitor_sheets
    set program_title = nullif(trim(coalesce(p_sheet->>'program_title', '')), ''),
        mesocycle_title = trim(p_sheet->>'mesocycle_title'),
        macrocycle_title = trim(p_sheet->>'macrocycle_title'),
        frequency_text = trim(p_sheet->>'frequency_text'),
        split_text = trim(p_sheet->>'split_text'),
        training_days_text = trim(p_sheet->>'training_days_text'),
        day_labels = array(select jsonb_array_elements_text(p_sheet->'day_labels')),
        week_plans = coalesce(p_sheet->'week_plans', '[]'::jsonb),
        workouts = p_sheet->'workouts',
        updated_at = now()
    where id = v_sheet_id;
  end if;

  return v_sheet_id;
end;
$function$;

notify pgrst, 'reload schema';
commit;
