-- phase2_coach_profile_backfill_batch15 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch15', 'running', 'upsert phase2_coach_profile_backfill_batch15 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', '4K3ZACPiaLMieMUPob6k7JidU3Q2', 'daymamva91@gmail.com', 'Dayma Maria Valdes Arrechea', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/4K3ZACPiaLMieMUPob6k7JidU3Q2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '84GhEKFtLuYLBiOkayJOaIZ0dXk2', 'kparis30.kp@gmail.com', 'Kelvin Paris', '50664017311', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2F84GhEKFtLuYLBiOkayJOaIZ0dXk2%2Flogo%2Finbound2465314086203508289.jpg?alt=media&token=6266d8e7-3950-4204-8df3-fd377fca84c8', '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/84GhEKFtLuYLBiOkayJOaIZ0dXk2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '8R9SpAURS8dP0hElUPopKw9gm972', 'nfrc1995@gmail.com', 'Nelson Ramírez Campos', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/8R9SpAURS8dP0hElUPopKw9gm972","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
