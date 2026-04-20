-- Batch4 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch4', 'running', 'upsert batch4 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', '94ZTTUugcfOaRv8jAz4w4ydLavf2', 'javguevara@hotmail.com', 'Javier Guevara B', null, 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2F94ZTTUugcfOaRv8jAz4w4ydLavf2%2Flogo%2Finbound9030949648218152015.jpg?alt=media&token=9fcfe9d9-3e56-447b-b0cb-6200362ba1ea', '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/94ZTTUugcfOaRv8jAz4w4ydLavf2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'UHthLFuBzPMoO8HESJCc7gzXKtG2', 'gegamboa515@gmail.com', 'Geiner Gamboa Jiménez ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/UHthLFuBzPMoO8HESJCc7gzXKtG2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'ZTDytDoEKkYoDZIVJZsAdEONE9U2', 'mario.australia2085@gmail.com', 'Mario Fernandez', '60348754', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FZTDytDoEKkYoDZIVJZsAdEONE9U2%2Flogo%2FIMG_6719.jpeg?alt=media&token=6195cd77-41d3-47f3-89f2-21e60912cf14', '#669d34', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/ZTDytDoEKkYoDZIVJZsAdEONE9U2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
