drop policy if exists clients_insert on public.clients;

create policy clients_insert on public.clients
for insert
with check (
  public.is_admin()
  or primary_coach_id = public.current_user_id()
);;
