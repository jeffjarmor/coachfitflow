-- Batch7 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch7', 'running', 'upsert batch7 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', '8lC2VPoC2oWaKqcjcyjBVLXt9Zr2', 'yitanfitnesscoachcr@gmail.com', 'Gamboa Méndez', '87374820', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2F8lC2VPoC2oWaKqcjcyjBVLXt9Zr2%2Flogo%2F67533.png?alt=media&token=10d756a4-c944-4e4e-a637-a5d9850a2764', '#00ff00', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/8lC2VPoC2oWaKqcjcyjBVLXt9Zr2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '8sjY0FHD9lP8mlnIuu74Gxg9wlI2', 'perezcr93@hotmail.com', 'Edwin Perez Aguilar ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/8sjY0FHD9lP8mlnIuu74Gxg9wlI2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'EXce01y6W3ZE2Fpp0ePgJ3zKjmv1', 'bootsfitcr@gmail.com', 'Geyzel Marín ', '+50683155687', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FEXce01y6W3ZE2Fpp0ePgJ3zKjmv1%2Flogo%2Finbound5529960849092623758.png?alt=media&token=341b0abd-9440-46c9-ba1f-5de672b2cdcc', '#00ffff', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/EXce01y6W3ZE2Fpp0ePgJ3zKjmv1","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
