-- Rollback-only contract test for admin billing and local ONVO payout reconciliation.
begin;

create function pg_temp.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'assertion failed: %', p_message; end if;
end;
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000991001', 'billing-admin@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000991002', 'billing-active@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000991003', 'billing-due@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000991004', 'billing-gym@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000991005', 'billing-simulator@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000991006', 'billing-cancelled@example.invalid', 'authenticated', 'authenticated');

insert into public.coaches (id, email, name, role, account_type, coach_plan, next_plan_payment_date) values
  ('00000000-0000-4000-8000-000000991001', 'billing-admin@example.invalid', 'Billing Test Admin', 'admin', 'independent', 'standard', null),
  ('00000000-0000-4000-8000-000000991002', 'billing-active@example.invalid', 'Billing Active Coach', 'coach', 'independent', 'paid', '2026-11-30'),
  ('00000000-0000-4000-8000-000000991003', 'billing-due@example.invalid', 'Billing Due Coach', 'coach', 'independent', 'standard', null),
  ('00000000-0000-4000-8000-000000991004', 'billing-gym@example.invalid', 'Billing Gym Coach', 'coach', 'gym', 'standard', null),
  ('00000000-0000-4000-8000-000000991005', 'billing-simulator@example.invalid', 'Billing Simulator Coach', 'coach', 'independent', 'paid', '2026-11-30'),
  ('00000000-0000-4000-8000-000000991006', 'billing-cancelled@example.invalid', 'Billing Cancelled Coach', 'coach', 'independent', 'paid', '2026-11-30');

select pg_temp.assert(has_table_privilege('authenticated', 'public.onvo_payout_settlements', 'select') = false,
  'authenticated cannot read raw payout rows');
select pg_temp.assert(has_table_privilege('anon', 'public.onvo_payout_settlements', 'select') = false,
  'anonymous users cannot read raw payout rows');
select pg_temp.assert(has_table_privilege('service_role', 'public.onvo_payout_settlements', 'update') = false
  and has_table_privilege('service_role', 'public.onvo_payout_settlements', 'delete') = false,
  'payout ledger remains append-only for service role');
select pg_temp.assert(has_function_privilege('authenticated', 'public.admin_billing_plans()', 'execute'),
  'authenticated can reach the admin plans RPC for its internal admin check');
select pg_temp.assert(not has_function_privilege('anon', 'public.admin_billing_plans()', 'execute'),
  'anonymous users cannot execute admin billing RPCs');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.record_onvo_payout_settlement(text,text,text,text,timestamptz,timestamptz,text,integer,bigint,bigint,bigint,bigint,bigint)', 'execute'),
  'authenticated users cannot record payout settlements');
select pg_temp.assert(
  (select proconfig @> array['search_path=pg_catalog, public, auth, pg_temp'] from pg_proc where oid = 'public.admin_billing_plans()'::regprocedure)
  and (select proconfig @> array['search_path=pg_catalog, public, auth, pg_temp'] from pg_proc where oid = 'public.admin_billing_report(date,text)'::regprocedure),
  'admin RPCs pin their SECURITY DEFINER search path');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000991001', true);
