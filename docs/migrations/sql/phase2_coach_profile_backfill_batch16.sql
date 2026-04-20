-- phase2_coach_profile_backfill_batch16 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch16', 'running', 'upsert phase2_coach_profile_backfill_batch16 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'AAxU4zzkm4ODuMFkKVAEOSVPLTC2', 'davormora2001@gmail.com', 'Davor Mora ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/AAxU4zzkm4ODuMFkKVAEOSVPLTC2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'ck1rAtw6HxS7OWg7qcNiLuSH1pH3', 'omarg_1781@hotmail.com', 'Omar Guzmán castro ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/ck1rAtw6HxS7OWg7qcNiLuSH1pH3","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'DsVxenS95ldZxFJE3f4CwejXYpW2', 'jorson123ds@gmail.com', 'Jorson Delgado Segura ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/DsVxenS95ldZxFJE3f4CwejXYpW2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
