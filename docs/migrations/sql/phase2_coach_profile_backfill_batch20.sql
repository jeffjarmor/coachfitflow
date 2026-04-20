-- phase2_coach_profile_backfill_batch20 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch20', 'running', 'upsert phase2_coach_profile_backfill_batch20 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'ohORqh5DGyeDdmIA0bW8TD1jE6D3', 'mario.costarica2085@gmail.com', 'Mario Fernandez solis', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/ohORqh5DGyeDdmIA0bW8TD1jE6D3","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'OPAc4pV0JpO2gg48mXcKr5Km0eG3', 'tamriosfernandez17@gmail.com', 'Tamara Rios Fernandez', '85846643', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FOPAc4pV0JpO2gg48mXcKr5Km0eG3%2Flogo%2FIMG_0165.jpeg?alt=media&token=22ffa7f5-cff9-4aac-8ec7-759fcad7471f', '#f2f7b7', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/OPAc4pV0JpO2gg48mXcKr5Km0eG3","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'P7CazFBL9jcjRRJSWZTM69tafUX2', 'solanojolene@gmail.com', 'Jolene Solano', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/P7CazFBL9jcjRRJSWZTM69tafUX2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
