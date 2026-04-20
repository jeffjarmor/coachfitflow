-- Phase 3 - helper functions for safe client/routine migration (vertical slices)
-- Project: bzhqprxolseyxuuwodqs
-- Notes:
-- - SECURITY DEFINER helpers (blocked for anon/authenticated)
-- - Idempotent through public.migration_id_map
-- - Designed for Firebase -> Supabase progressive migration

create or replace function public.migration_resolve_coach_id(
  p_firebase_project_id text,
  p_coach_firebase_uid text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_coach_id uuid;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_coach_firebase_uid), '') = '' then
    raise exception 'coach_firebase_uid is required' using errcode = '22023';
  end if;

  select m.supabase_id
  into v_coach_id
  from public.migration_id_map m
  where m.entity_type = 'coach'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_uid = p_coach_firebase_uid
    and m.supabase_table = 'coaches'
  limit 1;

  if v_coach_id is null then
    raise exception 'Coach mapping not found for firebase_uid %', p_coach_firebase_uid using errcode = '22023';
  end if;

  if not exists (select 1 from public.coaches c where c.id = v_coach_id) then
    raise exception 'Mapped coach_id % does not exist in public.coaches', v_coach_id using errcode = '23503';
  end if;

  return v_coach_id;
end;
$$;

create or replace function public.migration_upsert_exercise(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_exercise_id text,
  p_name text,
  p_muscle_group text,
  p_source text,
  p_video_url text default null,
  p_image_url text default null,
  p_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_doc_path text;
  v_exercise_id uuid;
  v_source exercise_source;
  v_coach_id uuid;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_exercise_id), '') = '' then
    raise exception 'firebase_exercise_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'exercise name is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_muscle_group), '') = '' then
    raise exception 'exercise muscle_group is required' using errcode = '22023';
  end if;

  v_source := case lower(coalesce(trim(p_source), 'global'))
    when 'coach' then 'coach'::exercise_source
    else 'global'::exercise_source
  end;

  if v_source = 'coach'::exercise_source then
    v_coach_id := public.migration_resolve_coach_id(p_firebase_project_id, p_coach_firebase_uid);
    v_doc_path := format('coaches/%s/exercises/%s', p_coach_firebase_uid, p_firebase_exercise_id);
  else
    v_coach_id := null;
    v_doc_path := format('globalExercises/%s', p_firebase_exercise_id);
  end if;

  select m.supabase_id
  into v_exercise_id
  from public.migration_id_map m
  where m.entity_type = 'exercise'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = p_firebase_exercise_id
    and m.supabase_table = 'exercises'
  limit 1;

  if v_exercise_id is not null and exists(select 1 from public.exercises e where e.id = v_exercise_id) then
    update public.exercises e
    set
      name = trim(p_name),
      muscle_group = trim(p_muscle_group),
      source = v_source,
      coach_id = v_coach_id,
      video_url = nullif(trim(coalesce(p_video_url, '')), ''),
      image_url = nullif(trim(coalesce(p_image_url, '')), ''),
      updated_at = now()
    where e.id = v_exercise_id;
  else
    v_exercise_id := null;
  end if;

  if v_exercise_id is null then
    insert into public.exercises (
      name,
      muscle_group,
      source,
      coach_id,
      video_url,
      image_url,
      created_at,
      updated_at
    ) values (
      trim(p_name),
      trim(p_muscle_group),
      v_source,
      v_coach_id,
      nullif(trim(coalesce(p_video_url, '')), ''),
      nullif(trim(coalesce(p_image_url, '')), ''),
      now(),
      now()
    )
    returning id into v_exercise_id;
  end if;

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    run_id,
    payload,
    created_at,
    updated_at
  ) values (
    'exercise',
    p_firebase_project_id,
    case when v_source = 'coach'::exercise_source then p_coach_firebase_uid else null end,
    v_doc_path,
    p_firebase_exercise_id,
    'exercises',
    v_exercise_id,
    'by_firebase_doc_path',
    0.95,
    p_run_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    firebase_uid = excluded.firebase_uid,
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    run_id = coalesce(excluded.run_id, public.migration_id_map.run_id),
    payload = excluded.payload,
    updated_at = now();

  return v_exercise_id;
end;
$$;

create or replace function public.migration_upsert_client(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_client_id text,
  p_name text,
  p_email text,
  p_phone text default null,
  p_birth_date date default null,
  p_age integer default 0,
  p_weight numeric default null,
  p_height numeric default null,
  p_goal text default '-',
  p_notes text default null,
  p_address text default null,
  p_created_at timestamptz default null,
  p_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_coach_id uuid;
  v_doc_path text;
  v_client_id uuid;
  v_name text;
  v_email text;
  v_weight numeric;
  v_height numeric;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_client_id), '') = '' then
    raise exception 'firebase_client_id is required' using errcode = '22023';
  end if;

  v_coach_id := public.migration_resolve_coach_id(p_firebase_project_id, p_coach_firebase_uid);
  v_doc_path := format('coaches/%s/clients/%s', p_coach_firebase_uid, p_firebase_client_id);

  v_name := trim(coalesce(p_name, ''));
  if v_name = '' then
    v_name := 'Cliente sin nombre';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    v_email := format('no-email+%s@migration.local', p_firebase_client_id);
  end if;

  -- Supabase constraints require weight/height > 0. Firebase often stores 0 as
  -- "unknown", so normalize non-positive values to NULL during migration.
  v_weight := case
    when p_weight is null or p_weight <= 0 then null
    else p_weight
  end;

  v_height := case
    when p_height is null or p_height <= 0 then null
    else p_height
  end;

  select m.supabase_id
  into v_client_id
  from public.migration_id_map m
  where m.entity_type = 'client'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = p_firebase_client_id
    and m.supabase_table = 'clients'
  limit 1;

  if v_client_id is not null and exists(select 1 from public.clients c where c.id = v_client_id) then
    update public.clients c
    set
      name = v_name,
      email = v_email,
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      birth_date = p_birth_date,
      age = greatest(coalesce(p_age, 0), 0),
      weight = v_weight,
      height = v_height,
      goal = coalesce(nullif(trim(coalesce(p_goal, '')), ''), '-'),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      address = nullif(trim(coalesce(p_address, '')), ''),
      primary_coach_id = v_coach_id,
      updated_at = now()
    where c.id = v_client_id;
  else
    v_client_id := null;
  end if;

  if v_client_id is null then
    select c.id
    into v_client_id
    from public.clients c
    where lower(c.email) = v_email
      and c.primary_coach_id = v_coach_id
    limit 1;

    if v_client_id is not null then
      update public.clients c
      set
        name = v_name,
        phone = nullif(trim(coalesce(p_phone, '')), ''),
        birth_date = p_birth_date,
        age = greatest(coalesce(p_age, 0), 0),
        weight = v_weight,
        height = v_height,
        goal = coalesce(nullif(trim(coalesce(p_goal, '')), ''), '-'),
        notes = nullif(trim(coalesce(p_notes, '')), ''),
        address = nullif(trim(coalesce(p_address, '')), ''),
        updated_at = now()
      where c.id = v_client_id;
    end if;
  end if;

  if v_client_id is null then
    insert into public.clients (
      name,
      email,
      phone,
      birth_date,
      age,
      weight,
      height,
      goal,
      notes,
      address,
      primary_coach_id,
      created_at,
      updated_at
    ) values (
      v_name,
      v_email,
      nullif(trim(coalesce(p_phone, '')), ''),
      p_birth_date,
      greatest(coalesce(p_age, 0), 0),
      v_weight,
      v_height,
      coalesce(nullif(trim(coalesce(p_goal, '')), ''), '-'),
      nullif(trim(coalesce(p_notes, '')), ''),
      nullif(trim(coalesce(p_address, '')), ''),
      v_coach_id,
      coalesce(p_created_at, now()),
      now()
    )
    returning id into v_client_id;
  end if;

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    run_id,
    payload,
    created_at,
    updated_at
  ) values (
    'client',
    p_firebase_project_id,
    p_coach_firebase_uid,
    v_doc_path,
    p_firebase_client_id,
    'clients',
    v_client_id,
    'by_firebase_doc_path',
    0.95,
    p_run_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    firebase_uid = excluded.firebase_uid,
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    run_id = coalesce(excluded.run_id, public.migration_id_map.run_id),
    payload = excluded.payload,
    updated_at = now();

  return v_client_id;
end;
$$;

create or replace function public.migration_upsert_routine(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_routine_id text,
  p_firebase_client_id text,
  p_name text,
  p_objective text default '-',
  p_training_days_count integer default 0,
  p_duration_weeks integer default 1,
  p_start_date date default null,
  p_end_date date default null,
  p_notes text default null,
  p_warmup_enabled boolean default false,
  p_warmup_custom_text text default null,
  p_created_at timestamptz default null,
  p_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_coach_id uuid;
  v_client_doc_path text;
  v_client_id uuid;
  v_doc_path text;
  v_routine_id uuid;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_routine_id), '') = '' then
    raise exception 'firebase_routine_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_client_id), '') = '' then
    raise exception 'firebase_client_id is required' using errcode = '22023';
  end if;

  v_coach_id := public.migration_resolve_coach_id(p_firebase_project_id, p_coach_firebase_uid);

  v_client_doc_path := format('coaches/%s/clients/%s', p_coach_firebase_uid, p_firebase_client_id);
  select m.supabase_id
  into v_client_id
  from public.migration_id_map m
  where m.entity_type = 'client'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_client_doc_path
    and m.firebase_doc_id = p_firebase_client_id
    and m.supabase_table = 'clients'
  limit 1;

  if v_client_id is null then
    raise exception 'Client mapping not found for %', v_client_doc_path using errcode = '22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s', p_coach_firebase_uid, p_firebase_routine_id);

  select m.supabase_id
  into v_routine_id
  from public.migration_id_map m
  where m.entity_type = 'routine'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = p_firebase_routine_id
    and m.supabase_table = 'routines'
  limit 1;

  if v_routine_id is not null and exists(select 1 from public.routines r where r.id = v_routine_id) then
    update public.routines r
    set
      coach_id = v_coach_id,
      client_id = v_client_id,
      name = coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Rutina'),
      objective = coalesce(nullif(trim(coalesce(p_objective, '')), ''), '-'),
      training_days_count = greatest(coalesce(p_training_days_count, 0), 0),
      duration_weeks = greatest(coalesce(p_duration_weeks, 1), 1),
      start_date = p_start_date,
      end_date = p_end_date,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      warmup_enabled = coalesce(p_warmup_enabled, false),
      warmup_custom_text = nullif(trim(coalesce(p_warmup_custom_text, '')), ''),
      updated_at = now()
    where r.id = v_routine_id;
  else
    v_routine_id := null;
  end if;

  if v_routine_id is null then
    insert into public.routines (
      coach_id,
      client_id,
      name,
      objective,
      training_days_count,
      duration_weeks,
      start_date,
      end_date,
      notes,
      warmup_enabled,
      warmup_custom_text,
      created_at,
      updated_at
    ) values (
      v_coach_id,
      v_client_id,
      coalesce(nullif(trim(coalesce(p_name, '')), ''), 'Rutina'),
      coalesce(nullif(trim(coalesce(p_objective, '')), ''), '-'),
      greatest(coalesce(p_training_days_count, 0), 0),
      greatest(coalesce(p_duration_weeks, 1), 1),
      p_start_date,
      p_end_date,
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_warmup_enabled, false),
      nullif(trim(coalesce(p_warmup_custom_text, '')), ''),
      coalesce(p_created_at, now()),
      now()
    )
    returning id into v_routine_id;
  end if;

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    run_id,
    payload,
    created_at,
    updated_at
  ) values (
    'routine',
    p_firebase_project_id,
    p_coach_firebase_uid,
    v_doc_path,
    p_firebase_routine_id,
    'routines',
    v_routine_id,
    'by_firebase_doc_path',
    0.95,
    p_run_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    firebase_uid = excluded.firebase_uid,
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    run_id = coalesce(excluded.run_id, public.migration_id_map.run_id),
    payload = excluded.payload,
    updated_at = now();

  return v_routine_id;
end;
$$;

create or replace function public.migration_upsert_routine_day(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_routine_id text,
  p_firebase_day_id text,
  p_day_number integer,
  p_day_name text,
  p_muscle_groups text[] default '{}'::text[],
  p_notes text default null,
  p_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_routine_doc_path text;
  v_routine_id uuid;
  v_doc_path text;
  v_day_id uuid;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_routine_id), '') = '' then
    raise exception 'firebase_routine_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_day_id), '') = '' then
    raise exception 'firebase_day_id is required' using errcode = '22023';
  end if;

  v_routine_doc_path := format('coaches/%s/routines/%s', p_coach_firebase_uid, p_firebase_routine_id);
  select m.supabase_id
  into v_routine_id
  from public.migration_id_map m
  where m.entity_type = 'routine'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_routine_doc_path
    and m.firebase_doc_id = p_firebase_routine_id
    and m.supabase_table = 'routines'
  limit 1;

  if v_routine_id is null then
    raise exception 'Routine mapping not found for %', v_routine_doc_path using errcode = '22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s/days/%s', p_coach_firebase_uid, p_firebase_routine_id, p_firebase_day_id);

  select m.supabase_id
  into v_day_id
  from public.migration_id_map m
  where m.entity_type = 'routine_day'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = p_firebase_day_id
    and m.supabase_table = 'routine_days'
  limit 1;

  if v_day_id is not null and exists(select 1 from public.routine_days d where d.id = v_day_id) then
    update public.routine_days d
    set
      routine_id = v_routine_id,
      day_number = greatest(coalesce(p_day_number, 1), 1),
      day_name = coalesce(nullif(trim(coalesce(p_day_name, '')), ''), format('Día %s', greatest(coalesce(p_day_number, 1), 1))),
      muscle_groups = coalesce(p_muscle_groups, '{}'::text[]),
      notes = nullif(trim(coalesce(p_notes, '')), '')
    where d.id = v_day_id;
  else
    v_day_id := null;
  end if;

  if v_day_id is null then
    insert into public.routine_days (
      routine_id,
      day_number,
      day_name,
      muscle_groups,
      notes
    ) values (
      v_routine_id,
      greatest(coalesce(p_day_number, 1), 1),
      coalesce(nullif(trim(coalesce(p_day_name, '')), ''), format('Día %s', greatest(coalesce(p_day_number, 1), 1))),
      coalesce(p_muscle_groups, '{}'::text[]),
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning id into v_day_id;
  end if;

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    run_id,
    payload,
    created_at,
    updated_at
  ) values (
    'routine_day',
    p_firebase_project_id,
    p_coach_firebase_uid,
    v_doc_path,
    p_firebase_day_id,
    'routine_days',
    v_day_id,
    'by_firebase_doc_path',
    0.95,
    p_run_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    firebase_uid = excluded.firebase_uid,
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    run_id = coalesce(excluded.run_id, public.migration_id_map.run_id),
    payload = excluded.payload,
    updated_at = now();

  return v_day_id;
end;
$$;

create or replace function public.migration_upsert_routine_day_exercise(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_routine_id text,
  p_firebase_day_id text,
  p_order_index integer,
  p_firebase_exercise_id text,
  p_exercise_source text,
  p_sets integer,
  p_reps text,
  p_rest text,
  p_notes text default null,
  p_is_superset boolean default false,
  p_video_url text default null,
  p_image_url text default null,
  p_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_day_doc_path text;
  v_day_id uuid;
  v_exercise_doc_path text;
  v_exercise_id uuid;
  v_doc_path text;
  v_row_id uuid;
  v_order integer := greatest(coalesce(p_order_index, 0), 0);
  v_sets integer := greatest(coalesce(p_sets, 1), 1);
  v_source exercise_source;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_day_id), '') = '' then
    raise exception 'firebase_day_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_exercise_id), '') = '' then
    raise exception 'firebase_exercise_id is required' using errcode = '22023';
  end if;

  v_source := case lower(coalesce(trim(p_exercise_source), 'global'))
    when 'coach' then 'coach'::exercise_source
    else 'global'::exercise_source
  end;

  v_day_doc_path := format('coaches/%s/routines/%s/days/%s', p_coach_firebase_uid, p_firebase_routine_id, p_firebase_day_id);
  select m.supabase_id
  into v_day_id
  from public.migration_id_map m
  where m.entity_type = 'routine_day'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_day_doc_path
    and m.firebase_doc_id = p_firebase_day_id
    and m.supabase_table = 'routine_days'
  limit 1;

  if v_day_id is null then
    raise exception 'Routine day mapping not found for %', v_day_doc_path using errcode = '22023';
  end if;

  if v_source = 'coach'::exercise_source then
    v_exercise_doc_path := format('coaches/%s/exercises/%s', p_coach_firebase_uid, p_firebase_exercise_id);
  else
    v_exercise_doc_path := format('globalExercises/%s', p_firebase_exercise_id);
  end if;

  select m.supabase_id
  into v_exercise_id
  from public.migration_id_map m
  where m.entity_type = 'exercise'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_exercise_doc_path
    and m.firebase_doc_id = p_firebase_exercise_id
    and m.supabase_table = 'exercises'
  limit 1;

  if v_exercise_id is null then
    raise exception 'Exercise mapping not found for %', v_exercise_doc_path using errcode = '22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s/days/%s/exercises/%s', p_coach_firebase_uid, p_firebase_routine_id, p_firebase_day_id, v_order);

  select m.supabase_id
  into v_row_id
  from public.migration_id_map m
  where m.entity_type = 'routine_day_exercise'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = v_order::text
    and m.supabase_table = 'routine_day_exercises'
  limit 1;

  if v_row_id is not null and exists(select 1 from public.routine_day_exercises rde where rde.id = v_row_id) then
    update public.routine_day_exercises rde
    set
      routine_day_id = v_day_id,
      exercise_id = v_exercise_id,
      sets = v_sets,
      reps = coalesce(nullif(trim(coalesce(p_reps, '')), ''), '-'),
      rest = coalesce(nullif(trim(coalesce(p_rest, '')), ''), '-'),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      is_superset = coalesce(p_is_superset, false),
      video_url = nullif(trim(coalesce(p_video_url, '')), ''),
      image_url = nullif(trim(coalesce(p_image_url, '')), ''),
      order_index = v_order
    where rde.id = v_row_id;
  else
    v_row_id := null;
  end if;

  if v_row_id is null then
    insert into public.routine_day_exercises (
      routine_day_id,
      exercise_id,
      sets,
      reps,
      rest,
      notes,
      is_superset,
      video_url,
      image_url,
      order_index
    ) values (
      v_day_id,
      v_exercise_id,
      v_sets,
      coalesce(nullif(trim(coalesce(p_reps, '')), ''), '-'),
      coalesce(nullif(trim(coalesce(p_rest, '')), ''), '-'),
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_is_superset, false),
      nullif(trim(coalesce(p_video_url, '')), ''),
      nullif(trim(coalesce(p_image_url, '')), ''),
      v_order
    )
    returning id into v_row_id;
  end if;

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    run_id,
    payload,
    created_at,
    updated_at
  ) values (
    'routine_day_exercise',
    p_firebase_project_id,
    p_coach_firebase_uid,
    v_doc_path,
    v_order::text,
    'routine_day_exercises',
    v_row_id,
    'by_firebase_doc_path',
    0.95,
    p_run_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    firebase_uid = excluded.firebase_uid,
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    run_id = coalesce(excluded.run_id, public.migration_id_map.run_id),
    payload = excluded.payload,
    updated_at = now();

  return v_row_id;
end;
$$;

create or replace function public.migration_upsert_routine_warmup_exercise(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_routine_id text,
  p_order_index integer,
  p_firebase_exercise_id text,
  p_exercise_source text,
  p_run_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_routine_doc_path text;
  v_routine_id uuid;
  v_exercise_doc_path text;
  v_exercise_id uuid;
  v_doc_path text;
  v_row_id uuid;
  v_order integer := greatest(coalesce(p_order_index, 0), 0);
  v_source exercise_source;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_routine_id), '') = '' then
    raise exception 'firebase_routine_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_exercise_id), '') = '' then
    raise exception 'firebase_exercise_id is required' using errcode = '22023';
  end if;

  v_source := case lower(coalesce(trim(p_exercise_source), 'global'))
    when 'coach' then 'coach'::exercise_source
    else 'global'::exercise_source
  end;

  v_routine_doc_path := format('coaches/%s/routines/%s', p_coach_firebase_uid, p_firebase_routine_id);
  select m.supabase_id
  into v_routine_id
  from public.migration_id_map m
  where m.entity_type = 'routine'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_routine_doc_path
    and m.firebase_doc_id = p_firebase_routine_id
    and m.supabase_table = 'routines'
  limit 1;

  if v_routine_id is null then
    raise exception 'Routine mapping not found for %', v_routine_doc_path using errcode = '22023';
  end if;

  if v_source = 'coach'::exercise_source then
    v_exercise_doc_path := format('coaches/%s/exercises/%s', p_coach_firebase_uid, p_firebase_exercise_id);
  else
    v_exercise_doc_path := format('globalExercises/%s', p_firebase_exercise_id);
  end if;

  select m.supabase_id
  into v_exercise_id
  from public.migration_id_map m
  where m.entity_type = 'exercise'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_exercise_doc_path
    and m.firebase_doc_id = p_firebase_exercise_id
    and m.supabase_table = 'exercises'
  limit 1;

  if v_exercise_id is null then
    raise exception 'Exercise mapping not found for %', v_exercise_doc_path using errcode = '22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s/warmup/%s', p_coach_firebase_uid, p_firebase_routine_id, v_order);

  select m.supabase_id
  into v_row_id
  from public.migration_id_map m
  where m.entity_type = 'routine_warmup_exercise'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = v_order::text
    and m.supabase_table = 'routine_warmup_exercises'
  limit 1;

  if v_row_id is not null and exists(select 1 from public.routine_warmup_exercises rwe where rwe.id = v_row_id) then
    update public.routine_warmup_exercises rwe
    set
      routine_id = v_routine_id,
      exercise_id = v_exercise_id,
      order_index = v_order
    where rwe.id = v_row_id;
  else
    v_row_id := null;
  end if;

  if v_row_id is null then
    insert into public.routine_warmup_exercises (
      routine_id,
      exercise_id,
      order_index
    ) values (
      v_routine_id,
      v_exercise_id,
      v_order
    )
    returning id into v_row_id;
  end if;

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    run_id,
    payload,
    created_at,
    updated_at
  ) values (
    'routine_warmup_exercise',
    p_firebase_project_id,
    p_coach_firebase_uid,
    v_doc_path,
    v_order::text,
    'routine_warmup_exercises',
    v_row_id,
    'by_firebase_doc_path',
    0.95,
    p_run_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    firebase_uid = excluded.firebase_uid,
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    run_id = coalesce(excluded.run_id, public.migration_id_map.run_id),
    payload = excluded.payload,
    updated_at = now();

  return v_row_id;
end;
$$;

revoke all on function public.migration_resolve_coach_id(text, text) from public;
revoke all on function public.migration_upsert_exercise(text, text, text, text, text, text, text, text, uuid, jsonb) from public;
revoke all on function public.migration_upsert_client(text, text, text, text, text, text, date, integer, numeric, numeric, text, text, text, timestamptz, uuid, jsonb) from public;
revoke all on function public.migration_upsert_routine(text, text, text, text, text, text, integer, integer, date, date, text, boolean, text, timestamptz, uuid, jsonb) from public;
revoke all on function public.migration_upsert_routine_day(text, text, text, text, integer, text, text[], text, uuid, jsonb) from public;
revoke all on function public.migration_upsert_routine_day_exercise(text, text, text, text, integer, text, text, integer, text, text, text, boolean, text, text, uuid, jsonb) from public;
revoke all on function public.migration_upsert_routine_warmup_exercise(text, text, text, integer, text, text, uuid, jsonb) from public;

revoke all on function public.migration_resolve_coach_id(text, text) from anon;
revoke all on function public.migration_upsert_exercise(text, text, text, text, text, text, text, text, uuid, jsonb) from anon;
revoke all on function public.migration_upsert_client(text, text, text, text, text, text, date, integer, numeric, numeric, text, text, text, timestamptz, uuid, jsonb) from anon;
revoke all on function public.migration_upsert_routine(text, text, text, text, text, text, integer, integer, date, date, text, boolean, text, timestamptz, uuid, jsonb) from anon;
revoke all on function public.migration_upsert_routine_day(text, text, text, text, integer, text, text[], text, uuid, jsonb) from anon;
revoke all on function public.migration_upsert_routine_day_exercise(text, text, text, text, integer, text, text, integer, text, text, text, boolean, text, text, uuid, jsonb) from anon;
revoke all on function public.migration_upsert_routine_warmup_exercise(text, text, text, integer, text, text, uuid, jsonb) from anon;

revoke all on function public.migration_resolve_coach_id(text, text) from authenticated;
revoke all on function public.migration_upsert_exercise(text, text, text, text, text, text, text, text, uuid, jsonb) from authenticated;
revoke all on function public.migration_upsert_client(text, text, text, text, text, text, date, integer, numeric, numeric, text, text, text, timestamptz, uuid, jsonb) from authenticated;
revoke all on function public.migration_upsert_routine(text, text, text, text, text, text, integer, integer, date, date, text, boolean, text, timestamptz, uuid, jsonb) from authenticated;
revoke all on function public.migration_upsert_routine_day(text, text, text, text, integer, text, text[], text, uuid, jsonb) from authenticated;
revoke all on function public.migration_upsert_routine_day_exercise(text, text, text, text, integer, text, text, integer, text, text, text, boolean, text, text, uuid, jsonb) from authenticated;
revoke all on function public.migration_upsert_routine_warmup_exercise(text, text, text, integer, text, text, uuid, jsonb) from authenticated;
