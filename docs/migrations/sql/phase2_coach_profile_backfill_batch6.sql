-- Batch6 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch6', 'running', 'upsert batch6 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'XRlfx8WFiBVTC9Gmug3vsWbLlBJ3', 'maroma3094@gmail.com', 'Marlon Rojas ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/XRlfx8WFiBVTC9Gmug3vsWbLlBJ3","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '1pMueIzcmhRuZmHhQfMUW7WpmGz1', 'roldan.araya@multispa.net', 'Dagoberto Araya ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/1pMueIzcmhRuZmHhQfMUW7WpmGz1","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '3XX2wouOgXQQqV3lt8hQnsHbWqu1', 'candycm2014@gmail.com', 'Candy Cerdas ', '87215022', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2F3XX2wouOgXQQqV3lt8hQnsHbWqu1%2Flogo%2Finbound191996829679105020.png?alt=media&token=dda09312-06e6-4898-a54b-3cc782a93be5', '#ff00ff', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/3XX2wouOgXQQqV3lt8hQnsHbWqu1","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
