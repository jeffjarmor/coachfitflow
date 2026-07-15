-- Phase 1 - migration control tables
-- Safe to apply: only creates control tables and indexes.
-- Does not modify existing domain data.

create extension if not exists pgcrypto;

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  phase text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  notes text
);

create table if not exists public.migration_id_map (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null, -- coach | client | gym | staff_assignment | ...
  firebase_project_id text not null,
  firebase_uid text, -- auth uid or logical uid in firebase
  firebase_doc_path text, -- e.g. coaches/{uid}
  firebase_doc_id text, -- raw document id if applicable
  supabase_table text not null,
  supabase_id uuid,
  match_strategy text not null default 'pending', -- pending | by_uid | by_email | manual
  confidence numeric(5,2) not null default 0.00,
  run_id uuid references public.migration_runs(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
);

create table if not exists public.migration_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.migration_runs(id) on delete set null,
  phase text not null,
  entity_type text,
  firebase_doc_path text,
  firebase_doc_id text,
  supabase_table text,
  supabase_id uuid,
  error_code text,
  error_message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_migration_runs_phase on public.migration_runs(phase, started_at desc);
create index if not exists idx_migration_id_map_entity on public.migration_id_map(entity_type);
create index if not exists idx_migration_id_map_firebase_uid on public.migration_id_map(firebase_uid);
create index if not exists idx_migration_id_map_supabase on public.migration_id_map(supabase_table, supabase_id);
create index if not exists idx_migration_errors_phase on public.migration_errors(phase, created_at desc);;
