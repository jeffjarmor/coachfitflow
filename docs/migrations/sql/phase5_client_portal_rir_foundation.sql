begin;

alter table public.clients
  add column if not exists portal_status text not null default 'pending';

alter table public.clients
  add column if not exists portal_invited_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_portal_status_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_portal_status_check
      check (portal_status in ('pending', 'active'));
  end if;
end $$;

create table if not exists public.independent_client_portal_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  client_gym_membership_id uuid references public.client_gym_memberships(id) on delete cascade,
  portal_scope text not null default 'independent',
  session_date date not null default current_date,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_portal_scope_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_portal_scope_check
      check (portal_scope in ('gym', 'independent'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'training_sessions_status_check'
      and conrelid = 'public.training_sessions'::regclass
  ) then
    alter table public.training_sessions
      add constraint training_sessions_status_check
      check (status in ('in_progress', 'completed'));
  end if;
end $$;

create table if not exists public.training_session_sets (
  id uuid primary key default gen_random_uuid(),
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  exercise_name text not null,
  exercise_order integer not null check (exercise_order >= 0),
  set_number integer not null check (set_number > 0),
  planned_reps text,
  actual_reps integer check (actual_reps >= 0),
  rir integer check (rir >= 0 and rir <= 10),
  load numeric(8,2),
  load_unit text not null default 'kg',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_session_id, routine_day_id, exercise_order, set_number)
);

create index if not exists idx_independent_client_portal_access_user on public.independent_client_portal_access(user_id);
create index if not exists idx_independent_client_portal_access_client on public.independent_client_portal_access(client_id);
create index if not exists idx_training_sessions_client_started on public.training_sessions(client_id, started_at desc);
create index if not exists idx_training_sessions_coach_started on public.training_sessions(coach_id, started_at desc);
create index if not exists idx_training_session_sets_session on public.training_session_sets(training_session_id, exercise_order, set_number);

commit;
