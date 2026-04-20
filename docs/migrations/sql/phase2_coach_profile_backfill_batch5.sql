-- Batch5 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch5', 'running', 'upsert batch5 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'AGNiSb97UKXmnVyAudvf5k3eYre2', 'jossmd48@gmail.com', 'Jose Morales ', null, null, '#733e89', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/AGNiSb97UKXmnVyAudvf5k3eYre2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'Aj7vOsr6yLY3dxJxSKkjInVpj1m1', 'guillermogk1@hotmail.com', 'Luis Guillermo Rodríguez Araya', '50683834241', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2FAj7vOsr6yLY3dxJxSKkjInVpj1m1%2Flogo%2FIMG_6932.jpeg?alt=media&token=df20f497-fb7d-4037-874a-3b4817329b4c', '#ff4015', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/Aj7vOsr6yLY3dxJxSKkjInVpj1m1","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'jIRrg14IFFNunx4cVdGcbremoTV2', 'shankscoc26@gmail.com', 'Código del Físico ', '89545433', null, '#000000', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/jIRrg14IFFNunx4cVdGcbremoTV2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
