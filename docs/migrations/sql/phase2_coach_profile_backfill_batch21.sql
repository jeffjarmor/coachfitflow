-- phase2_coach_profile_backfill_batch21 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch21', 'running', 'upsert phase2_coach_profile_backfill_batch21 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'S4Nl4TNxxwgzT9evfswzB0BEv0u2', 'andysequeira406@gmail.com', 'EXOTICS YT', '64584832', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FS4Nl4TNxxwgzT9evfswzB0BEv0u2%2Flogo%2F1000071276.webp?alt=media&token=876115e3-b17d-492f-b6b6-32aaa9c855c2', '#000000', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/S4Nl4TNxxwgzT9evfswzB0BEv0u2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'tNE28uC8XIZbcxxmhCOfiu2uaIi2', 'juan15camacho@hotmail.com', 'Pablo Camacho', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/tNE28uC8XIZbcxxmhCOfiu2uaIi2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'uiQS4sevyMNLyxD7z2F7zviSNX42', 'bryanmo@hotmail.es', 'Bryan Mora Obando ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/uiQS4sevyMNLyxD7z2F7zviSNX42","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
