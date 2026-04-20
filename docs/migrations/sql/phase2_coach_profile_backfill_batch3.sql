-- Batch3 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch3', 'running', 'upsert next 3 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'RHafD3tClwQNsM5rwBmfbw7iRSf2', 'john.vargasr82@gmail.com', 'Jonathan vargas Rojas ', '86707509', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FRHafD3tClwQNsM5rwBmfbw7iRSf2%2Flogo%2FScreenshot_20251207_223157_Gallery.jpg?alt=media&token=64c55664-906b-4123-987d-c83902b8ad17', '#000000', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/RHafD3tClwQNsM5rwBmfbw7iRSf2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'oi5vPkTo9iSF5F5SYWdHVoVifFn2', 'recreacionhb@gmail.com', 'Melvin Montero Mórales ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/oi5vPkTo9iSF5F5SYWdHVoVifFn2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'rilWCCRTwje9I4pucfQAXVA91so1', 'mk.santamaria.sama@gmail.com', 'M. Santamaria', '60603007', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FrilWCCRTwje9I4pucfQAXVA91so1%2Flogo%2F1000015044.jpg?alt=media&token=59b665de-e140-48f2-af47-cccc6b55f090', '#257598', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/rilWCCRTwje9I4pucfQAXVA91so1","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
