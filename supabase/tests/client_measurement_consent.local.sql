-- Run against the local database after the client measurement consent migration.
begin;

create function pg_temp.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'assertion failed: %', p_message; end if;
end;
$$;

create function pg_temp.assert_blocked(p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'measurement write unexpectedly succeeded' using errcode = '23514';
exception when sqlstate 'P0001' then
  perform pg_temp.assert(sqlerrm = 'measurement_consent_required', 'backend returns the consent error');
end;
$$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000993001', 'consent-coach@example.invalid', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-000000993002', 'consent-owner@example.invalid', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-000000993003', 'consent-adult@example.invalid', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-000000993004', 'consent-minor@example.invalid', 'authenticated', 'authenticated', now()),
  ('00000000-0000-4000-8000-000000993005', 'consent-outsider@example.invalid', 'authenticated', 'authenticated', now());

insert into public.coaches (id, email, name, role, account_type, coach_plan, next_plan_payment_date) values
  ('00000000-0000-4000-8000-000000993001', 'consent-coach@example.invalid', 'Consent Coach', 'coach', 'independent', 'paid', current_date + 30),
  ('00000000-0000-4000-8000-000000993002', 'consent-owner@example.invalid', 'Consent Owner', 'owner', 'gym', 'standard', null);

insert into public.clients (id, name, email, birth_date, age, goal, primary_coach_id, user_id) values
  ('00000000-0000-4000-8000-000000993011', 'Consent Adult', 'consent-adult@example.invalid', current_date - interval '24 years', 24, 'Train', '00000000-0000-4000-8000-000000993001', '00000000-0000-4000-8000-000000993003'),
  ('00000000-0000-4000-8000-000000993012', 'Consent Minor', 'consent-minor@example.invalid', current_date - interval '14 years', 14, 'Train', '00000000-0000-4000-8000-000000993001', '00000000-0000-4000-8000-000000993004');

insert into public.independent_client_portal_access (client_id, user_id, coach_id) values
  ('00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993003', '00000000-0000-4000-8000-000000993001'),
  ('00000000-0000-4000-8000-000000993012', '00000000-0000-4000-8000-000000993004', '00000000-0000-4000-8000-000000993001');

insert into public.gyms (id, name, access_code, owner_id) values
  ('00000000-0000-4000-8000-000000993021', 'Consent Gym', 'MC993021', '00000000-0000-4000-8000-000000993002');
insert into public.client_gym_memberships (id, client_id, gym_id) values
  ('00000000-0000-4000-8000-000000993031', '00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993021'),
  ('00000000-0000-4000-8000-000000993032', '00000000-0000-4000-8000-000000993012', '00000000-0000-4000-8000-000000993021');
insert into public.client_portal_access (client_gym_membership_id, user_id) values
  ('00000000-0000-4000-8000-000000993031', '00000000-0000-4000-8000-000000993003'),
  ('00000000-0000-4000-8000-000000993031', '00000000-0000-4000-8000-000000993005'),
  ('00000000-0000-4000-8000-000000993032', '00000000-0000-4000-8000-000000993004');

-- Existing data remains available without retroactive consent.
update public.clients set height = 171, weight = 68 where id = '00000000-0000-4000-8000-000000993011';
insert into public.measurements (id, client_id, date, weight, height, bmi) values
  ('00000000-0000-4000-8000-000000993041', '00000000-0000-4000-8000-000000993011', current_date, 68, 171, 23.26);

select pg_temp.assert(not has_table_privilege('authenticated', 'measurement_consent_private.events', 'select')
  and not has_table_privilege('authenticated', 'measurement_consent_private.staff_confirmed_birth_dates', 'insert')
  and not has_function_privilege('anon', 'public.get_client_measurement_consent(uuid,uuid)', 'execute'),
  'only the two intended authenticated RPCs expose consent');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993001', true);

select pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993011')->>'authorized' = 'false',
  'existing data does not grant authorization');
select pg_temp.assert_blocked($sql$insert into public.measurements (client_id, date, weight, height, bmi)
  values ('00000000-0000-4000-8000-000000993011', current_date, 68, 171, 23.26)$sql$);
select pg_temp.assert_blocked($sql$update public.measurements set weight = 69 where id = '00000000-0000-4000-8000-000000993041'$sql$);
select pg_temp.assert_blocked($sql$update public.clients set weight = 69 where id = '00000000-0000-4000-8000-000000993011'$sql$);

update public.clients set birth_date = birth_date, notes = 'Use a low box' where id in (
  '00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993012');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993004', true);
select public.update_client_portal_profile('00000000-0000-4000-8000-000000993012', null,
  'Consent Minor', null, (current_date - interval '24 years')::date, null, null);
select pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993012')->>'is_minor' = 'true',
  'portal edits cannot make a staff-confirmed minor an adult');
do $$ begin
  begin
    perform public.set_client_measurement_consent('00000000-0000-4000-8000-000000993012', null, 'authorize_online', '2026-11-12-v1');
    raise exception 'minor granted online consent';
  exception when insufficient_privilege then null;
  end;
end; $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993005', true);
do $$ begin
  begin
    perform public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993031', 'authorize_online', '2026-11-12-v1');
    raise exception 'unrelated portal identity could authorize';
  exception when insufficient_privilege then null;
  end;
end; $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993003', true);
do $$ declare state jsonb;
begin
  begin
    perform public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', null, 'authorize_online', 'stale');
    raise exception 'old consent text version was accepted';
  exception when invalid_parameter_value then null;
  end;

  state := public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', null, 'authorize_online', '2026-11-12-v1');
  perform pg_temp.assert(state->>'source' = 'portal' and state->>'authorized' = 'true', 'adult may authorize own independent measurements');
  perform pg_temp.assert(state = public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', null, 'authorize_online', '2026-11-12-v1'),
    'retry retains the original consent event and timestamp');
  perform pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993031')->>'authorized' = 'false',
    'independent authorization does not grant gym authorization');
end; $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993001', true);
insert into public.measurements (id, client_id, date, weight, height, bmi) values
  ('00000000-0000-4000-8000-000000993042', '00000000-0000-4000-8000-000000993011', current_date, 69, 171, 23.60);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993002', true);
select pg_temp.assert(public.set_client_measurement_consent('00000000-0000-4000-8000-000000993012', '00000000-0000-4000-8000-000000993032', 'record_written', '2026-11-12-v1')->>'source' = 'written',
  'gym staff can record a representative authorization');
insert into public.measurements (id, client_id, client_gym_membership_id, date, weight, height, bmi) values
  ('00000000-0000-4000-8000-000000993043', '00000000-0000-4000-8000-000000993012', '00000000-0000-4000-8000-000000993032', current_date, 48, 160, 18.75);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993003', true);
select pg_temp.assert(public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', null, 'revoke')->>'authorized' = 'false',
  'the portal holder can withdraw authorization');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993001', true);
select pg_temp.assert_blocked($sql$update public.measurements set height = 172 where id = '00000000-0000-4000-8000-000000993042'$sql$);
select pg_temp.assert((select count(*) = 2 from public.measurements where client_id = '00000000-0000-4000-8000-000000993011'),
  'history is retained after revocation');
delete from public.measurements where id = '00000000-0000-4000-8000-000000993042';

reset role;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert((select count(*) = 3 from measurement_consent_private.events where client_id in (
  '00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993012')),
  'audit records two grants and one withdrawal without duplicate events');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993003', true);
select public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', null, 'authorize_online', '2026-11-12-v1');
select public.set_client_measurement_consent('00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993031', 'authorize_online', '2026-11-12-v1');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993001', true);
update public.clients set birth_date = current_date - interval '14 years' where id = '00000000-0000-4000-8000-000000993011';
select pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993011')->>'authorized' = 'false',
  'correction to minor revokes online authorization');
update public.clients set birth_date = current_date - interval '24 years' where id = '00000000-0000-4000-8000-000000993011';
select pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993011')->>'authorized' = 'false',
  'online authorization stays revoked after an age correction is reversed');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993002', true);
select pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993011', '00000000-0000-4000-8000-000000993031')->>'authorized' = 'false',
  'all prior online contexts are revoked after age correction');
update public.clients set email = 'consent-minor-mismatch@example.invalid' where id = '00000000-0000-4000-8000-000000993012';
update public.clients set email = 'consent-minor@example.invalid' where id = '00000000-0000-4000-8000-000000993012';
select pg_temp.assert(public.get_client_measurement_consent('00000000-0000-4000-8000-000000993012', '00000000-0000-4000-8000-000000993032')->>'authorized' = 'false',
  'written authorization stays revoked after the client identity email changes and returns');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993001', true);
select pg_temp.assert_blocked($sql$insert into public.clients (name, email, age, weight, goal, primary_coach_id)
  values ('Unscoped weight', 'consent-global@example.invalid', 24, 65, 'Train', auth.uid())$sql$);

reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_blocked($sql$insert into public.measurements (client_id, date, weight, height, bmi)
  values ('00000000-0000-4000-8000-000000993011', current_date, 68, 171, 23.26)$sql$);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993002', true);
delete from public.client_gym_memberships where id = '00000000-0000-4000-8000-000000993032';
reset role;
select pg_temp.assert((select client_gym_membership_id is null from public.measurements
  where id = '00000000-0000-4000-8000-000000993043'), 'membership cleanup preserves existing FK behavior');

rollback;
