-- phase2_coach_profile_backfill_batch8 coach profile upsert
do $$
declare
  v_run_id uuid := gen_random_uuid();
begin
  insert into public.migration_runs (id, phase, status, notes) values (v_run_id, 'phase2_coach_profile_backfill_batch8', 'running', 'upsert phase2_coach_profile_backfill_batch8 coaches profile fields');

  perform public.migration_upsert_coach('smart-coach-e479b', 'lq12ZmdGsnNYjdZDu42XwxX8haw2', 'emanuelra199@gmail.com', 'Emmanuel Rodríguez Araya', '83034266', 'https://firebasestorage.googleapis.com/v0/b/smart-coach-e479b.firebasestorage.app/o/coaches%2Flq12ZmdGsnNYjdZDu42XwxX8haw2%2Flogo%2FF279E48E-D906-494E-9D6F-F3F62EE16842.jpeg?alt=media&token=1c54e4a8-52c1-406b-8c66-9c2972f0048b', '#01c7fc', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/lq12ZmdGsnNYjdZDu42XwxX8haw2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'MSqzQHkoW5V9zspedM51xol3YiI2', 'deyberthvarela@hotmail.com', 'Deybert Andres Varela ', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/MSqzQHkoW5V9zspedM51xol3YiI2","gymId":null}'::jsonb);
  perform public.migration_upsert_coach('smart-coach-e479b', 'UXnho2oovtNQ4gNro2hPbSVKJZS2', 'marysolgomez.pt@gmail.com', 'Marysol Gómez Fait', null, null, '#2196f3', 'coach', 'independent', '{"origin":"phase1_audit_backfill","firebase_path":"projects/smart-coach-e479b/databases/(default)/documents/coaches/UXnho2oovtNQ4gNro2hPbSVKJZS2","gymId":null}'::jsonb);

  update public.migration_runs set status='completed', finished_at=now() where id=v_run_id;
end $$;
