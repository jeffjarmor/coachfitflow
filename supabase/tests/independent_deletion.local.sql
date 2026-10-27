\set ON_ERROR_STOP on

-- Run only against the local Supabase CLI database. All synthetic data is
-- rolled back, including Auth users and deletion side effects.
begin;

do $$
begin
  if inet_server_addr() is not null
    or current_database() <> 'postgres'
    or not exists (
      select 1 from pg_roles where rolname = 'supabase_admin'
    ) then
    raise exception 'This test is restricted to local Supabase';
  end if;
  if has_function_privilege('anon', 'public.delete_current_coach_account()', 'EXECUTE')
    or has_function_privilege('anon', 'public.delete_owned_independent_client(uuid)', 'EXECUTE') then
    raise exception 'Deletion RPCs must not be executable by anon';
  end if;
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000000101', 'stage-coach-1@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000102', 'stage-coach-2@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000201', 'stage-client-gym@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000202', 'stage-client-shared@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000000203', 'stage-client-exclusive@example.invalid', 'authenticated', 'authenticated');

insert into public.coaches (id, email, name, role, account_type, coach_plan, next_plan_payment_date) values
  ('00000000-0000-0000-0000-000000000101', 'stage-coach-1@example.invalid', 'Coach Stage Uno', 'coach', 'independent', 'paid', current_date + 30),
  ('00000000-0000-0000-0000-000000000102', 'stage-coach-2@example.invalid', 'Coach Stage Dos', 'coach', 'independent', 'paid', current_date + 30);

insert into public.gyms (id, name, access_code, owner_id) values
  ('00000000-0000-0000-0000-000000000401', 'Gimnasio Stage', 'STAGE-ONLY-401', '00000000-0000-0000-0000-000000000102');

insert into public.clients (id, user_id, primary_coach_id, name, email, age, goal) values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'Cliente gimnasio', 'stage-client-gym@example.invalid', 30, 'Prueba'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101', 'Cliente compartido uno', 'stage-client-shared@example.invalid', 30, 'Prueba'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102', 'Cliente compartido dos', 'stage-client-shared-2@example.invalid', 30, 'Prueba'),
  ('00000000-0000-0000-0000-000000000504', null, '00000000-0000-0000-0000-000000000101', 'Cliente sin Auth', 'stage-client-no-auth@example.invalid', 30, 'Prueba'),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101', 'Cliente exclusivo', 'stage-client-exclusive@example.invalid', 30, 'Prueba');

insert into public.client_gym_memberships (id, client_id, gym_id) values
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

do $$
begin
  begin
    perform public.delete_owned_independent_client('00000000-0000-0000-0000-000000000501');
    raise exception 'Expected gym-linked client deletion to be rejected';
  exception when sqlstate '23503' then null;
  end;
  if not exists (select 1 from public.client_gym_memberships where id = '00000000-0000-0000-0000-000000000601') then
    raise exception 'Gym membership was changed';
  end if;

  begin
    perform public.delete_current_coach_account();
    raise exception 'Expected gym-linked coach deletion to be rejected';
  exception when sqlstate '23503' then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', true);
do $$
begin
  begin
    perform public.delete_owned_independent_client('00000000-0000-0000-0000-000000000502');
    raise exception 'Expected another coach client deletion to be rejected';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.delete_current_coach_account();
    raise exception 'Expected gym owner deletion to be rejected';
  exception when sqlstate '23503' then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
do $$
declare
  result jsonb;
begin
  result := public.delete_owned_independent_client('00000000-0000-0000-0000-000000000502');
  if result->>'auth_users_deleted' <> '0'
    or not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000202') then
    raise exception 'Shared Auth identity was not preserved';
  end if;

  result := public.delete_owned_independent_client('00000000-0000-0000-0000-000000000504');
  if result->>'auth_users_deleted' <> '0' then
    raise exception 'Client without Auth should not delete an identity';
  end if;

  result := public.delete_owned_independent_client('00000000-0000-0000-0000-000000000505');
  if result->>'auth_users_deleted' <> '1'
    or exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000203') then
    raise exception 'Exclusive Auth identity was not removed';
  end if;
end;
$$;

insert into public.gym_staff (gym_id, coach_id) values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000101');
delete from public.client_gym_memberships where id = '00000000-0000-0000-0000-000000000601';

do $$
begin
  begin
    perform public.delete_current_coach_account();
    raise exception 'Expected gym staff deletion to be rejected';
  exception when sqlstate '23503' then null;
  end;
end;
$$;

delete from public.gym_staff where coach_id = '00000000-0000-0000-0000-000000000101';

insert into public.routines (id, client_id, coach_id, name, objective, training_days_count, duration_weeks) values
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000102', 'Rutina de otro entrenador', 'Prueba', 1, 4);

do $$
begin
  begin
    perform public.delete_owned_independent_client('00000000-0000-0000-0000-000000000501');
    raise exception 'Expected another coach routine to block client deletion';
  exception when sqlstate '23503' then null;
  end;
  begin
    perform public.delete_current_coach_account();
    raise exception 'Expected another coach routine to block coach deletion';
  exception when sqlstate '23503' then null;
  end;
end;
$$;

delete from public.routines where id = '00000000-0000-0000-0000-000000000801';

do $$
begin
  perform public.delete_current_coach_account();
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000101')
    or exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000201')
    or not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000202')
    or not exists (select 1 from public.clients where id = '00000000-0000-0000-0000-000000000503') then
    raise exception 'Coach deletion did not preserve only shared data';
  end if;
end;
$$;

rollback;
\echo 'Independent deletion tests passed; synthetic data rolled back.'
