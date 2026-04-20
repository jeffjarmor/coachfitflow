-- phase2_coach_profile_backfill_batch24 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch24', 'running', 'upsert phase2_coach_profile_backfill_batch24 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'yZKg6iwB51QO91ni7XAYeVnfBc83', 'jr2161538@gmail.com', 'Connor 08', '50685916900', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FyZKg6iwB51QO91ni7XAYeVnfBc83%2Flogo%2Finbound8419911119679321174.jpg?alt=media&token=3af2bef6-ba65-4486-b969-9853a770b8ec', '#ff0000', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/yZKg6iwB51QO91ni7XAYeVnfBc83","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
