begin;

create or replace function public.join_gym_by_access_code(p_access_code text)
returns table (
  id uuid,
  name text,
  email text,
  phone text,
  address text,
  logo_url text,
  brand_color text,
  access_code text,
  owner_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_gym public.gyms%rowtype;
begin
  v_uid := public.current_user_id();

  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_access_code is null or btrim(p_access_code) = '' then
    raise exception 'Invalid access code';
  end if;

  select *
  into v_gym
  from public.gyms g
  where upper(g.access_code) = upper(btrim(p_access_code))
  limit 1;

  if not found then
    raise exception 'Invalid access code';
  end if;

  if not exists (select 1 from public.coaches c where c.id = v_uid) then
    raise exception 'Coach not found';
  end if;

  if exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = v_gym.id
      and gs.coach_id = v_uid
  ) then
    raise exception 'You are already a member of this gym';
  end if;

  insert into public.gym_staff (gym_id, coach_id, role)
  values (v_gym.id, v_uid, 'trainer');

  update public.coaches
  set account_type = 'gym',
      updated_at = now()
  where id = v_uid;

  return query
  select
    v_gym.id,
    v_gym.name,
    v_gym.email,
    v_gym.phone,
    v_gym.address,
    v_gym.logo_url,
    v_gym.brand_color,
    v_gym.access_code,
    v_gym.owner_id,
    v_gym.created_at,
    v_gym.updated_at;
end;
$$;

grant execute on function public.join_gym_by_access_code(text) to authenticated;

commit;;
