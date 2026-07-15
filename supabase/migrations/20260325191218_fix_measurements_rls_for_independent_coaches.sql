begin;

drop policy if exists measurements_write on public.measurements;
drop policy if exists measurements_insert on public.measurements;
drop policy if exists measurements_update on public.measurements;
drop policy if exists measurements_delete on public.measurements;

create policy measurements_insert on public.measurements
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.clients c
    where c.id = measurements.client_id
      and c.primary_coach_id = public.current_user_id()
  )
  or (
    measurements.client_gym_membership_id is not null
    and public.can_manage_clients(public.membership_gym_id(measurements.client_gym_membership_id))
  )
);

create policy measurements_update on public.measurements
for update
using (
  public.is_admin()
  or exists (
    select 1
    from public.clients c
    where c.id = measurements.client_id
      and c.primary_coach_id = public.current_user_id()
  )
  or (
    measurements.client_gym_membership_id is not null
    and public.can_manage_clients(public.membership_gym_id(measurements.client_gym_membership_id))
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.clients c
    where c.id = measurements.client_id
      and c.primary_coach_id = public.current_user_id()
  )
  or (
    measurements.client_gym_membership_id is not null
    and public.can_manage_clients(public.membership_gym_id(measurements.client_gym_membership_id))
  )
);

create policy measurements_delete on public.measurements
for delete
using (
  public.is_admin()
  or exists (
    select 1
    from public.clients c
    where c.id = measurements.client_id
      and c.primary_coach_id = public.current_user_id()
  )
  or (
    measurements.client_gym_membership_id is not null
    and public.can_manage_clients(public.membership_gym_id(measurements.client_gym_membership_id))
  )
);

commit;;