select set_config('test.admin_billing_baseline', public.admin_billing_report('2026-11-01', 'CRC')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000991002', true);

do $$
begin
  begin
    perform public.admin_billing_plans();
    raise exception 'non-admin plan read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_billing_report('2026-11-01', 'CRC');
    raise exception 'non-admin report read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

insert into public.coach_billing_accounts (
  coach_id, mode, subscription_status, plan_currency, current_period_end,
  cancel_at_period_end, cancel_at
) values
  ('00000000-0000-4000-8000-000000991002', 'onvo_test', 'active', 'CRC', '2026-11-30 06:00:00+00', false, null),
  ('00000000-0000-4000-8000-000000991003', 'onvo_test', 'past_due', 'CRC', '2026-11-20 06:00:00+00', false, null),
  ('00000000-0000-4000-8000-000000991004', 'onvo_test', 'active', 'CRC', '2026-11-30 06:00:00+00', false, null),
  ('00000000-0000-4000-8000-000000991005', 'simulator', 'active', 'CRC', '2026-11-30 06:00:00+00', false, null),
  ('00000000-0000-4000-8000-000000991006', 'onvo_test', 'unpaid', 'CRC', '2026-11-20 06:00:00+00', true, null);

insert into public.coach_billing_invoices (
  provider, provider_invoice_id, coach_id, subscription_id, payment_intent_id,
  status, amount, currency, created_at, period_start, period_end
) values
  ('onvo_test', 'admin-billing-prev-paid', '00000000-0000-4000-8000-000000991002', 'admin-billing-sub-active', 'pi-prev', 'paid', 100, 'CRC', '2026-10-15 16:00:00+00', '2026-10-15 16:00:00+00', '2026-11-15 16:00:00+00'),
  ('onvo_test', 'admin-billing-before-month', '00000000-0000-4000-8000-000000991002', 'admin-billing-sub-active', 'pi-before', 'paid', 8, 'CRC', '2026-11-01 05:59:59+00', '2026-11-01 05:59:59+00', '2026-12-01 05:59:59+00'),
  ('onvo_test', 'admin-billing-current-renewal', '00000000-0000-4000-8000-000000991002', 'admin-billing-sub-active', 'pi-current', 'paid', 250, 'CRC', '2026-11-15 16:00:00+00', '2026-11-15 16:00:00+00', '2026-12-15 16:00:00+00'),
  ('onvo_test', 'admin-billing-current-open', '00000000-0000-4000-8000-000000991003', 'admin-billing-sub-active', null, 'open', 75, 'CRC', '2026-11-16 16:00:00+00', '2026-11-16 16:00:00+00', '2026-12-16 16:00:00+00'),
  ('onvo_test', 'admin-billing-month-end', '00000000-0000-4000-8000-000000991002', 'admin-billing-sub-active', 'pi-month-end', 'paid', 5, 'CRC', '2026-12-01 05:59:59+00', '2026-12-01 05:59:59+00', '2027-01-01 05:59:59+00'),
  ('onvo_test', 'admin-billing-other-currency', '00000000-0000-4000-8000-000000991002', 'admin-billing-sub-active', 'pi-usd', 'paid', 999, 'USD', '2026-11-17 16:00:00+00', '2026-11-17 16:00:00+00', '2026-12-17 16:00:00+00');

set local role service_role;
do $$
begin
  if not public.record_onvo_payout_settlement(
    'admin-billing-payout-1', 'admin-billing-event-1', 'clacct_test_001', 'fixture-1',
    '2026-11-18 16:00:00+00', '2026-11-18 16:01:00+00', 'CRC', 3,
    1000, 70, 0, null, 930
  ) then raise exception 'first signed payout fixture did not insert'; end if;
  if public.record_onvo_payout_settlement(
    'admin-billing-payout-1', 'admin-billing-event-1', 'clacct_test_001', 'fixture-1',
    '2026-11-18 16:00:00+00', '2026-11-18 16:01:00+00', 'CRC', 3,
    9000, 70, 0, null, 8930
  ) then raise exception 'replayed payout fixture inserted twice'; end if;
  if public.record_onvo_payout_settlement(
    'admin-billing-payout-1', 'admin-billing-event-old', 'clacct_test_001', 'fixture-1',
    '2026-11-18 16:00:00+00', '2026-11-17 16:01:00+00', 'CRC', 3,
    9000, 70, 0, null, 8930
  ) then raise exception 'older paid event overwrote a newer provider snapshot'; end if;
end;
$$;
reset role;

select pg_temp.assert((select gross_minor = 1000 and retentions_minor is null
  from public.onvo_payout_settlements where payout_id = 'admin-billing-payout-1'),
  'replay cannot overwrite provider figures and omitted retentions stay null');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000991001', true);

do $$
declare
  before_report jsonb := current_setting('test.admin_billing_baseline')::jsonb;
  report jsonb := public.admin_billing_report('2026-11-01', 'CRC');
  plans jsonb := public.admin_billing_plans();
begin
  if (report->>'activeSubscriptions')::integer - (before_report->>'activeSubscriptions')::integer <> 1 then
    raise exception 'onvo_test currency active count did not include exactly the active independent coach';
  end if;
  if (report->>'renewalsDue')::integer - (before_report->>'renewalsDue')::integer <> 1 then
    raise exception 'only the uncanceled past-due onvo_test renewal should count';
  end if;
  if (report->>'collectedMinor')::bigint - (before_report->>'collectedMinor')::bigint <> 255 then
    raise exception 'local month-end boundary, currency, provider, and paid status should scope collected totals';
  end if;
  if (report->>'previousCollectedMinor')::bigint - (before_report->>'previousCollectedMinor')::bigint <> 108 then
    raise exception 'Costa Rica month-start boundary should keep the prior-month invoice separate';
  end if;
  if not exists (select 1 from jsonb_array_elements(report->'movements') item
    where item->>'id' = 'admin-billing-current-renewal' and item->>'kind' = 'renewal'
      and (item->>'date')::timestamptz = '2026-11-15 16:00:00+00'::timestamptz) then
    raise exception 'movement must use invoice registration date and classify later invoice as renewal';
  end if;
  if not exists (select 1 from jsonb_array_elements(report->'movements') item
    where item->>'id' = 'admin-billing-current-open' and item->>'kind' = 'subscription') then
    raise exception 'unpaid invoice must remain a movement and a coach-specific first invoice is a subscription';
  end if;
  if not exists (select 1 from jsonb_array_elements(report->'movements') item
    where item->>'id' = 'admin-billing-month-end')
    or exists (select 1 from jsonb_array_elements(report->'movements') item
      where item->>'id' = 'admin-billing-before-month') then
    raise exception 'movement dates should use America/Costa_Rica month boundaries';
  end if;
  if not exists (select 1 from jsonb_array_elements(plans) item
    where item->>'id' = '00000000-0000-4000-8000-000000991003' and item->>'renewal' = 'pending')
    or not exists (select 1 from jsonb_array_elements(plans) item
      where item->>'id' = '00000000-0000-4000-8000-000000991006' and item->>'renewal' = 'disabled') then
    raise exception 'renewal state should distinguish past-due and scheduled cancellation';
  end if;
  if not exists (select 1 from jsonb_array_elements(report->'settlements') item
    where item->>'id' = 'admin-billing-payout-1'
      and item->>'status' = 'paid' and item->>'netMinor' = '930'
      and item->'retentionsMinor' = 'null'::jsonb) then
    raise exception 'settlement must expose confirmed provider figures and unknown retentions as null';
  end if;
  if not exists (select 1 from jsonb_array_elements(plans) item
    where item->>'id' = '00000000-0000-4000-8000-000000991002'
      and item->>'plan' = 'paid' and item->>'accessThrough' = '2026-11-30'
      and item->>'renewal' = 'automatic') then
    raise exception 'plans must report paid-through date and automatic onvo_test renewal';
  end if;
  if exists (select 1 from jsonb_array_elements(plans) item
    where item->>'id' = '00000000-0000-4000-8000-000000991004') then
    raise exception 'gym coaches must not appear in independent billing plans';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000991003', true);
do $$
begin
  begin
    perform public.admin_billing_report('2026-11-01', 'CRC');
    raise exception 'coach report read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000991001', true);
do $$
begin
  begin
    perform public.admin_billing_report('2026-11-02', 'CRC');
    raise exception 'non-first day month unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_billing_report('2026-11-01', null);
    raise exception 'null currency unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_billing_report('2026-11-01', 'EUR');
    raise exception 'unsupported currency unexpectedly succeeded';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

reset role;

-- Verified historical invoices remain in the reconciliation after a later role/context change.
update public.coaches set account_type = 'gym' where id = '00000000-0000-4000-8000-000000991002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000991001', true);
do $$
declare report jsonb := public.admin_billing_report('2026-11-01', 'CRC');
begin
  if (report->>'collectedMinor')::bigint < 255 then
    raise exception 'historical invoice total disappeared after account-type change';
  end if;
  if not exists (select 1 from jsonb_array_elements(report->'movements') item
    where item->>'id' = 'admin-billing-current-renewal') then
    raise exception 'historical invoice movement disappeared after account-type change';
  end if;
end;
$$;

rollback;
