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
  v_source exercise_source;
  v_order integer := greatest(coalesce(p_order_index,0),0);
  v_sets integer := greatest(coalesce(p_sets,1),1);
begin
  v_source := case when lower(coalesce(p_exercise_source,'global'))='coach' then 'coach'::exercise_source else 'global'::exercise_source end;

  v_day_doc_path := format('coaches/%s/routines/%s/days/%s', p_coach_firebase_uid, p_firebase_routine_id, p_firebase_day_id);
  select m.supabase_id into v_day_id
  from public.migration_id_map m
  where m.entity_type='routine_day'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_day_doc_path
    and m.firebase_doc_id=p_firebase_day_id
    and m.supabase_table='routine_days'
  limit 1;

  if v_day_id is null then
    raise exception 'Routine day mapping not found for %', v_day_doc_path using errcode='22023';
  end if;

  if v_source='coach'::exercise_source then
    v_exercise_doc_path := format('coaches/%s/exercises/%s', p_coach_firebase_uid, p_firebase_exercise_id);
  else
    v_exercise_doc_path := format('globalExercises/%s', p_firebase_exercise_id);
  end if;

  select m.supabase_id into v_exercise_id
  from public.migration_id_map m
  where m.entity_type='exercise'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_exercise_doc_path
    and m.firebase_doc_id=p_firebase_exercise_id
    and m.supabase_table='exercises'
  limit 1;

  if v_exercise_id is null then
    raise exception 'Exercise mapping not found for %', v_exercise_doc_path using errcode='22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s/days/%s/exercises/%s', p_coach_firebase_uid, p_firebase_routine_id, p_firebase_day_id, v_order);

  select m.supabase_id into v_row_id
  from public.migration_id_map m
  where m.entity_type='routine_day_exercise'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_doc_path
    and m.firebase_doc_id=v_order::text
    and m.supabase_table='routine_day_exercises'
  limit 1;

  if v_row_id is not null and exists(select 1 from public.routine_day_exercises r where r.id=v_row_id) then
    update public.routine_day_exercises
    set routine_day_id=v_day_id,
        exercise_id=v_exercise_id,
        sets=v_sets,
        reps=coalesce(nullif(trim(coalesce(p_reps,'')),''),'-'),
        rest=coalesce(nullif(trim(coalesce(p_rest,'')),''),'-'),
        notes=nullif(trim(coalesce(p_notes,'')),''),
        is_superset=coalesce(p_is_superset,false),
        video_url=nullif(trim(coalesce(p_video_url,'')),''),
        image_url=nullif(trim(coalesce(p_image_url,'')),''),
        order_index=v_order
    where id=v_row_id;
  else
    insert into public.routine_day_exercises(
      routine_day_id,exercise_id,sets,reps,rest,notes,is_superset,video_url,image_url,order_index
    ) values (
      v_day_id,v_exercise_id,v_sets,
      coalesce(nullif(trim(coalesce(p_reps,'')),''),'-'),
      coalesce(nullif(trim(coalesce(p_rest,'')),''),'-'),
      nullif(trim(coalesce(p_notes,'')),''),
      coalesce(p_is_superset,false),
      nullif(trim(coalesce(p_video_url,'')),''),
      nullif(trim(coalesce(p_image_url,'')),''),
      v_order
    ) returning id into v_row_id;
  end if;

  insert into public.migration_id_map(
    entity_type,firebase_project_id,firebase_uid,firebase_doc_path,firebase_doc_id,
    supabase_table,supabase_id,match_strategy,confidence,run_id,payload,created_at,updated_at
  ) values (
    'routine_day_exercise',p_firebase_project_id,p_coach_firebase_uid,v_doc_path,v_order::text,
    'routine_day_exercises',v_row_id,'by_firebase_doc_path',0.95,p_run_id,coalesce(p_payload,'{}'::jsonb),now(),now()
  )
  on conflict (entity_type,firebase_project_id,firebase_doc_path,firebase_doc_id)
  do update set
    firebase_uid=excluded.firebase_uid,
    supabase_table=excluded.supabase_table,
    supabase_id=excluded.supabase_id,
    match_strategy=excluded.match_strategy,
    confidence=excluded.confidence,
    run_id=coalesce(excluded.run_id,public.migration_id_map.run_id),
    payload=excluded.payload,
    updated_at=now();

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
  v_source exercise_source;
  v_order integer := greatest(coalesce(p_order_index,0),0);
