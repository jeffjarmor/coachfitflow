begin;

-- Staff members may read their membership but cannot promote themselves or
-- grant themselves additional permissions. Authorization remains server-side.
drop policy if exists gym_staff_update on public.gym_staff;
create policy gym_staff_update on public.gym_staff
for update
using (public.can_manage_staff(gym_id))
with check (public.can_manage_staff(gym_id));

-- A regular member may leave a gym, but the owner relationship must be
-- reassigned by an administrator before its owner row can be removed.
drop policy if exists gym_staff_delete on public.gym_staff;
create policy gym_staff_delete on public.gym_staff
for delete
using (
  public.is_admin()
  or (
    public.can_manage_staff(gym_id)
    and not exists (
      select 1 from public.gyms g
      where g.id = public.gym_staff.gym_id
        and g.owner_id = public.gym_staff.coach_id
    )
  )
  or (
    coach_id = public.current_user_id()
    and role <> 'owner'::public.gym_staff_role
    and not exists (
      select 1 from public.gyms g
      where g.id = public.gym_staff.gym_id
        and g.owner_id = public.gym_staff.coach_id
    )
  )
);

create or replace function public.remove_gym_staff_member(
  p_gym_id uuid,
  p_coach_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := public.current_user_id();
  v_owner_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select g.owner_id into v_owner_id
  from public.gyms g
  where g.id = p_gym_id;

  if not found then
    raise exception 'Gym not found' using errcode = 'P0002';
  end if;

  if p_coach_id = v_owner_id and not public.is_admin() then
    raise exception 'The gym owner cannot leave before ownership is reassigned' using errcode = '42501';
  end if;

  if not (
    public.is_admin()
    or public.can_manage_staff(p_gym_id)
    or (v_actor_id = p_coach_id and p_coach_id <> v_owner_id)
  ) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;

  delete from public.gym_staff
  where gym_id = p_gym_id
    and coach_id = p_coach_id;

  if not exists (select 1 from public.gym_staff gs where gs.coach_id = p_coach_id)
     and not exists (select 1 from public.gyms g where g.owner_id = p_coach_id) then
    update public.coaches
    set account_type = 'independent', updated_at = now()
    where id = p_coach_id;
  end if;
end;
$$;

revoke all on function public.remove_gym_staff_member(uuid, uuid) from public;
grant execute on function public.remove_gym_staff_member(uuid, uuid) to authenticated, service_role;

-- Ownership assignment is atomic and can only be performed by an admin.
create or replace function public.admin_assign_gym_owner(
  p_gym_id uuid,
  p_coach_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_previous_owner_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.coaches c where c.id = p_coach_id) then
    raise exception 'Coach not found' using errcode = 'P0002';
  end if;

  select g.owner_id into v_previous_owner_id
  from public.gyms g
  where g.id = p_gym_id
  for update;

  if not found then
    raise exception 'Gym not found' using errcode = 'P0002';
  end if;

  if v_previous_owner_id is not null and v_previous_owner_id <> p_coach_id then
    update public.gym_staff
    set role = 'trainer'::public.gym_staff_role,
        can_edit_clients = true,
        can_create_routines = true,
        can_view_payments = false,
        can_manage_staff = false
    where gym_id = p_gym_id
      and coach_id = v_previous_owner_id;
  end if;

  update public.gyms
  set owner_id = p_coach_id,
      updated_at = now()
  where id = p_gym_id;

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
    p_coach_id,
    'owner'::public.gym_staff_role,
    true,
    true,
    true,
    true
  )
  on conflict (gym_id, coach_id) do update
  set role = excluded.role,
      can_edit_clients = excluded.can_edit_clients,
      can_create_routines = excluded.can_create_routines,
      can_view_payments = excluded.can_view_payments,
      can_manage_staff = excluded.can_manage_staff;

  update public.coaches
  set account_type = 'gym', updated_at = now()
  where id = p_coach_id;

  if v_previous_owner_id is not null
     and v_previous_owner_id <> p_coach_id
     and not exists (select 1 from public.gym_staff gs where gs.coach_id = v_previous_owner_id)
     and not exists (select 1 from public.gyms g where g.owner_id = v_previous_owner_id) then
    update public.coaches
    set account_type = 'independent', updated_at = now()
    where id = v_previous_owner_id;
  end if;
end;
$$;

revoke all on function public.admin_assign_gym_owner(uuid, uuid) from public;
grant execute on function public.admin_assign_gym_owner(uuid, uuid) to authenticated, service_role;

commit;
