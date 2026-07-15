drop policy if exists clients_insert on public.clients;

create policy clients_insert on public.clients
for insert
with check (auth.uid() is not null);;
