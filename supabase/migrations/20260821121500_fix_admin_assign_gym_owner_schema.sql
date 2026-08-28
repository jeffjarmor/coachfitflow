begin;

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
