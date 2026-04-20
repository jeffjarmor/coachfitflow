-- phase2_coach_profile_backfill_batch18 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch18', 'running', 'upsert phase2_coach_profile_backfill_batch18 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'hSuOFJcEaTWLtjE6mIao3rUcGdu2', 'menesescharlie97@gmail.com', 'Carlos Meneses', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/hSuOFJcEaTWLtjE6mIao3rUcGdu2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'ifpoxnAHjWT0iAfaux3KAj94bl63', 'errm95@outlook.com', 'Erick ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/ifpoxnAHjWT0iAfaux3KAj94bl63","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'KLwbIz98yLOrL6ZWiLDRHizBlnh2', 'manriquechaves499@gmail.com', 'manrique chaves', '+50688195985', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FKLwbIz98yLOrL6ZWiLDRHizBlnh2%2Flogo%2FIMG_1848.jpeg?alt=media&token=1b6919f1-f67e-462f-b5c7-cdb0d5d7e626', '#ff201c', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/KLwbIz98yLOrL6ZWiLDRHizBlnh2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
