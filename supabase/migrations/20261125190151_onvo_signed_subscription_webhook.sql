begin;

alter table public.coach_billing_accounts
  add column onvo_subscription_updated_at timestamptz;

alter table public.coach_billing_events
  add column attempt_count integer check (attempt_count >= 0),
  add column next_payment_attempt timestamptz;

-- User-initiated reconciliation writes to the same row as signed deliveries.
create function public.keep_latest_onvo_subscription_state()
returns trigger language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  if new.mode = old.mode and new.subscription_id = old.subscription_id
    and old.onvo_subscription_updated_at is not null
    and (new.onvo_subscription_updated_at is null or new.onvo_subscription_updated_at < old.onvo_subscription_updated_at) then
    new.subscription_status := old.subscription_status;
    new.current_period_start := old.current_period_start;
    new.current_period_end := old.current_period_end;
    new.cancel_at_period_end := old.cancel_at_period_end;
    new.cancel_at := old.cancel_at;
    new.canceled_at := old.canceled_at;
    new.onvo_subscription_updated_at := old.onvo_subscription_updated_at;
  end if;
  return new;
end;
$$;

revoke all on function public.keep_latest_onvo_subscription_state() from public, anon, authenticated;

create trigger keep_latest_onvo_subscription_state
before update of onvo_subscription_updated_at on public.coach_billing_accounts
for each row execute function public.keep_latest_onvo_subscription_state();

create function public.record_coach_billing_signed_event(
  p_event_key text, p_coach_id uuid, p_event_type text, p_provider_object_id text,
  p_provider text, p_subscription_id text, p_invoice jsonb, p_subscription jsonb,
  p_attempt_count integer, p_next_payment_attempt timestamptz
) returns boolean language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
set lock_timeout = '2s' as $$
declare
  v_account public.coach_billing_accounts;
  v_is_failure boolean := p_event_type = 'subscription_renewal.failed';
  v_invoice_status text := p_invoice->>'status';
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_provider_updated_at timestamptz;
begin
  if p_provider is null or p_provider not in ('onvo_test', 'onvo_live')
    or p_event_type is null or p_event_type not in (
      'payment_intent.succeeded', 'subscription_renewal.succeeded', 'subscription_renewal.failed'
    )
    or nullif(btrim(p_event_key), '') is null or nullif(btrim(p_provider_object_id), '') is null
    or nullif(btrim(p_subscription_id), '') is null then
    raise exception 'invalid signed billing event' using errcode = '22023';
  end if;

  select a.* into v_account from public.coach_billing_accounts a
    join public.coaches c on c.id = a.coach_id
    where a.coach_id = p_coach_id and a.mode = p_provider and a.subscription_id = p_subscription_id
      and c.role = 'coach' and c.account_type = 'independent'
    for no key update of a;
  if not found then
    raise exception 'signed billing event does not match an independent billing account' using errcode = '22023';
  end if;

  insert into public.coach_billing_events
    (event_key, coach_id, event_type, provider_object_id, attempt_count, next_payment_attempt)
  values (p_event_key, p_coach_id, p_event_type, p_provider_object_id, p_attempt_count, p_next_payment_attempt)
  on conflict (event_key) do nothing;
  if not found then return false; end if;

  -- A failure may arrive after the same renewal has already been paid.
  if v_is_failure and (p_invoice is null or exists (
    select 1 from public.coach_billing_invoices i
      where i.provider = p_provider and i.provider_invoice_id = p_provider_object_id
        and i.coach_id = p_coach_id and i.subscription_id = p_subscription_id and i.status = 'paid'
  )) then
    return true;
  end if;

  if p_invoice->>'id' is distinct from p_provider_object_id
    or v_invoice_status is null
    or (v_is_failure and v_invoice_status = 'paid')
    or (not v_is_failure and v_invoice_status <> 'paid')
    or p_subscription->>'status' is null then
    raise exception 'signed billing event has incompatible renewal or subscription data' using errcode = '22023';
  end if;

  perform public.record_coach_billing_invoice(
    p_provider, p_provider_object_id, p_coach_id, p_subscription_id, p_invoice->>'payment_intent_id',
    v_invoice_status, (p_invoice->>'amount')::integer, p_invoice->>'currency',
    (p_invoice->>'created_at')::timestamptz, (p_invoice->>'period_start')::timestamptz,
    (p_invoice->>'period_end')::timestamptz
  );

  v_period_start := (p_subscription->>'current_period_start')::timestamptz;
  v_period_end := (p_subscription->>'current_period_end')::timestamptz;
  v_provider_updated_at := (p_subscription->>'updated_at')::timestamptz;

  update public.coach_billing_accounts set
    subscription_status = p_subscription->>'status',
    current_period_start = coalesce(v_period_start, current_period_start),
    current_period_end = coalesce(v_period_end, current_period_end),
    cancel_at_period_end = coalesce((p_subscription->>'cancel_at_period_end')::boolean, false),
    cancel_at = (p_subscription->>'cancel_at')::timestamptz,
    canceled_at = (p_subscription->>'canceled_at')::timestamptz,
    onvo_subscription_updated_at = coalesce(v_provider_updated_at, onvo_subscription_updated_at),
    updated_at = now()
  where coach_id = p_coach_id
    and (v_account.current_period_end is null or v_period_end >= v_account.current_period_end)
    and (v_account.onvo_subscription_updated_at is null
      or v_provider_updated_at >= v_account.onvo_subscription_updated_at);

  return true;
end;
$$;

revoke all on function public.record_coach_billing_signed_event(text, uuid, text, text, text, text, jsonb, jsonb, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_coach_billing_signed_event(text, uuid, text, text, text, text, jsonb, jsonb, integer, timestamptz)
  to service_role;

commit;
