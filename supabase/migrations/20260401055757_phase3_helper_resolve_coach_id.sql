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
  select m.supabase_id into v_coach_id
  from public.migration_id_map m
  where m.entity_type = 'coach'
    and m.firebase_project_id = p_firebase_project_id
    and m.firebase_uid = p_coach_firebase_uid
    and m.supabase_table = 'coaches'
  limit 1;

  if v_coach_id is null then
    raise exception 'Coach mapping not found for %', p_coach_firebase_uid using errcode = '22023';
  end if;

  return v_coach_id;
end;
$$;

revoke all on function public.migration_resolve_coach_id(text, text) from public;
revoke all on function public.migration_resolve_coach_id(text, text) from anon;
revoke all on function public.migration_resolve_coach_id(text, text) from authenticated;;
