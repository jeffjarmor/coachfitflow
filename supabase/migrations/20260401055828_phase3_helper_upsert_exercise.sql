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
  v_source exercise_source;
  v_coach_id uuid;
  v_exercise_id uuid;
begin
  v_source := case when lower(coalesce(p_source,'global')) = 'coach' then 'coach'::exercise_source else 'global'::exercise_source end;
  if v_source = 'coach'::exercise_source then
    v_coach_id := public.migration_resolve_coach_id(p_firebase_project_id, p_coach_firebase_uid);
    v_doc_path := format('coaches/%s/exercises/%s', p_coach_firebase_uid, p_firebase_exercise_id);
  else
    v_coach_id := null;
    v_doc_path := format('globalExercises/%s', p_firebase_exercise_id);
  end if;

  select m.supabase_id into v_exercise_id
  from public.migration_id_map m
  where m.entity_type='exercise'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_doc_path
    and m.firebase_doc_id=p_firebase_exercise_id
    and m.supabase_table='exercises'
  limit 1;

  if v_exercise_id is not null and exists(select 1 from public.exercises e where e.id=v_exercise_id) then
    update public.exercises
    set name=coalesce(nullif(trim(p_name),''),name),
        muscle_group=coalesce(nullif(trim(p_muscle_group),''),muscle_group),
        source=v_source,
        coach_id=v_coach_id,
        video_url=nullif(trim(coalesce(p_video_url,'')),''),
        image_url=nullif(trim(coalesce(p_image_url,'')),''),
        updated_at=now()
    where id=v_exercise_id;
  else
    insert into public.exercises(name,muscle_group,source,coach_id,video_url,image_url,created_at,updated_at)
    values (
      coalesce(nullif(trim(p_name),''),'Ejercicio'),
      coalesce(nullif(trim(p_muscle_group),''),'General'),
      v_source,
      v_coach_id,
      nullif(trim(coalesce(p_video_url,'')),''),
      nullif(trim(coalesce(p_image_url,'')),''),
      now(),now()
    )
    returning id into v_exercise_id;
  end if;

  insert into public.migration_id_map(
    entity_type,firebase_project_id,firebase_uid,firebase_doc_path,firebase_doc_id,
    supabase_table,supabase_id,match_strategy,confidence,run_id,payload,created_at,updated_at
  ) values (
    'exercise',p_firebase_project_id,
    case when v_source='coach'::exercise_source then p_coach_firebase_uid else null end,
    v_doc_path,p_firebase_exercise_id,
    'exercises',v_exercise_id,'by_firebase_doc_path',0.95,p_run_id,coalesce(p_payload,'{}'::jsonb),now(),now()
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

  return v_exercise_id;
end;
$$;

revoke all on function public.migration_upsert_exercise(text,text,text,text,text,text,text,text,uuid,jsonb) from public;
revoke all on function public.migration_upsert_exercise(text,text,text,text,text,text,text,text,uuid,jsonb) from anon;
revoke all on function public.migration_upsert_exercise(text,text,text,text,text,text,text,text,uuid,jsonb) from authenticated;;
