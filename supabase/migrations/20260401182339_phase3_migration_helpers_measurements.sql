-- Phase 3 - helper function for safe measurement migration (vertical slices)
-- Project: bzhqprxolseyxuuwodqs

create or replace function public.migration_upsert_measurement(
  p_firebase_project_id text,
  p_coach_firebase_uid text,
  p_firebase_client_id text,
  p_firebase_measurement_id text,
  p_date date,
  p_weight numeric,
  p_height numeric,
  p_bmi numeric,
  p_firebase_routine_id text default null,
  p_body_fat_percentage numeric default null,
  p_muscle_mass numeric default null,
  p_visceral_fat numeric default null,
  p_metabolic_age numeric default null,
  p_calories numeric default null,
  p_bone_mass numeric default null,
  p_water_percentage numeric default null,
  p_waist numeric default null,
  p_hips numeric default null,
  p_chest numeric default null,
  p_arms numeric default null,
  p_legs numeric default null,
  p_calf numeric default null,
  p_thigh numeric default null,
  p_notes text default null,
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
  v_client_doc_path text;
  v_client_id uuid;
  v_routine_id uuid;
  v_routine_doc_path text;
  v_doc_path text;
  v_measurement_id uuid;
  v_date date;
  v_weight numeric;
  v_height numeric;
  v_bmi numeric;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_coach_firebase_uid), '') = '' then
    raise exception 'coach_firebase_uid is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_client_id), '') = '' then
    raise exception 'firebase_client_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_measurement_id), '') = '' then
    raise exception 'firebase_measurement_id is required' using errcode = '22023';
  end if;

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

  v_routine_id := null;
  if coalesce(trim(coalesce(p_firebase_routine_id, '')), '') <> '' then
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
  end if;

  v_date := coalesce(p_date, current_date);
  v_weight := coalesce(p_weight, 0);
  v_height := coalesce(p_height, 0);
  v_bmi := coalesce(
    p_bmi,
    case
      when v_height > 0 then round((v_weight / power(v_height / 100.0, 2))::numeric, 2)
      else 0
    end
  );

  v_doc_path := format(
    'coaches/%s/clients/%s/measurements/%s',
    p_coach_firebase_uid,
    p_firebase_client_id,
    p_firebase_measurement_id
  );

  select m.supabase_id
  into v_measurement_id
  from public.migration_id_map m
  where m.entity_type = 'measurement'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_doc_path = v_doc_path
    and m.firebase_doc_id = p_firebase_measurement_id
    and m.supabase_table = 'measurements'
  limit 1;

  if v_measurement_id is not null and exists(select 1 from public.measurements mm where mm.id = v_measurement_id) then
    update public.measurements mm
    set
      client_id = v_client_id,
      routine_id = v_routine_id,
      date = v_date,
      weight = v_weight,
      height = v_height,
      bmi = v_bmi,
      body_fat_percentage = p_body_fat_percentage,
      muscle_mass = p_muscle_mass,
      visceral_fat = p_visceral_fat,
      metabolic_age = p_metabolic_age,
      calories = p_calories,
      bone_mass = p_bone_mass,
      water_percentage = p_water_percentage,
      waist = p_waist,
      hips = p_hips,
      chest = p_chest,
      arms = p_arms,
      legs = p_legs,
      calf = p_calf,
      thigh = p_thigh,
      notes = nullif(trim(coalesce(p_notes, '')), '')
    where mm.id = v_measurement_id;
  else
    v_measurement_id := null;
  end if;

  if v_measurement_id is null then
    insert into public.measurements (
      client_id,
      routine_id,
      date,
      weight,
      height,
      bmi,
      body_fat_percentage,
      muscle_mass,
      visceral_fat,
      metabolic_age,
      calories,
      bone_mass,
      water_percentage,
      waist,
      hips,
      chest,
      arms,
      legs,
      calf,
      thigh,
      notes,
      created_at
    ) values (
      v_client_id,
      v_routine_id,
      v_date,
      v_weight,
      v_height,
      v_bmi,
      p_body_fat_percentage,
      p_muscle_mass,
      p_visceral_fat,
      p_metabolic_age,
      p_calories,
      p_bone_mass,
      p_water_percentage,
      p_waist,
      p_hips,
      p_chest,
      p_arms,
      p_legs,
      p_calf,
      p_thigh,
      nullif(trim(coalesce(p_notes, '')), ''),
      coalesce(p_created_at, now())
    )
    returning id into v_measurement_id;
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
    'measurement',
    p_firebase_project_id,
    p_coach_firebase_uid,
    v_doc_path,
    p_firebase_measurement_id,
    'measurements',
    v_measurement_id,
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

  return v_measurement_id;
end;
$$;

revoke all on function public.migration_upsert_measurement(text, text, text, text, date, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, timestamptz, uuid, jsonb) from public;
revoke all on function public.migration_upsert_measurement(text, text, text, text, date, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, timestamptz, uuid, jsonb) from anon;
revoke all on function public.migration_upsert_measurement(text, text, text, text, date, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, timestamptz, uuid, jsonb) from authenticated;;
