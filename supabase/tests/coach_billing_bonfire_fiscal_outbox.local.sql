-- Run against a disposable database with the billing and Bonfire migrations applied.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-000000993021', 'bonfire-ready@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000993022', 'bonfire-missing@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-000000993023', 'bonfire-mismatch@example.invalid', 'authenticated', 'authenticated');
insert into public.coaches (id, email, name, role, account_type) values
  ('00000000-0000-4000-8000-000000993021', 'bonfire-ready@example.invalid', 'Buyer ready', 'coach', 'independent'),
  ('00000000-0000-4000-8000-000000993022', 'bonfire-missing@example.invalid', 'Buyer missing', 'coach', 'independent'),
  ('00000000-0000-4000-8000-000000993023', 'bonfire-mismatch@example.invalid', 'Payment mismatch', 'coach', 'independent');
insert into public.coach_billing_accounts (coach_id, mode, subscription_id, plan_price_id) values
  ('00000000-0000-4000-8000-000000993021', 'onvo_test', 'sub-ready', 'price-pro'),
  ('00000000-0000-4000-8000-000000993022', 'onvo_test', 'sub-missing', 'price-pro'),
  ('00000000-0000-4000-8000-000000993023', 'onvo_test', 'sub-mismatch', 'price-pro');

do $$
begin
  if has_table_privilege('anon', 'public.coach_billing_fiscal_jobs', 'select')
    or has_table_privilege('authenticated', 'public.coach_billing_fiscal_profiles', 'select')
    or (select count(*) from pg_class where relrowsecurity and oid in (
      'public.coach_billing_fiscal_jobs'::regclass, 'public.coach_billing_fiscal_profiles'::regclass)) <> 2
    or exists (select 1 from pg_proc p where pronamespace = 'public'::regnamespace
      and proname in ('claim_coach_billing_fiscal_jobs', 'finish_coach_billing_fiscal_job',
        'record_coach_billing_signed_event_with_fiscal', 'record_coach_billing_fiscal_review',
        'prepare_coach_billing_fiscal_job')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
        or not has_function_privilege('service_role', p.oid, 'execute'))) then
    raise exception 'fiscal data and operations must be restricted to the server';
  end if;
end;
$$;

set local role service_role;

do $$
declare
  v_owner uuid := '00000000-0000-4000-8000-000000993021';
  v_missing_owner uuid := '00000000-0000-4000-8000-000000993022';
  v_mismatch_owner uuid := '00000000-0000-4000-8000-000000993023';
  v_receipt uuid := '00000000-0000-4000-8000-000000993024';
  v_buyer jsonb := '{"nombre":"  Receptor de prueba  ","tipo":"01","numero":"101230456","actividad":"6201.0","correo":"facturas@example.invalid","ubicacion":{"provincia":"1","canton":"01","distrito":"01","otrasSenas":" Dirección ficticia "}}';
  v_initial jsonb := '{"id":"invoice-initial","payment_intent_id":"pi-initial","status":"paid","amount":113000,"currency":"CRC","created_at":"2026-12-01T06:00:00Z","period_start":"2026-12-01T06:00:00Z","period_end":"2027-01-01T06:00:00Z"}';
  v_subscription jsonb := '{"status":"active","current_period_start":"2026-12-01T06:00:00Z","current_period_end":"2027-01-01T06:00:00Z","updated_at":"2026-12-01T06:00:01Z"}';
  v_fiscal jsonb := '{"account_id":"acct-fiscal","price_id":"price-pro","payment_method":"02","paid_at":"2026-12-01T06:00:00Z"}';
  v_key text := 'onvo-signed:onvo_test:acct-fiscal:';
  v_renewal jsonb;
  v_job public.coach_billing_fiscal_jobs;
  v_lease public.coach_billing_fiscal_jobs;
  v_original_lease uuid;
  v_missing_job uuid;
  v_recorded boolean;
