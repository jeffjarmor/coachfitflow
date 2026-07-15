begin;

drop policy if exists measurements_select on public.measurements;

create policy measurements_select on public.measurements
for select
using (
  public.is_admin()
  or public.can_access_client(client_id)
);

commit;;
