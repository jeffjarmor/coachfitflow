-- phase2_coach_profile_backfill_batch12 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch12', 'running', 'upsert phase2_coach_profile_backfill_batch12 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'NU1FBV9UNaa0HBzZtPEmmJUOxoy2', 'marcocr1283@gmail.com', 'Mark Garita ', '70160035', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FNU1FBV9UNaa0HBzZtPEmmJUOxoy2%2Flogo%2Finbound1344554153939069373.jpg?alt=media&token=3a3bd0fa-543e-44de-8992-a6a9c8684d31', '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/NU1FBV9UNaa0HBzZtPEmmJUOxoy2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'PCi9WXpWN7MKGZShunrTgBLWrCp2', 'juanbg123456@gmail.com', 'Juan Brenes', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/PCi9WXpWN7MKGZShunrTgBLWrCp2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'ptS7jAnqpwVxkruLXzIz0AKvAym2', 'jeramogu@gmail.com', 'Jerami Mora ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/ptS7jAnqpwVxkruLXzIz0AKvAym2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
