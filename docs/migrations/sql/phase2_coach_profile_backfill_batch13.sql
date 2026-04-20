-- phase2_coach_profile_backfill_batch13 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch13', 'running', 'upsert phase2_coach_profile_backfill_batch13 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'S5YuIlwMxhe2Cm7UIB3P3A8s0J02', 'jorge30cb@gmail.com', 'Jorge Cambronero', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/S5YuIlwMxhe2Cm7UIB3P3A8s0J02","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'uehHrRK1UfPXmUKsjFzbWUhvEph1', 'roynunezvillegas@gmail.com', 'Roy ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/uehHrRK1UfPXmUKsjFzbWUhvEph1","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'zkabP1cthKXR6UXVwY9YHrN9Yaj1', 'shaomynavarro@gmail.com', 'shaomy Navarro', null, 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FzkabP1cthKXR6UXVwY9YHrN9Yaj1%2Flogo%2Finbound204927436335041553.heic?alt=media&token=2910bde4-c275-4801-a785-fb7ac1371d7f', '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/zkabP1cthKXR6UXVwY9YHrN9Yaj1","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
