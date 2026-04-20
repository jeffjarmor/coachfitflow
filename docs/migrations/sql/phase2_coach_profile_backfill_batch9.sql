-- phase2_coach_profile_backfill_batch9 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch9', 'running', 'upsert phase2_coach_profile_backfill_batch9 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'VEdyPThOdSfWHBCTaqOREeLRPQY2', 'carloselcoach1@gmail.com', 'Carlos Acevedo ', '+50688983270', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FVEdyPThOdSfWHBCTaqOREeLRPQY2%2Flogo%2F1000052256.jpg?alt=media&token=3c756b0a-958e-492f-9f98-631375aa2fe3', '#000000', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/VEdyPThOdSfWHBCTaqOREeLRPQY2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'ywavVzyOnzbFAwvByd9u6oPEs8r2', 'avenzerpa@gmail.com', 'Aven Sthuarh abad zerpa', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/ywavVzyOnzbFAwvByd9u6oPEs8r2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '2v4G8e2OpSdYoFs2Wrr0r8J6voV2', 'hzdvid@gmail.com', 'José David Hernández Quesada', '+50670125433', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2F2v4G8e2OpSdYoFs2Wrr0r8J6voV2%2Flogo%2FJose%CC%81%20Herna%CC%81ndez.pdf%20-%209.png?alt=media&token=9db4049c-b57d-46d5-8adf-5ff912f725b7', '#ed9406', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/2v4G8e2OpSdYoFs2Wrr0r8J6voV2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
