-- phase2_coach_profile_backfill_batch10 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch10', 'running', 'upsert phase2_coach_profile_backfill_batch10 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', '5A4NuuQ1FdMp8PQ0XuWxDhwRxgu2', 'aragondestroyer522@gmail.com', 'Miguel Angel Saborio', '61183211', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2F5A4NuuQ1FdMp8PQ0XuWxDhwRxgu2%2Flogo%2Finbound43833089582822613.jpg?alt=media&token=155c5864-73d6-4b66-81c9-686f8b67998c', '#0000ff', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/5A4NuuQ1FdMp8PQ0XuWxDhwRxgu2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'b88W8ZoFSDYHEfCpamuSYAevD8B2', 'frodriguez@hbmconsultores.com', 'Fernando Rodriguez', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/b88W8ZoFSDYHEfCpamuSYAevD8B2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'fGgFfsCxFLYZwgZxhPR7HMwnuXO2', 'joseulate99@gmail.com', 'Julian Ulate', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/fGgFfsCxFLYZwgZxhPR7HMwnuXO2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
