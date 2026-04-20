-- phase2_coach_profile_backfill_batch11 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch11', 'running', 'upsert phase2_coach_profile_backfill_batch11 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'gtHClGPNobP9TDqkDSuFt4vXHnD2', 'coachjose@gmail20.com', 'Jose', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/gtHClGPNobP9TDqkDSuFt4vXHnD2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'HfbzJkwqtlQ2eSI6r0U6F2gPZCL2', 'joshurena341@gmail.com', 'Joshua Ureña Rodríguez ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/HfbzJkwqtlQ2eSI6r0U6F2gPZCL2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'hWO7x3mkHfU4EiOGXpqKLI9ctpa2', 'paulacr42@gmail.com', 'Paula Sandí Chinchilla', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/hWO7x3mkHfU4EiOGXpqKLI9ctpa2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
