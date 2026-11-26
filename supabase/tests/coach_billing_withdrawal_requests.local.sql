-- Rollback-only contract test for the coach and admin withdrawal flows.
begin;

create function pg_temp.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'assertion failed: %', p_message; end if;
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000992001', 'withdrawal-admin@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000992002', 'withdrawal-owner@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000992003', 'withdrawal-other@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000992004', 'withdrawal-gym@example.invalid', 'authenticated', 'authenticated');

insert into public.coaches (id, email, name, role, account_type) values
  ('00000000-0000-4000-8000-000000992001', 'withdrawal-admin@example.invalid', 'Withdrawal Admin', 'admin', 'independent'),
  ('00000000-0000-4000-8000-000000992002', 'withdrawal-owner@example.invalid', 'Withdrawal Owner', 'coach', 'independent'),
  ('00000000-0000-4000-8000-000000992003', 'withdrawal-other@example.invalid', 'Withdrawal Other', 'coach', 'independent'),
  ('00000000-0000-4000-8000-000000992004', 'withdrawal-gym@example.invalid', 'Withdrawal Gym', 'coach', 'gym');

insert into public.coach_billing_accounts (
  coach_id, mode, subscription_id, subscription_status, current_period_start, current_period_end, cancel_at_period_end
) values
  ('00000000-0000-4000-8000-000000992002', 'onvo_test', 'withdrawal-sub-first', 'active', '2026-11-01 06:00:00+00', '2026-12-01 06:00:00+00', true),
  ('00000000-0000-4000-8000-000000992003', 'simulator', 'withdrawal-sub-no-invoice', 'incomplete', null, null, false),
  ('00000000-0000-4000-8000-000000992004', 'onvo_test', 'withdrawal-sub-gym', 'active', null, null, false);

insert into public.coach_billing_invoices (
  provider, provider_invoice_id, coach_id, subscription_id, status, amount, currency, created_at
) values
  ('onvo_test', 'withdrawal-invoice-failed', '00000000-0000-4000-8000-000000992002', 'withdrawal-sub-first', 'failed', 500, 'CRC', '2026-09-01 06:00:00+00'),
  ('onvo_test', 'withdrawal-invoice-first', '00000000-0000-4000-8000-000000992002', 'withdrawal-sub-first', 'paid', 500, 'CRC', '2026-10-01 06:00:00+00'),
  ('onvo_test', 'withdrawal-invoice-current', '00000000-0000-4000-8000-000000992002', 'withdrawal-sub-first', 'paid', 500, 'CRC', '2026-11-01 06:00:00+00');

select pg_temp.assert(not has_table_privilege('anon', 'public.coach_billing_withdrawal_requests', 'select')
  and not has_table_privilege('authenticated', 'public.coach_billing_withdrawal_requests', 'insert')
  and not has_table_privilege('authenticated', 'public.coach_billing_withdrawal_requests', 'update')
  and not has_table_privilege('authenticated', 'public.coach_billing_withdrawal_requests', 'delete')
  and not has_table_privilege('authenticated', 'coach_billing_private.withdrawal_resolutions', 'select'),
  'access to requests is read-only and admin identities are private');
select pg_temp.assert(not has_function_privilege('anon', 'public.request_coach_billing_withdrawal(text)', 'execute')
  and not has_function_privilege('anon', 'public.resolve_coach_billing_withdrawal(uuid,text,text)', 'execute'),
  'anonymous users cannot execute the withdrawal RPCs');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992002', true);

do $$
declare
  v_request jsonb := public.request_coach_billing_withdrawal('withdrawal-sub-first');
begin
  perform set_config('test.withdrawal_request_id', v_request->>'id', true);
  perform pg_temp.assert(v_request->>'status' = 'pending' and v_request->>'billing_mode' = 'onvo_test'
    and v_request->>'coach_id' = auth.uid()::text
    and (v_request->>'requested_at')::timestamptz = statement_timestamp()
    and (v_request->>'refund_due_on')::date = (statement_timestamp() at time zone 'America/Costa_Rica')::date + 8
    and (v_request->>'first_paid_invoice_created_at')::timestamptz = '2026-10-01 06:00:00+00'
    and (v_request->>'current_period_start')::timestamptz = '2026-11-01 06:00:00+00',
    'submission captures account, period and server timestamp');
  perform pg_temp.assert(v_request = public.request_coach_billing_withdrawal('withdrawal-sub-first'),
    'duplicate submission returns the original request');
  begin
    perform public.request_coach_billing_withdrawal('withdrawal-sub-no-invoice');
    raise exception 'another subscription unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.resolve_coach_billing_withdrawal((v_request->>'id')::uuid, 'approved', 'Prueba');
    raise exception 'coach unexpectedly resolved a withdrawal request';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992003', true);
