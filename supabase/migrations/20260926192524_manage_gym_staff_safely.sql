begin;

-- Keep the primary owner visible in Personal even for gyms created before the
-- owner membership was synchronized into gym_staff.
insert into public.gym_staff (
  gym_id,
  coach_id,
  role,
  can_edit_clients,
  can_create_routines,
  can_view_payments,
  can_manage_staff
)
select
  g.id,
  g.owner_id,
  'owner'::public.gym_staff_role,
  true,
  true,
  true,
  true
from public.gyms g
where g.owner_id is not null
on conflict (gym_id, coach_id) do update
set role = 'owner'::public.gym_staff_role,
    can_edit_clients = true,
    can_create_routines = true,
    can_view_payments = true,
    can_manage_staff = true;

create or replace function public.add_gym_staff_by_email(
  p_gym_id uuid,
  p_email text,
  p_role public.gym_staff_role,
  p_can_edit_clients boolean,
  p_can_create_routines boolean,
  p_can_view_payments boolean,
  p_can_manage_staff boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_actor_id uuid := public.current_user_id();
  v_actor_is_owner boolean;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_candidates uuid[];
  v_coach_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_email = '' then
    raise exception 'Email is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.gyms g where g.id = p_gym_id) then
    raise exception 'Gym not found' using errcode = 'P0002';
  end if;

  v_actor_is_owner := public.is_gym_owner(p_gym_id);
  if not (v_actor_is_owner or public.can_manage_staff(p_gym_id)) then
    raise exception 'Staff management permission required' using errcode = '42501';
  end if;
  if (p_role = 'owner'::public.gym_staff_role or coalesce(p_can_manage_staff, false))
     and not v_actor_is_owner then
    raise exception 'Only an owner can grant owner or staff management access' using errcode = '42501';
  end if;

  select array_agg(c.id order by c.created_at, c.id)
    into v_candidates
  from public.coaches c
  where lower(trim(c.email)) = v_email
    and c.role = 'coach'::public.coach_role;

  if coalesce(cardinality(v_candidates), 0) = 0 then
    raise exception 'Coach account not found' using errcode = 'P0002';
  end if;
  if cardinality(v_candidates) > 1 then
    raise exception 'Multiple coach accounts use this email' using errcode = 'P0003';
  end if;
  v_coach_id := v_candidates[1];

  if exists (
    select 1 from public.gym_staff gs
    where gs.gym_id = p_gym_id and gs.coach_id = v_coach_id
  ) then
    raise exception 'Coach is already gym staff' using errcode = '23505';
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
    p_gym_id,
    v_coach_id,
    p_role,
    case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_edit_clients, false) end,
    case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_create_routines, false) end,
    case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_view_payments, false) end,
    case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_manage_staff, false) end
  );

  update public.coaches
  set account_type = 'gym'::public.account_type,
      updated_at = now()
  where id = v_coach_id;

  return v_coach_id;
end;
$function$;

comment on function public.add_gym_staff_by_email(uuid, text, public.gym_staff_role, boolean, boolean, boolean, boolean) is
  'Adds an existing coach account to a gym after checking staff-management and owner-elevation permissions.';

revoke all on function public.add_gym_staff_by_email(uuid, text, public.gym_staff_role, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.add_gym_staff_by_email(uuid, text, public.gym_staff_role, boolean, boolean, boolean, boolean)
  to authenticated, service_role;

create or replace function public.update_gym_staff_member(
  p_gym_id uuid,
  p_coach_id uuid,
  p_role public.gym_staff_role,
  p_can_edit_clients boolean,
  p_can_create_routines boolean,
  p_can_view_payments boolean,
  p_can_manage_staff boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_actor_id uuid := public.current_user_id();
  v_actor_is_owner boolean;
  v_primary_owner_id uuid;
  v_current_role public.gym_staff_role;
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

  v_actor_is_owner := public.is_gym_owner(p_gym_id);
  if not (v_actor_is_owner or public.can_manage_staff(p_gym_id)) then
    raise exception 'Staff management permission required' using errcode = '42501';
  end if;
  if p_coach_id = v_primary_owner_id then
    raise exception 'The primary owner cannot be changed from staff management' using errcode = '42501';
  end if;

  select gs.role into v_current_role
  from public.gym_staff gs
  where gs.gym_id = p_gym_id
    and gs.coach_id = p_coach_id
  for update;
  if not found then
    raise exception 'Gym staff member not found' using errcode = 'P0002';
  end if;

  if not v_actor_is_owner and (
    v_current_role = 'owner'::public.gym_staff_role
    or p_role = 'owner'::public.gym_staff_role
    or coalesce(p_can_manage_staff, false)
  ) then
    raise exception 'Only an owner can change owner or staff management access' using errcode = '42501';
  end if;

  update public.gym_staff
  set role = p_role,
      can_edit_clients = case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_edit_clients, false) end,
      can_create_routines = case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_create_routines, false) end,
      can_view_payments = case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_view_payments, false) end,
      can_manage_staff = case when p_role = 'owner'::public.gym_staff_role then true else coalesce(p_can_manage_staff, false) end
  where gym_id = p_gym_id
    and coach_id = p_coach_id;

  update public.coaches
  set account_type = 'gym'::public.account_type,
      updated_at = now()
  where id = p_coach_id;
end;
$function$;

comment on function public.update_gym_staff_member(uuid, uuid, public.gym_staff_role, boolean, boolean, boolean, boolean) is
  'Updates a gym staff role and explicit permissions while protecting the primary owner and owner-level access.';

revoke all on function public.update_gym_staff_member(uuid, uuid, public.gym_staff_role, boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.update_gym_staff_member(uuid, uuid, public.gym_staff_role, boolean, boolean, boolean, boolean)
  to authenticated, service_role;

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

comment on function public.remove_gym_staff_member(uuid, uuid) is
  'Removes gym staff while protecting the primary owner and preventing delegated managers from removing co-owners.';

revoke all on function public.remove_gym_staff_member(uuid, uuid) from public, anon;
grant execute on function public.remove_gym_staff_member(uuid, uuid) to authenticated, service_role;

commit;
