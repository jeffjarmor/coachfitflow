alter table public.clients add column if not exists primary_coach_id uuid references public.coaches(id) on delete set null;
create index if not exists idx_clients_primary_coach_id on public.clients(primary_coach_id);;
