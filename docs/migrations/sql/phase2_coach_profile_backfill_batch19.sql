-- phase2_coach_profile_backfill_batch19 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch19', 'running', 'upsert phase2_coach_profile_backfill_batch19 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'n2h8GITqV6b7VzVqfzDPla3tQo63', 'kailcord10.kc@gmail.com', 'Kail Cordoba', '+50687318795', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2Fn2h8GITqV6b7VzVqfzDPla3tQo63%2Flogo%2Flogo-primo-jorge-final-1.png?alt=media&token=4f3e7277-7121-443c-ae66-e441c7d499d9', '#c65cff', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/n2h8GITqV6b7VzVqfzDPla3tQo63","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'N99ZmQwpgcSiXruZAuRIta572xj2', 'theffitnessbible@gmail.com', 'Fitness Bible', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/N99ZmQwpgcSiXruZAuRIta572xj2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'NujObTAtRhVROPcfYTZDQskW7d92', 'jonathanlewis2006cr@gmail.com', 'Jonathan Lewis Castillo ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/NujObTAtRhVROPcfYTZDQskW7d92","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
