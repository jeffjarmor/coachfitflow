begin;

drop policy if exists measurements_insert on public.measurements;
drop policy if exists measurements_update on public.measurements;
drop policy if exists measurements_delete on public.measurements;

create policy measurements_insert on public.measurements
for insert
with check (
  public.is_admin()
  or (
    exists (
      select 1
      from public.coaches c
      where c.id = public.current_user_id()
    )
    and public.can_access_client(measurements.client_id)
  )
);

create policy measurements_update on public.measurements
for update
using (
  public.is_admin()
  or (
    exists (
      select 1
      from public.coaches c
      where c.id = public.current_user_id()
    )
    and public.can_access_client(measurements.client_id)
  )
)
with check (
  public.is_admin()
  or (
    exists (
      select 1
      from public.coaches c
      where c.id = public.current_user_id()
    )
    and public.can_access_client(measurements.client_id)
  )
);

create policy measurements_delete on public.measurements
for delete
using (
  public.is_admin()
  or (
    exists (
      select 1
      from public.coaches c
      where c.id = public.current_user_id()
    )
    and public.can_access_client(measurements.client_id)
  )
);

commit;;
