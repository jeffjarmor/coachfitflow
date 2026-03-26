-- CoachFitFlow - Supabase/PostgreSQL schema v1
-- Generated from current Firestore-based codebase structure.

create extension if not exists pgcrypto;

-- =========================
-- ENUMS
-- =========================
do $$ begin
  create type coach_role as enum ('admin', 'coach', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type account_type as enum ('independent', 'gym');
exception when duplicate_object then null; end $$;

do $$ begin
  create type gym_staff_role as enum ('owner', 'trainer', 'receptionist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('active', 'inactive', 'pending', 'overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type portal_status as enum ('pending', 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type exercise_source as enum ('global', 'coach');
exception when duplicate_object then null; end $$;

-- =========================
-- CORE TABLES
-- =========================
create table if not exists public.coaches (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  phone text,
  logo_url text,
  brand_color text,
  role coach_role not null default 'coach',
  gym_id uuid,
  account_type account_type not null default 'independent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  logo_url text,
  brand_color text,
  access_code text not null unique,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coaches_gym_id_fkey'
      and conrelid = 'public.coaches'::regclass
  ) then
    alter table public.coaches
      add constraint coaches_gym_id_fkey
      foreign key (gym_id) references public.gyms(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'gyms_owner_id_fkey'
      and conrelid = 'public.gyms'::regclass
  ) then
    alter table public.gyms
      add constraint gyms_owner_id_fkey
      foreign key (owner_id) references public.coaches(id) on delete set null;
  end if;
end $$;

create table if not exists public.gym_staff (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  role gym_staff_role not null default 'trainer',
  can_edit_clients boolean not null default true,
  can_create_routines boolean not null default true,
  can_view_payments boolean not null default false,
  can_manage_staff boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (gym_id, coach_id)
);

create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null,
  currency text not null default 'CRC',
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  coach_id uuid not null references public.coaches(id) on delete restrict,
  gym_id uuid references public.gyms(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  birth_date date,
  age integer not null check (age >= 0),
  weight numeric(6,2) not null check (weight > 0),
  height numeric(6,2) not null check (height > 0),
  goal text not null,
  notes text,
  address text,
  next_payment_due_date timestamptz,
  subscription_status subscription_status not null default 'pending',
  membership_plan_id uuid references public.membership_plans(id) on delete set null,
  portal_status portal_status not null default 'pending',
  portal_invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  membership_plan_id uuid references public.membership_plans(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'CRC',
  method text,
  due_date timestamptz not null,
  paid_date timestamptz,
  status payment_status not null default 'pending',
  notes text,
  created_by uuid references public.coaches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null,
  source exercise_source not null,
  coach_id uuid references public.coaches(id) on delete set null,
  image_url text,
  video_url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_source_owner_ck check (
    (source = 'global' and coach_id is null)
    or
    (source = 'coach' and coach_id is not null)
  )
);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  objective text not null,
  training_days_count integer not null check (training_days_count >= 0),
  duration_weeks integer not null check (duration_weeks > 0),
  start_date date,
  end_date date,
  notes text,
  warmup_enabled boolean not null default false,
  warmup_custom_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.routine_days (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  day_name text not null,
  muscle_groups text[] not null default '{}',
  notes text,
  unique (routine_id, day_number)
);

create table if not exists public.routine_day_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references public.routine_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  sets integer not null check (sets > 0),
  reps text not null,
  rest text not null,
  notes text,
  is_superset boolean not null default false,
  video_url text,
  image_url text,
  order_index integer not null check (order_index >= 0),
  unique (routine_day_id, order_index)
);

create table if not exists public.routine_week_configs (
  id uuid primary key default gen_random_uuid(),
  routine_day_exercise_id uuid not null references public.routine_day_exercises(id) on delete cascade,
  start_week integer not null check (start_week > 0),
  end_week integer not null check (end_week >= start_week),
  sets integer not null check (sets > 0),
  reps text not null,
  rest text not null,
  notes text
);

create table if not exists public.routine_warmup_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  order_index integer not null check (order_index >= 0),
  unique (routine_id, order_index)
);

create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  date date not null,
  weight numeric(6,2) not null,
  height numeric(6,2) not null,
  bmi numeric(6,2) not null,
  body_fat_percentage numeric(6,2),
  muscle_mass numeric(6,2),
  visceral_fat numeric(6,2),
  metabolic_age numeric(6,2),
  calories numeric(8,2),
  bone_mass numeric(6,2),
  water_percentage numeric(6,2),
  waist numeric(6,2),
  hips numeric(6,2),
  chest numeric(6,2),
  arms numeric(6,2),
  legs numeric(6,2),
  calf numeric(6,2),
  thigh numeric(6,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.gym_client_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  gym_name_snapshot text,
  created_at timestamptz not null default now(),
  unique (gym_id, client_id)
);

-- =========================
-- INDEXES
-- =========================
create index if not exists idx_clients_coach_id on public.clients(coach_id);
create index if not exists idx_clients_gym_id on public.clients(gym_id);
create index if not exists idx_clients_user_id on public.clients(user_id);
create index if not exists idx_payments_client_due_date on public.payments(client_id, due_date desc);
create index if not exists idx_payments_status_due_date on public.payments(status, due_date);
create index if not exists idx_routines_client_id on public.routines(client_id);
create index if not exists idx_routines_coach_id on public.routines(coach_id);
create index if not exists idx_measurements_client_date on public.measurements(client_id, date desc);
create index if not exists idx_exercises_source_coach on public.exercises(source, coach_id);
