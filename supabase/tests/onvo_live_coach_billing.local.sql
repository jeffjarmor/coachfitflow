-- Rollback-only test; run against a disposable instance with the migrations applied.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000993001', 'billing-live-owner@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000993002', 'billing-live-test-mode@example.invalid', 'authenticated', 'authenticated');

insert into public.coaches (id, email, name, role, account_type) values
  ('00000000-0000-4000-8000-000000993001', 'billing-live-owner@example.invalid', 'Live Billing Owner', 'coach', 'independent'),
  ('00000000-0000-4000-8000-000000993002', 'billing-live-test-mode@example.invalid', 'Test Billing Owner', 'coach', 'independent');

insert into public.coach_billing_accounts (coach_id, mode, subscription_id) values
  ('00000000-0000-4000-8000-000000993001', 'onvo_live', 'live-pro-subscription'),
  ('00000000-0000-4000-8000-000000993002', 'onvo_test', 'test-pro-subscription');

do $$
declare
  signature text := 'public.record_coach_billing_invoice(text,text,uuid,text,text,text,integer,text,timestamptz,timestamptz,timestamptz)';
begin
  if has_function_privilege('authenticated', signature, 'execute')
    or has_function_privilege('anon', signature, 'execute')
    or not has_function_privilege('service_role', signature, 'execute') then
    raise exception 'billing settlement RPC must be service-only';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  owner_id uuid := '00000000-0000-4000-8000-000000993001';
  started_at timestamptz := '2026-11-01 06:00:00+00';
  ended_at timestamptz := '2026-12-01 06:00:00+00';
begin
  begin
    perform public.record_coach_billing_invoice('onvo_test', 'bad-test', owner_id, 'live-pro-subscription',
      'test-intent', 'paid', 100, 'USD', started_at, started_at, ended_at);
    raise exception 'test invoice unexpectedly projected live access';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.record_coach_billing_invoice('onvo_live', 'bad-subscription', owner_id, 'unrelated-subscription',
      'live-intent', 'paid', 100, 'USD', started_at, started_at, ended_at);
    raise exception 'invoice unexpectedly matched a different subscription';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.record_coach_billing_invoice('onvo_live', 'bad-intent', owner_id, 'live-pro-subscription',
      null, 'paid', 100, 'USD', started_at, started_at, ended_at);
    raise exception 'paid invoice unexpectedly accepted without a payment intent';
  exception when invalid_parameter_value then null;
  end;

  perform public.record_coach_billing_invoice('onvo_live', 'live-invoice', owner_id, 'live-pro-subscription',
    'live-intent', 'open', 100, 'USD', started_at, started_at, ended_at);
  if exists (select 1 from public.coach_billing_accounts where coach_id = owner_id and paid_through is not null) then
    raise exception 'open live invoice unexpectedly extended access';
  end if;

  if not public.record_coach_billing_invoice('onvo_live', 'live-invoice', owner_id, 'live-pro-subscription',
    'live-intent', 'paid', 100, 'USD', started_at, started_at, ended_at) then
    raise exception 'authorized live invoice was not recorded';
  end if;

  if public.record_coach_billing_invoice('onvo_live', 'live-invoice', owner_id, 'live-pro-subscription',
    'live-intent', 'paid', 100, 'USD', started_at, started_at, ended_at) then
    raise exception 'identical live invoice unexpectedly treated as new';
  end if;

  begin
    perform public.record_coach_billing_invoice('onvo_live', 'live-invoice', owner_id, 'live-pro-subscription',
      'live-intent', 'paid', 100, 'USD', started_at, started_at, ended_at + interval '1 month');
    raise exception 'conflicting paid replay unexpectedly extended the paid period';
  exception when sqlstate '22000' then null;
  end;

  begin
    perform public.record_coach_billing_invoice('onvo_live', 'second-live-invoice', owner_id, 'live-pro-subscription',
      'live-intent', 'paid', 100, 'USD', started_at, started_at, ended_at);
    raise exception 'same payment intent unexpectedly settled a second invoice';
  exception when unique_violation then null;
  end;

  perform public.record_coach_billing_invoice('onvo_live', 'live-invoice', owner_id, 'live-pro-subscription',
    null, 'open', 0, 'USD', started_at, started_at, ended_at);
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.coach_billing_invoices i join public.coach_billing_accounts a using (coach_id)
    join public.coaches c on c.id = a.coach_id
    where i.provider_invoice_id = 'live-invoice' and i.status = 'paid' and i.payment_intent_id = 'live-intent'
      and i.amount = 100 and c.coach_plan = 'paid' and a.paid_through = '2026-12-01'
      and c.next_plan_payment_date = '2026-12-01'
  ) then raise exception 'stale or conflicting notice changed the confirmed payment or access'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000993001', true);

do $$
declare
  request jsonb := public.request_coach_billing_withdrawal('live-pro-subscription');
begin
  if request->>'billing_mode' is distinct from 'onvo_live'
    or (request->>'first_paid_invoice_created_at')::timestamptz is distinct from '2026-11-01 06:00:00+00'::timestamptz then
    raise exception 'live withdrawal is not linked to its verified payment history';
  end if;
end;
$$;

rollback;
