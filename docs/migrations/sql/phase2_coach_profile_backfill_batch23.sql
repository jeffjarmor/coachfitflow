-- phase2_coach_profile_backfill_batch23 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch23', 'running', 'upsert phase2_coach_profile_backfill_batch23 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'YiI0C3zXW4ft3JwOF8mBCv55y4U2', 'yeikol35rc@gmail.com', 'Yeikol Cordero', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/YiI0C3zXW4ft3JwOF8mBCv55y4U2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
