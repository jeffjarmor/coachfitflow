begin;

-- Keep gyms.owner_id as the primary owner for backward compatibility, while
-- treating gym_staff rows with role=owner as full co-owners everywhere that
-- already relies on is_gym_owner().
create or replace function public.is_gym_owner(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select public.is_admin()
    or exists (
      select 1
      from public.gyms g
      where g.id = p_gym_id
        and g.owner_id = public.current_user_id()
    )
    or exists (
      select 1
      from public.gym_staff gs
      where gs.gym_id = p_gym_id
        and gs.coach_id = public.current_user_id()
        and gs.role = 'owner'::public.gym_staff_role
    );
$function$;

comment on function public.is_gym_owner(uuid) is
  'Returns true for admins, the primary gym owner, and gym staff promoted to co-owner.';

-- Role changes go through one atomic, permission-aware function. This keeps
-- role and permission columns synchronized and prevents changing the primary
-- owner through the staff screen.
create or replace function public.set_gym_staff_role(
  p_gym_id uuid,
  p_coach_id uuid,
  p_role public.gym_staff_role
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $function$
declare
  v_actor_id uuid := public.current_user_id();
  v_primary_owner_id uuid;
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

  if not public.is_gym_owner(p_gym_id) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  if p_coach_id = v_primary_owner_id then
    raise exception 'The primary owner role can only be changed by reassigning gym ownership' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = p_coach_id
  ) then
    raise exception 'Gym staff member not found' using errcode = 'P0002';
  end if;

  update public.gym_staff
  set role = p_role,
      can_edit_clients = true,
      can_create_routines = p_role in (
        'owner'::public.gym_staff_role,
        'trainer'::public.gym_staff_role
      ),
      can_view_payments = p_role in (
        'owner'::public.gym_staff_role,
        'receptionist'::public.gym_staff_role
      ),
      can_manage_staff = p_role = 'owner'::public.gym_staff_role
  where gym_id = p_gym_id
    and coach_id = p_coach_id;

  update public.coaches
  set account_type = 'gym', updated_at = now()
  where id = p_coach_id;
end;
$function$;

comment on function public.set_gym_staff_role(uuid, uuid, public.gym_staff_role) is
  'Allows an admin or gym owner to promote/demote staff, including co-owners, without changing the primary owner.';

revoke all on function public.set_gym_staff_role(uuid, uuid, public.gym_staff_role) from public;
grant execute on function public.set_gym_staff_role(uuid, uuid, public.gym_staff_role) to authenticated, service_role;

-- Stop clients from bypassing the RPC and writing arbitrary role/permission
-- combinations. SECURITY DEFINER functions continue to work normally.
revoke update on table public.gym_staff from authenticated;

drop policy if exists gym_staff_update on public.gym_staff;
create policy gym_staff_update on public.gym_staff
for update
using (public.is_admin())
with check (public.is_admin());

-- Direct staff inserts are reserved for admins. Regular joins use the existing
-- join_gym_by_access_code SECURITY DEFINER function and always start as trainer.
drop policy if exists gym_staff_insert on public.gym_staff;
create policy gym_staff_insert on public.gym_staff
for insert
with check (public.is_admin());

commit;
