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
  v_coach_id := public.migration_resolve_coach_id(p_firebase_project_id, p_coach_firebase_uid);
  v_client_doc_path := format('coaches/%s/clients/%s', p_coach_firebase_uid, p_firebase_client_id);

  select m.supabase_id into v_client_id
  from public.migration_id_map m
  where m.entity_type='client'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_client_doc_path
    and m.firebase_doc_id=p_firebase_client_id
    and m.supabase_table='clients'
  limit 1;

  if v_client_id is null then
    raise exception 'Client mapping not found for %', v_client_doc_path using errcode='22023';
  end if;

  v_doc_path := format('coaches/%s/routines/%s', p_coach_firebase_uid, p_firebase_routine_id);

  select m.supabase_id into v_routine_id
  from public.migration_id_map m
  where m.entity_type='routine'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_doc_path
    and m.firebase_doc_id=p_firebase_routine_id
    and m.supabase_table='routines'
  limit 1;

  if v_routine_id is not null and exists(select 1 from public.routines r where r.id=v_routine_id) then
    update public.routines
    set coach_id=v_coach_id,
        client_id=v_client_id,
        name=coalesce(nullif(trim(coalesce(p_name,'')),''),'Rutina'),
        objective=coalesce(nullif(trim(coalesce(p_objective,'')),''),'-'),
        training_days_count=greatest(coalesce(p_training_days_count,0),0),
        duration_weeks=greatest(coalesce(p_duration_weeks,1),1),
        start_date=p_start_date,
        end_date=p_end_date,
        notes=nullif(trim(coalesce(p_notes,'')),''),
        warmup_enabled=coalesce(p_warmup_enabled,false),
        warmup_custom_text=nullif(trim(coalesce(p_warmup_custom_text,'')),''),
        updated_at=now()
    where id=v_routine_id;
  else
    insert into public.routines(
      coach_id,client_id,name,objective,training_days_count,duration_weeks,start_date,end_date,
      notes,warmup_enabled,warmup_custom_text,created_at,updated_at
    ) values (
      v_coach_id,v_client_id,
      coalesce(nullif(trim(coalesce(p_name,'')),''),'Rutina'),
      coalesce(nullif(trim(coalesce(p_objective,'')),''),'-'),
      greatest(coalesce(p_training_days_count,0),0),
      greatest(coalesce(p_duration_weeks,1),1),
      p_start_date,p_end_date,
      nullif(trim(coalesce(p_notes,'')),''),
      coalesce(p_warmup_enabled,false),
      nullif(trim(coalesce(p_warmup_custom_text,'')),''),
      coalesce(p_created_at,now()),now()
    ) returning id into v_routine_id;
  end if;

  insert into public.migration_id_map(
    entity_type,firebase_project_id,firebase_uid,firebase_doc_path,firebase_doc_id,
    supabase_table,supabase_id,match_strategy,confidence,run_id,payload,created_at,updated_at
  ) values (
    'routine',p_firebase_project_id,p_coach_firebase_uid,v_doc_path,p_firebase_routine_id,
    'routines',v_routine_id,'by_firebase_doc_path',0.95,p_run_id,coalesce(p_payload,'{}'::jsonb),now(),now()
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

  v_doc_path := format('coaches/%s/routines/%s/days/%s', p_coach_firebase_uid, p_firebase_routine_id, p_firebase_day_id);

  select m.supabase_id into v_day_id
  from public.migration_id_map m
  where m.entity_type='routine_day'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_doc_path
    and m.firebase_doc_id=p_firebase_day_id
    and m.supabase_table='routine_days'
  limit 1;

  if v_day_id is not null and exists(select 1 from public.routine_days d where d.id=v_day_id) then
    update public.routine_days
    set routine_id=v_routine_id,
        day_number=greatest(coalesce(p_day_number,1),1),
        day_name=coalesce(nullif(trim(coalesce(p_day_name,'')),''),format('Día %s',greatest(coalesce(p_day_number,1),1))),
        muscle_groups=coalesce(p_muscle_groups,'{}'::text[]),
        notes=nullif(trim(coalesce(p_notes,'')), '')
    where id=v_day_id;
  else
    insert into public.routine_days(routine_id,day_number,day_name,muscle_groups,notes)
    values (
      v_routine_id,
      greatest(coalesce(p_day_number,1),1),
      coalesce(nullif(trim(coalesce(p_day_name,'')),''),format('Día %s',greatest(coalesce(p_day_number,1),1))),
      coalesce(p_muscle_groups,'{}'::text[]),
      nullif(trim(coalesce(p_notes,'')), '')
    ) returning id into v_day_id;
  end if;

  insert into public.migration_id_map(
    entity_type,firebase_project_id,firebase_uid,firebase_doc_path,firebase_doc_id,
    supabase_table,supabase_id,match_strategy,confidence,run_id,payload,created_at,updated_at
  ) values (
    'routine_day',p_firebase_project_id,p_coach_firebase_uid,v_doc_path,p_firebase_day_id,
    'routine_days',v_day_id,'by_firebase_doc_path',0.95,p_run_id,coalesce(p_payload,'{}'::jsonb),now(),now()
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

  return v_day_id;
end;
$$;

revoke all on function public.migration_upsert_routine(text,text,text,text,text,text,integer,integer,date,date,text,boolean,text,timestamptz,uuid,jsonb) from public;
revoke all on function public.migration_upsert_routine_day(text,text,text,text,integer,text,text[],text,uuid,jsonb) from public;
revoke all on function public.migration_upsert_routine(text,text,text,text,text,text,integer,integer,date,date,text,boolean,text,timestamptz,uuid,jsonb) from anon;
revoke all on function public.migration_upsert_routine_day(text,text,text,text,integer,text,text[],text,uuid,jsonb) from anon;
revoke all on function public.migration_upsert_routine(text,text,text,text,text,text,integer,integer,date,date,text,boolean,text,timestamptz,uuid,jsonb) from authenticated;
revoke all on function public.migration_upsert_routine_day(text,text,text,text,integer,text,text[],text,uuid,jsonb) from authenticated;;