select pg_temp.assert(not exists (
  select 1 from public.coach_billing_withdrawal_requests
  where subscription_id = 'withdrawal-sub-first'
), 'another coach cannot read the request');
do $$
declare
  v_request jsonb := public.request_coach_billing_withdrawal('withdrawal-sub-no-invoice');
begin
  perform pg_temp.assert(v_request->>'status' = 'pending', 'a missing invoice does not block manual review');
  perform set_config('test.deleted_owner_request_id', v_request->>'id', true);
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992004', true);
do $$
begin
  begin
    perform public.request_coach_billing_withdrawal('withdrawal-sub-gym');
    raise exception 'gym coach unexpectedly submitted a withdrawal request';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
update public.coach_billing_accounts set subscription_id = 'withdrawal-sub-replacement'
  where coach_id = '00000000-0000-4000-8000-000000992002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992002', true);
select pg_temp.assert(public.request_coach_billing_withdrawal('withdrawal-sub-first')->>'id' =
  current_setting('test.withdrawal_request_id'), 'a retry after changing plans finds the original request');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992001', true);
select pg_temp.assert((select count(*) from public.coach_billing_withdrawal_requests
  where subscription_id in ('withdrawal-sub-first', 'withdrawal-sub-no-invoice')) = 2, 'admins can list both requests');

do $$
declare
  v_request_id uuid := current_setting('test.withdrawal_request_id')::uuid;
  v_result jsonb;
begin
  begin
    perform public.resolve_coach_billing_withdrawal(v_request_id, 'approved', E' \t\n');
    raise exception 'a blank resolution note was unexpectedly accepted';
  exception when invalid_parameter_value then null;
  end;

  v_result := public.resolve_coach_billing_withdrawal(v_request_id, 'approved', '  Revisión completada  ');
  perform pg_temp.assert(v_result->>'status' = 'approved' and v_result->>'resolved_at' is not null
    and v_result->>'resolution_note' = 'Revisión completada', 'admin can record a final decision');
  perform pg_temp.assert(v_result = public.resolve_coach_billing_withdrawal(v_request_id, 'approved', 'Revisión completada'),
    'retrying the same decision returns the original resolution');
  begin
    perform public.resolve_coach_billing_withdrawal(v_request_id, 'rejected', 'Decisión diferente');
    raise exception 'a conflicting second resolution was unexpectedly accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992002', true);
select pg_temp.assert((select resolution_note from public.coach_billing_withdrawal_requests
  where id = current_setting('test.withdrawal_request_id')::uuid) = 'Revisión completada',
  'the owner can read the final decision');

reset role;
select pg_temp.assert((select resolved_by from coach_billing_private.withdrawal_resolutions
  where request_id = current_setting('test.withdrawal_request_id')::uuid) = '00000000-0000-4000-8000-000000992001',
  'the admin identity is recorded privately');
select pg_temp.assert((select subscription_id = 'withdrawal-sub-replacement' and cancel_at_period_end and subscription_status = 'active'
  from public.coach_billing_accounts where coach_id = '00000000-0000-4000-8000-000000992002'),
  'presenting and resolving a request leave the billing account untouched');

delete from auth.users where id = '00000000-0000-4000-8000-000000992003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992002', true);
select pg_temp.assert(not exists (select 1 from public.coach_billing_withdrawal_requests
  where id = current_setting('test.deleted_owner_request_id')::uuid),
  'another coach cannot read an unlinked request');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992003', true);
select pg_temp.assert(not exists (select 1 from public.coach_billing_withdrawal_requests
  where id = current_setting('test.deleted_owner_request_id')::uuid),
  'the former owner cannot read the request with a stale session after deletion');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000992001', true);
select pg_temp.assert((select coach_id is null and status = 'pending' and requested_at is not null
  and subscription_id = 'withdrawal-sub-no-invoice' from public.coach_billing_withdrawal_requests
  where id = current_setting('test.deleted_owner_request_id')::uuid),
  'admin can access the pending request after its owner is deleted');
select pg_temp.assert(public.resolve_coach_billing_withdrawal(
  current_setting('test.deleted_owner_request_id')::uuid, 'rejected', 'Revisión completada'
)->>'status' = 'rejected', 'admin can resolve a request after its owner is deleted');

rollback;
