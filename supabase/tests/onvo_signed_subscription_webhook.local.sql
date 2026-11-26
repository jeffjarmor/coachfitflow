-- Run against a disposable database with the billing migrations applied.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000993011', 'signed-onvo@example.invalid', 'authenticated', 'authenticated');
insert into public.coaches (id, email, name, role, account_type) values
  ('00000000-0000-4000-8000-000000993011', 'signed-onvo@example.invalid', 'Signed ONVO Test', 'coach', 'independent');
insert into public.coach_billing_accounts (coach_id, mode, subscription_id, subscription_status, paid_through, current_period_end) values
  ('00000000-0000-4000-8000-000000993011', 'onvo_live', 'signed-subscription', 'active', '2026-12-01', '2026-12-01T06:00:00Z');

do $$
declare
  signature text := 'public.record_coach_billing_signed_event(text,uuid,text,text,text,text,jsonb,jsonb,integer,timestamptz)';
begin
  if has_function_privilege('authenticated', signature, 'execute')
    or has_function_privilege('anon', signature, 'execute')
    or not has_function_privilege('service_role', signature, 'execute') then
    raise exception 'signed billing event intake must be service-only';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  owner_id uuid := '00000000-0000-4000-8000-000000993011';
  invoice jsonb := '{"id":"signed-invoice","payment_intent_id":"signed-intent","status":"open","amount":100000,"currency":"CRC","created_at":"2026-12-01T06:00:00Z","period_start":"2026-12-01T06:00:00Z","period_end":"2027-01-01T06:00:00Z"}';
  failed_subscription jsonb := '{"status":"past_due","current_period_end":"2026-12-01T06:00:00Z","updated_at":"2026-12-02T06:00:00Z"}';
  paid_subscription jsonb := '{"status":"active","current_period_start":"2026-12-01T06:00:00Z","current_period_end":"2027-01-01T06:00:00Z","updated_at":"2026-12-03T06:00:00Z"}';
begin
  begin
    perform public.record_coach_billing_signed_event('signed:wrong-mode', owner_id,
      'subscription_renewal.failed', 'signed-invoice', 'onvo_test', 'signed-subscription',
      invoice, failed_subscription, 1, null);
    raise exception 'test delivery unexpectedly matched the live account';
  exception when invalid_parameter_value then null;
  end;

  if not public.record_coach_billing_signed_event('signed:failure-1', owner_id, 'subscription_renewal.failed',
    'signed-invoice', 'onvo_live', 'signed-subscription', invoice, failed_subscription, 1, '2026-12-02T06:00:00Z')
    or not public.record_coach_billing_signed_event('signed:failure-2', owner_id, 'subscription_renewal.failed',
    'signed-invoice', 'onvo_live', 'signed-subscription', invoice, failed_subscription, 2, '2026-12-03T06:00:00Z') then
    raise exception 'distinct failed attempts must both be recorded';
  end if;

  if not exists (select 1 from public.coach_billing_accounts where coach_id = owner_id
    and subscription_status = 'past_due' and paid_through = '2026-12-01') then
    raise exception 'failed renewal must update status and retain the previously paid period';
  end if;

  invoice := invoice || '{"status":"paid"}'::jsonb;
  begin
    perform public.record_coach_billing_signed_event('signed:success', owner_id, 'subscription_renewal.succeeded',
      'signed-invoice', 'onvo_live', 'signed-subscription', invoice, paid_subscription || '{"status":"invalid"}', null, null);
    raise exception 'invalid provider state was accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.coach_billing_events where event_key = 'signed:success')
    or exists (select 1 from public.coach_billing_invoices where coach_id = owner_id and status = 'paid') then
    raise exception 'rejected write must leave payment and event available for retry';
  end if;

  if not public.record_coach_billing_signed_event('signed:success', owner_id, 'subscription_renewal.succeeded',
    'signed-invoice', 'onvo_live', 'signed-subscription', invoice, paid_subscription, null, null) then
    raise exception 'confirmed renewal or retry was not recorded';
  end if;
  if public.record_coach_billing_signed_event('signed:success', owner_id, 'subscription_renewal.succeeded',
    'signed-invoice', 'onvo_live', 'signed-subscription', invoice, paid_subscription, null, null) then
    raise exception 'identical event was handled twice';
  end if;
  perform public.record_coach_billing_signed_event('signed:intent', owner_id, 'payment_intent.succeeded',
    'signed-invoice', 'onvo_live', 'signed-subscription', invoice, paid_subscription, null, null);
  perform public.record_coach_billing_signed_event('signed:failure-late', owner_id, 'subscription_renewal.failed',
    'signed-invoice', 'onvo_live', 'signed-subscription', invoice || '{"status":"open"}', failed_subscription, 3, null);

  update public.coach_billing_accounts set subscription_status = 'past_due', current_period_end = '2026-12-01T06:00:00Z',
    onvo_subscription_updated_at = '2026-12-02T06:00:00Z' where coach_id = owner_id;

  if (select count(*) from public.coach_billing_events where coach_id = owner_id) <> 5
    or (select count(*) from public.coach_billing_events where coach_id = owner_id and attempt_count in (1, 2, 3)) <> 3
    or not exists (select 1 from public.coach_billing_events where event_key = 'signed:failure-2'
      and next_payment_attempt = '2026-12-03T06:00:00Z') then
    raise exception 'replays and distinct attempts were not audited as expected';
  end if;
  if (select count(*) from public.coach_billing_invoices where coach_id = owner_id) <> 1
    or not exists (select 1 from public.coach_billing_invoices i join public.coach_billing_accounts a using (coach_id)
      join public.coaches c on c.id = a.coach_id where i.coach_id = owner_id and i.status = 'paid'
        and a.subscription_status = 'active' and a.current_period_end = '2027-01-01T06:00:00Z'
        and a.paid_through = '2027-01-01'
        and c.coach_plan = 'paid' and c.next_plan_payment_date = '2027-01-01') then
    raise exception 'duplicate or delayed delivery changed the settled renewal or granted extra access';
  end if;
end;
$$;

rollback;
