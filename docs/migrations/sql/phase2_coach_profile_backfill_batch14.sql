-- phase2_coach_profile_backfill_batch14 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch14', 'running', 'upsert phase2_coach_profile_backfill_batch14 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', '0nzy4tb1VqVlIMmuB8MBWXCcHBU2', 'oscpalmlb@gmail.com', 'Óscar Adrián Palma Lobo', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/0nzy4tb1VqVlIMmuB8MBWXCcHBU2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '1QotL6xBhqfAhBiMsQCu0kumPXs1', 'justhynoviedo95@gmail.com', 'Justhyn Oviedo', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/1QotL6xBhqfAhBiMsQCu0kumPXs1","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', '37As3BoPAAV8iVYza1BMohI384x1', 'fernandezjuank311@gmail.com', 'Juank Fernandez', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/37As3BoPAAV8iVYza1BMohI384x1","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