begin
  insert into public.coach_billing_fiscal_profiles (coach_id, receptor) values (v_owner, v_buyer);

  v_recorded := public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-initial', v_owner, 'payment_intent.succeeded',
    'invoice-initial', 'onvo_test', 'sub-ready', v_initial, v_subscription, null, null, v_fiscal || '{"event_id":"evt-initial"}');
  if not v_recorded or not exists (select 1 from public.coach_billing_accounts where coach_id = v_owner and paid_through = '2027-01-01') then
    raise exception 'first payment did not activate access and persist the fiscal job';
  end if;

  select * into strict v_job from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-initial';
  if v_job.state <> 'pending' or v_job.idempotency_key is null
    or (v_job.request_body::jsonb #>> '{receptor,nombre}') is distinct from 'Receptor de prueba'
    or (v_job.request_body::jsonb #>> '{receptor,ubicacion,otrasSenas}') is distinct from 'Dirección ficticia'
    or (v_job.request_body::jsonb #>> '{pago,referencia}') is distinct from 'pi-initial'
    or (v_job.request_body::jsonb #>> '{pago,montoMenor}') is distinct from '113000'
    or (v_job.request_body::jsonb ->> 'referenciaExterna') is distinct from 'invoice-initial'
    or (v_job.request_body::jsonb ->> 'codigoServicio') is distinct from 'pro-mensual'
    or (v_job.request_body::jsonb ->> 'ocurridoEn')::timestamptz is distinct from '2026-12-01T06:00:00Z'::timestamptz then
    raise exception 'frozen fiscal request does not match the Bonfire contract';
  end if;

  update public.coach_billing_fiscal_profiles set receptor = v_buyer || '{"nombre":"Receptor actualizado"}' where coach_id = v_owner;
  perform public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-renewal-alias', v_owner, 'subscription_renewal.succeeded',
    'invoice-initial', 'onvo_test', 'sub-ready', v_initial, v_subscription, null, null, v_fiscal || '{"event_id":"evt-renewal-alias"}');
  if public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-initial', v_owner, 'payment_intent.succeeded',
    'invoice-initial', 'onvo_test', 'sub-ready', v_initial, v_subscription, null, null, v_fiscal || '{"event_id":"evt-initial"}')
    or (select count(*) from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-initial') <> 1
    or not exists (select 1 from public.coach_billing_fiscal_jobs where id = v_job.id and request_body = v_job.request_body) then
    raise exception 'repeated event types or buyer changes rewrote the frozen request';
  end if;

  select * into strict v_lease from public.claim_coach_billing_fiscal_jobs(1);
  v_original_lease := v_lease.lease_token;
  if v_lease.id <> v_job.id or v_lease.attempt_count <> 1 or v_original_lease is null
    or exists (select 1 from public.claim_coach_billing_fiscal_jobs(1)) then
    raise exception 'an active lease can be claimed twice';
  end if;
  update public.coach_billing_fiscal_jobs set lease_expires_at = now() - interval '1 second' where id = v_job.id;
  select * into strict v_lease from public.claim_coach_billing_fiscal_jobs(1);
  if v_lease.lease_token = v_original_lease or v_lease.request_body <> v_job.request_body
    or v_lease.idempotency_key <> v_job.idempotency_key or v_lease.attempt_count <> 2
    or public.finish_coach_billing_fiscal_job(v_job.id, v_original_lease, 'pending', now(), null, null, null, null, null) then
    raise exception 'failed lease recovery or stale worker could commit';
  end if;
  if not public.finish_coach_billing_fiscal_job(v_job.id, v_lease.lease_token, 'submitted', now(), v_receipt, null, null, null, null) then
    raise exception 'request acknowledgment was not persisted';
  end if;
  select * into strict v_lease from public.claim_coach_billing_fiscal_jobs(1);
  v_recorded := public.finish_coach_billing_fiscal_job(v_job.id, v_lease.lease_token, 'accepted', null, v_receipt, 'aceptado', repeat('1', 50), repeat('2', 20), null);
  if v_lease.state <> 'submitted' or v_lease.bonfire_request_id <> v_receipt
    or not v_recorded or exists (select 1 from public.claim_coach_billing_fiscal_jobs(1)) then
    raise exception 'fiscal acceptance or terminal lease exclusion is wrong';
  end if;

  v_renewal := v_initial || '{"id":"invoice-renewal","payment_intent_id":"pi-renewal","created_at":"2027-01-01T06:00:00Z","period_start":"2027-01-01T06:00:00Z","period_end":"2027-02-01T06:00:00Z"}';
  v_subscription := v_subscription || '{"current_period_start":"2027-01-01T06:00:00Z","current_period_end":"2027-02-01T06:00:00Z","updated_at":"2027-01-01T06:00:01Z"}';
  perform public.record_coach_billing_signed_event(v_key || 'evt-failed', v_owner, 'subscription_renewal.failed',
    'invoice-renewal', 'onvo_test', 'sub-ready', v_renewal || '{"status":"open"}', v_subscription, 1, null);
  if exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-renewal') then
    raise exception 'failed collection entered fiscal outbox';
  end if;
  perform public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-second', v_owner, 'subscription_renewal.succeeded',
    'invoice-renewal', 'onvo_test', 'sub-ready', v_renewal, v_subscription, null, null,
    v_fiscal || '{"event_id":"evt-second","paid_at":"2027-01-01T06:00:00Z"}');
  if not exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-renewal' and state = 'pending'
    and request_body::jsonb #>> '{receptor,nombre}' = 'Receptor actualizado') then
    raise exception 'successful renewal did not create its own frozen request';
  end if;

  perform public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-missing', v_missing_owner, 'payment_intent.succeeded',
    'invoice-missing', 'onvo_test', 'sub-missing', v_initial || '{"id":"invoice-missing","payment_intent_id":"pi-missing"}',
    v_subscription, null, null, v_fiscal || '{"event_id":"evt-missing"}');
  select id into strict v_missing_job from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-missing'
    and state = 'review' and review_reason = 'missing_buyer' and request_body is null;
  if not exists (select 1 from public.coach_billing_accounts where coach_id = v_missing_owner and paid_through = '2027-01-01')
    or public.prepare_coach_billing_fiscal_job(v_missing_job) then
    raise exception 'missing data blocked valid access or incorrectly yielded a sendable receipt';
  end if;
  insert into public.coach_billing_fiscal_profiles (coach_id, receptor) values (v_missing_owner, v_buyer || '{"numero":"invalid"}');
  if public.prepare_coach_billing_fiscal_job(v_missing_job) then
    raise exception 'invalid fiscal data was accepted';
  end if;
  update public.coach_billing_fiscal_profiles set receptor = v_buyer where coach_id = v_missing_owner;
  v_recorded := public.prepare_coach_billing_fiscal_job(v_missing_job);
  if not v_recorded or public.prepare_coach_billing_fiscal_job(v_missing_job) then
    raise exception 'corrected buyer data was not frozen exactly once';
  end if;

  v_recorded := public.record_coach_billing_fiscal_review(v_mismatch_owner, 'onvo_test', 'sub-mismatch',
    v_initial || '{"id":"invoice-mismatch","payment_intent_id":"pi-mismatch"}',
    v_fiscal || '{"event_id":"evt-mismatch","review_reason":"payment_amount_mismatch"}');
  if not v_recorded or not exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-mismatch'
    and state = 'review' and review_reason = 'payment_amount_mismatch' and request_body is null)
    or exists (select 1 from public.coach_billing_accounts where coach_id = v_mismatch_owner and paid_through is not null) then
    raise exception 'review-only mismatch granted access or could be sent';
  end if;
  if public.record_coach_billing_fiscal_review(v_mismatch_owner, 'onvo_test', 'sub-mismatch',
    v_initial || '{"id":"invoice-mismatch","payment_intent_id":"pi-mismatch"}',
    v_fiscal || '{"event_id":"evt-mismatch","review_reason":"payment_amount_mismatch"}') then
    raise exception 'exact review replay reported a new incidence';
  end if;

  begin
    perform public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-rollback', v_mismatch_owner, 'payment_intent.succeeded',
      'invoice-rollback', 'onvo_test', 'sub-mismatch', v_initial || '{"id":"invoice-rollback","payment_intent_id":"pi-rollback"}',
      v_subscription || '{"status":"invalid"}', null, null, v_fiscal || '{"event_id":"evt-rollback"}');
    raise exception 'invalid billing event did not abort the transaction';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-rollback')
    or exists (select 1 from public.coach_billing_events where event_key = v_key || 'evt-rollback') then
    raise exception 'job or event survived failed signed payment transaction';
  end if;

  v_recorded := public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-invoice-conflict', v_owner, 'payment_intent.succeeded',
    'invoice-initial', 'onvo_test', 'sub-ready', v_initial || '{"payment_intent_id":"pi-other","amount":115000}',
    v_subscription, null, null, v_fiscal || '{"event_id":"evt-invoice-conflict"}');
  if v_recorded or not exists (select 1 from public.coach_billing_fiscal_jobs where id = v_job.id and state = 'review'
      and review_reason = 'invoice_conflict' and bonfire_request_id = v_receipt and estado_fiscal = 'aceptado')
    or not exists (select 1 from public.coach_billing_invoices where provider_invoice_id = 'invoice-initial'
      and amount = 113000 and payment_intent_id = 'pi-initial') then
    raise exception 'settlement conflict overwrote confirmed receipts';
  end if;
  begin
    update public.coach_billing_fiscal_jobs set request_body = '{}' where id = v_job.id;
    raise exception 'frozen request was mutable';
  exception when sqlstate '22000' then null;
  end;

  perform public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-cycle-conflict', v_owner, 'payment_intent.succeeded',
    'invoice-cycle-conflict', 'onvo_test', 'sub-ready', v_renewal || '{"id":"invoice-cycle-conflict","payment_intent_id":"pi-cycle-other"}',
    v_subscription, null, null, v_fiscal || '{"event_id":"evt-cycle-conflict","paid_at":"2027-01-01T06:00:00Z"}');
  if (select count(*) from public.coach_billing_fiscal_jobs where invoice_id in ('invoice-renewal', 'invoice-cycle-conflict')
    and state = 'review' and review_reason = 'duplicate_cycle') <> 2 then
    raise exception 'duplicate billing cycle escaped review';
  end if;
  v_recorded := public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-payment-conflict', v_owner, 'subscription_renewal.succeeded',
    'invoice-payment-conflict', 'onvo_test', 'sub-ready', v_initial || '{"id":"invoice-payment-conflict","period_start":"2027-02-01T06:00:00Z","period_end":"2027-03-01T06:00:00Z"}',
    v_subscription, null, null, v_fiscal || '{"event_id":"evt-payment-conflict"}');
  if v_recorded or not exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-payment-conflict'
      and state = 'review' and review_reason = 'duplicate_payment')
    or not exists (select 1 from public.coach_billing_accounts where coach_id = v_owner and paid_through = '2027-02-01') then
    raise exception 'duplicate payment intent was not reviewed or extended access twice';
  end if;

  v_recorded := public.record_coach_billing_signed_event_with_fiscal(v_key || 'evt-corrected-mismatch', v_mismatch_owner,
    'payment_intent.succeeded', 'invoice-mismatch', 'onvo_test', 'sub-mismatch',
    v_initial || '{"id":"invoice-mismatch","payment_intent_id":"pi-mismatch","amount":115000}',
    v_subscription, null, null, v_fiscal || '{"event_id":"evt-corrected-mismatch"}');
  if not v_recorded or not exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = 'invoice-mismatch'
    and state = 'review' and review_reason = 'invoice_conflict' and request_body is null)
    or not exists (select 1 from public.coach_billing_accounts where coach_id = v_mismatch_owner and paid_through = '2027-01-01') then
    raise exception 'a previous unverified observation blocked a later confirmed payment or cleared review';
  end if;

  perform public.record_coach_billing_signed_event_with_fiscal(v_key || '_evt-reference', v_owner, 'payment_intent.succeeded',
    '_invoice-reference', 'onvo_test', 'sub-ready', v_initial || '{"id":"_invoice-reference","payment_intent_id":"pi-reference","period_start":"2027-03-01T06:00:00Z","period_end":"2027-04-01T06:00:00Z"}',
    v_subscription, null, null, v_fiscal || '{"event_id":"_evt-reference","paid_at":"invalid"}');
  if not exists (select 1 from public.coach_billing_fiscal_jobs where invoice_id = '_invoice-reference'
    and state = 'review' and review_reason = 'invalid_fiscal_data' and request_body is null)
    or not exists (select 1 from public.coach_billing_accounts where coach_id = v_owner and paid_through = '2027-04-01') then
    raise exception 'unsupported Bonfire identifiers or incomplete fiscal time blocked billing';
  end if;
end;
$$;

rollback;
