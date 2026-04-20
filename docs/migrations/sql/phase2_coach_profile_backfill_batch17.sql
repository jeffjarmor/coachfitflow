-- phase2_coach_profile_backfill_batch17 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch17', 'running', 'upsert phase2_coach_profile_backfill_batch17 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'H6Gtqa3DCHbAn6BtVhvz0QMXt1q2', 'wendycotoj@gmail.com', 'Wendy Coto', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/H6Gtqa3DCHbAn6BtVhvz0QMXt1q2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'hFrRgBUDrEfQI7jjCZWYRfZoFdM2', 'bry9rf@gmail.com', 'Bryan Ramos', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/hFrRgBUDrEfQI7jjCZWYRfZoFdM2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'HQAB4zBIBHRkyiyJ9r9kiIrigA63', 'veromendezr61@gmail.com', 'Veronica Mendez', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/HQAB4zBIBHRkyiyJ9r9kiIrigA63","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