begin
  v_source := case when lower(coalesce(p_exercise_source,'global'))='coach' then 'coach'::exercise_source else 'global'::exercise_source end;
  v_routine_doc_path := format('coaches/%s/routines/%s', p_coach_firebase_uid, p_firebase_routine_id);

  select m.supabase_id into v_routine_id
  from public.migration_id_map m
  where m.entity_type='routine'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_routine_doc_path
    and m.firebase_doc_id=p_firebase_routine_id
    and m.supabase_table='routines'
  limit 1;

  if v_routine_id is null then
    raise exception 'Routine mapping not found for %', v_routine_doc_path using errcode='22023';
  end if;

  if v_source='coach'::exercise_source then
    v_exercise_doc_path := format('coaches/%s/exercises/%s', p_coach_firebase_uid, p_firebase_exercise_id);
  else
    v_exercise_doc_path := format('globalExercises/%s', p_firebase_exercise_id);
  end if;

  select m.supabase_id into v_exercise_id
  from public.migration_id_map m
  where m.entity_type='exercise'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_exercise_doc_path
    and m.firebase_doc_id=p_firebase_exercise_id
    and m.supabase_table='exercises'
  limit 1;

  if v_exercise_id is null then
    raise exception 'Exercise mapping not found for %', v_exercise_doc_path using errcode='22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s/warmup/%s', p_coach_firebase_uid, p_firebase_routine_id, v_order);

  select m.supabase_id into v_row_id
  from public.migration_id_map m
  where m.entity_type='routine_warmup_exercise'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_doc_path
    and m.firebase_doc_id=v_order::text
    and m.supabase_table='routine_warmup_exercises'
  limit 1;

  if v_row_id is not null and exists(select 1 from public.routine_warmup_exercises w where w.id=v_row_id) then
    update public.routine_warmup_exercises
    set routine_id=v_routine_id,
        exercise_id=v_exercise_id,
        order_index=v_order
    where id=v_row_id;
  else
    insert into public.routine_warmup_exercises(routine_id,exercise_id,order_index)
    values (v_routine_id,v_exercise_id,v_order)
    returning id into v_row_id;
  end if;

  insert into public.migration_id_map(
    entity_type,firebase_project_id,firebase_uid,firebase_doc_path,firebase_doc_id,
    supabase_table,supabase_id,match_strategy,confidence,run_id,payload,created_at,updated_at
  ) values (
    'routine_warmup_exercise',p_firebase_project_id,p_coach_firebase_uid,v_doc_path,v_order::text,
    'routine_warmup_exercises',v_row_id,'by_firebase_doc_path',0.95,p_run_id,coalesce(p_payload,'{}'::jsonb),now(),now()
  )
  on conflict (entity_type,firebase_project_id,firebase_doc_path,firebase_doc_id)
  do update set
    firebase_uid=excluded.firebase_uid,
    supabase_table=excluded.supabase_table,
    supabase_id=excluded.supabase_id,
    match_strategy=excluded.match_strategy,
    confidence=excluded.confidence,
    run_id=coalesce(excluded.run_id,public.migration_id_map.run_id),
    payload=excluded.payload,
    updated_at=now();

  return v_row_id;
end;
$$;

revoke all on function public.migration_upsert_routine_day_exercise(text,text,text,text,integer,text,text,integer,text,text,text,boolean,text,text,uuid,jsonb) from public;
revoke all on function public.migration_upsert_routine_warmup_exercise(text,text,text,integer,text,text,uuid,jsonb) from public;
revoke all on function public.migration_upsert_routine_day_exercise(text,text,text,text,integer,text,text,integer,text,text,text,boolean,text,text,uuid,jsonb) from anon;
revoke all on function public.migration_upsert_routine_warmup_exercise(text,text,text,integer,text,text,uuid,jsonb) from anon;
revoke all on function public.migration_upsert_routine_day_exercise(text,text,text,text,integer,text,text,integer,text,text,text,boolean,text,text,uuid,jsonb) from authenticated;
revoke all on function public.migration_upsert_routine_warmup_exercise(text,text,text,integer,text,text,uuid,jsonb) from authenticated;;
