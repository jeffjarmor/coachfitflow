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
begin
  v_coach_id := public.migration_resolve_coach_id(p_firebase_project_id, p_coach_firebase_uid);
  v_doc_path := format('coaches/%s/clients/%s', p_coach_firebase_uid, p_firebase_client_id);
  v_name := coalesce(nullif(trim(p_name),''),'Cliente sin nombre');
  v_email := lower(trim(coalesce(p_email,'')));
  if v_email = '' then
    v_email := format('no-email+%s@migration.local', p_firebase_client_id);
  end if;

  select m.supabase_id into v_client_id
  from public.migration_id_map m
  where m.entity_type='client'
    and m.firebase_project_id=p_firebase_project_id
    and m.firebase_doc_path=v_doc_path
    and m.firebase_doc_id=p_firebase_client_id
    and m.supabase_table='clients'
  limit 1;

  if v_client_id is not null and exists(select 1 from public.clients c where c.id=v_client_id) then
    update public.clients
    set name=v_name,
        email=v_email,
        phone=nullif(trim(coalesce(p_phone,'')),''),
        birth_date=p_birth_date,
        age=greatest(coalesce(p_age,0),0),
        weight=p_weight,
        height=p_height,
        goal=coalesce(nullif(trim(coalesce(p_goal,'')),''),'-'),
        notes=nullif(trim(coalesce(p_notes,'')),''),
        address=nullif(trim(coalesce(p_address,'')),''),
        primary_coach_id=v_coach_id,
        updated_at=now()
    where id=v_client_id;
  else
    insert into public.clients(
      name,email,phone,birth_date,age,weight,height,goal,notes,address,primary_coach_id,created_at,updated_at
    ) values (
      v_name,v_email,nullif(trim(coalesce(p_phone,'')),''),p_birth_date,greatest(coalesce(p_age,0),0),
      p_weight,p_height,coalesce(nullif(trim(coalesce(p_goal,'')),''),'-'),
      nullif(trim(coalesce(p_notes,'')),''),nullif(trim(coalesce(p_address,'')),''),
      v_coach_id,coalesce(p_created_at,now()),now()
    ) returning id into v_client_id;
  end if;

  insert into public.migration_id_map(
    entity_type,firebase_project_id,firebase_uid,firebase_doc_path,firebase_doc_id,
    supabase_table,supabase_id,match_strategy,confidence,run_id,payload,created_at,updated_at
  ) values (
    'client',p_firebase_project_id,p_coach_firebase_uid,v_doc_path,p_firebase_client_id,
    'clients',v_client_id,'by_firebase_doc_path',0.95,p_run_id,coalesce(p_payload,'{}'::jsonb),now(),now()
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

  return v_client_id;
end;
$$;

revoke all on function public.migration_upsert_client(text,text,text,text,text,text,date,integer,numeric,numeric,text,text,text,timestamptz,uuid,jsonb) from public;
revoke all on function public.migration_upsert_client(text,text,text,text,text,text,date,integer,numeric,numeric,text,text,text,timestamptz,uuid,jsonb) from anon;
revoke all on function public.migration_upsert_client(text,text,text,text,text,text,date,integer,numeric,numeric,text,text,text,timestamptz,uuid,jsonb) from authenticated;;
