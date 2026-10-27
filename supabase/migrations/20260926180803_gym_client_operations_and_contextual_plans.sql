begin;

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
    client_id, gym_id, assigned_coach_id, subscription_status
  ) values (
    v_client_id, p_gym_id, auth.uid(), 'active'
  );

  return v_client_id;
end;
$$;

create or replace function public.remove_gym_client(
  p_gym_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_manage_clients(p_gym_id) then
    raise exception 'Client management permission required' using errcode = '42501';
  end if;

  select id into v_membership_id
  from public.client_gym_memberships
  where gym_id = p_gym_id and client_id = p_client_id
  for update;
  if v_membership_id is null then
    raise exception 'Gym client not found' using errcode = 'P0002';
  end if;

  delete from public.training_sessions where client_gym_membership_id = v_membership_id;
  delete from public.competitor_sheets where client_gym_membership_id = v_membership_id;
  delete from public.measurements where client_gym_membership_id = v_membership_id;
  delete from public.routines where client_gym_membership_id = v_membership_id;
  delete from public.client_gym_memberships where id = v_membership_id;

  if not exists (select 1 from public.client_gym_memberships where client_id = p_client_id)
    and exists (
      select 1 from public.clients
      where id = p_client_id and primary_coach_id is null
    ) then
    delete from public.clients where id = p_client_id and primary_coach_id is null;
  end if;
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
  v_coach_id uuid := auth.uid();
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
    update public.routines set coach_id = v_coach_id where id = v_routine_id;
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
  v_coach_id uuid := auth.uid();
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
    update public.competitor_sheets set coach_id = v_coach_id where id = v_sheet_id;
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

create or replace function public.enforce_paid_access_for_routine_exercise_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_routine_id uuid;
  v_coach_id uuid;
  v_membership_id uuid;
  v_account_type text;
  v_legacy_routine_id text;
begin
  if coalesce(new.block_type, 'single') = 'single' then
    return new;
  end if;

  select r.id, r.coach_id, r.client_gym_membership_id, coalesce(c.account_type, 'independent')
    into v_routine_id, v_coach_id, v_membership_id, v_account_type
  from public.routine_days rd
  join public.routines r on r.id = rd.routine_id
  left join public.coaches c on c.id = r.coach_id
  where rd.id = new.routine_day_id
  limit 1;

  if v_coach_id is null then
    raise exception 'Routine day not found for exercise block' using errcode = '23503';
  end if;

  v_legacy_routine_id := current_setting('zummith.legacy_biserie_routine_id', true);
  if new.block_type = 'biserie' and v_legacy_routine_id = v_routine_id::text then
    return new;
  end if;

  if v_membership_id is not null
    or v_account_type = 'gym'
    or public.is_admin()
    or public.is_independent_paid_coach_access_active(v_coach_id) then
    return new;
  end if;

  raise exception 'Paid coach subscription required for exercise blocks'
    using errcode = '42501';
end;
$$;

revoke all on function public.create_gym_client(uuid, jsonb) from public, anon;
revoke all on function public.remove_gym_client(uuid, uuid) from public, anon;
revoke all on function public.save_gym_routine_plan(uuid, jsonb) from public, anon;
revoke all on function public.save_gym_competitor_sheet(uuid, jsonb) from public, anon;
grant execute on function public.create_gym_client(uuid, jsonb) to authenticated;
grant execute on function public.remove_gym_client(uuid, uuid) to authenticated;
grant execute on function public.save_gym_routine_plan(uuid, jsonb) to authenticated;
grant execute on function public.save_gym_competitor_sheet(uuid, jsonb) to authenticated;

comment on function public.create_gym_client(uuid, jsonb) is
  'Creates a client and its gym membership atomically after checking gym client-management permission.';
comment on function public.remove_gym_client(uuid, uuid) is
  'Removes one gym membership and only the data scoped to that membership; deletes an orphan gym-only profile.';
comment on function public.save_gym_routine_plan(uuid, jsonb) is
  'Reuses the complete routine writer while enforcing gym membership and routine permission.';
comment on function public.save_gym_competitor_sheet(uuid, jsonb) is
  'Reuses the complete competitor writer while enforcing gym membership and routine permission.';

commit;
