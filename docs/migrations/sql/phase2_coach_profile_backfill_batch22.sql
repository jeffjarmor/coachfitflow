-- phase2_coach_profile_backfill_batch22 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch22', 'running', 'upsert phase2_coach_profile_backfill_batch22 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'VbzkYCyqxuSs9FVo0TzuCNHkgXG2', 'guillermogk2@gmail.com', 'Guillermo Rodriguez', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/VbzkYCyqxuSs9FVo0TzuCNHkgXG2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'WihZDGmCxPYMJA5nRpCo2CpGCeJ3', 'mlc_1412@hotmail.com', 'Michael Lara Castro', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/WihZDGmCxPYMJA5nRpCo2CpGCeJ3","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'WMUQwHiGHle0sOzsg9MH3q34s7o1', 'isaacrivera3004@gmail.com', 'Isaac Rivera Bonilla ', '50684878465', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FWMUQwHiGHle0sOzsg9MH3q34s7o1%2Flogo%2F6a41242c-4d41-4d34-961c-9f291ba649a9.jpeg?alt=media&token=dda105eb-8acd-4180-b6ac-9dbb744b2697', '#000000', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/WMUQwHiGHle0sOzsg9MH3q34s7o1","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
