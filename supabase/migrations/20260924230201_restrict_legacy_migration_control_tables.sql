begin;

-- These tables contain migration payloads and errors, not application data.
-- Existing SECURITY DEFINER helpers continue to run as their owner; trusted
-- service-role migration jobs retain direct access.
alter table public.migration_runs enable row level security;
alter table public.migration_id_map enable row level security;
alter table public.migration_errors enable row level security;

revoke all on public.migration_runs, public.migration_id_map, public.migration_errors
  from public, anon, authenticated;
grant all on public.migration_runs, public.migration_id_map, public.migration_errors
  to service_role;

commit;
