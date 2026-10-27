begin;

alter table public.gyms
  add column if not exists creation_request_id uuid;

create unique index if not exists gyms_creation_request_id_key
  on public.gyms (creation_request_id)
  where creation_request_id is not null;

comment on column public.gyms.creation_request_id is
  'Client-generated idempotency key used only while creating a gym.';

create or replace function public.create_owned_gym(
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
  where g.creation_request_id = p_request_id
    and g.owner_id = v_actor_id;

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
          v_actor_id,
          p_request_id
        );
        exit;
      exception when unique_violation then
        select g.id, g.access_code
        into v_gym_id, v_access_code
        from public.gyms g
        where g.creation_request_id = p_request_id
          and g.owner_id = v_actor_id;
        if v_gym_id is not null then exit; end if;
        v_gym_id := null;
      end;
    end loop;
  end if;

  if v_gym_id is null then
    raise exception 'Could not generate a unique gym access code' using errcode = 'P0001';
  end if;

  insert into public.gym_staff (
    gym_id,
    coach_id,
    role,
    can_edit_clients,
    can_create_routines,
    can_view_payments,
    can_manage_staff
  ) values (
    v_gym_id,
    v_actor_id,
    'owner'::public.gym_staff_role,
    true,
    true,
    true,
    true
  )
  on conflict on constraint gym_staff_gym_id_coach_id_key do update
  set role = 'owner'::public.gym_staff_role,
      can_edit_clients = true,
      can_create_routines = true,
      can_view_payments = true,
      can_manage_staff = true;

  update public.coaches
  set account_type = 'gym'::public.account_type,
      updated_at = now()
  where id = v_actor_id;

  return query select v_gym_id, v_access_code;
end;
$function$;

comment on function public.create_owned_gym(uuid, text, text, text, text, text) is
  'Creates a gym, its primary-owner membership and access code atomically with an idempotency key.';

revoke all on function public.create_owned_gym(uuid, text, text, text, text, text)
  from public, anon;
grant execute on function public.create_owned_gym(uuid, text, text, text, text, text)
  to authenticated, service_role;

commit;
