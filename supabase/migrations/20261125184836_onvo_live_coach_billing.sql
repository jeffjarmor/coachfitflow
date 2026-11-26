begin;

alter table public.coach_billing_accounts
  drop constraint coach_billing_accounts_mode_check,
  add constraint coach_billing_accounts_mode_check check (mode in ('simulator', 'onvo_test', 'onvo_live'));

alter table public.coach_billing_invoices
  drop constraint coach_billing_invoices_provider_check,
  add constraint coach_billing_invoices_provider_check check (provider in ('simulator', 'onvo_test', 'onvo_live'));

alter table public.coach_billing_withdrawal_requests
  drop constraint coach_billing_withdrawal_requests_billing_mode_check,
  add constraint coach_billing_withdrawal_requests_billing_mode_check
    check (billing_mode in ('simulator', 'onvo_test', 'onvo_live'));

create unique index coach_billing_accounts_live_subscription_idx
  on public.coach_billing_accounts (subscription_id)
  where mode = 'onvo_live' and subscription_id is not null;

create unique index coach_billing_invoices_paid_live_intent_idx
  on public.coach_billing_invoices (payment_intent_id)
  where provider = 'onvo_live' and status = 'paid';

create or replace function public.record_coach_billing_invoice(
  p_provider text, p_provider_invoice_id text, p_coach_id uuid, p_subscription_id text,
  p_payment_intent_id text, p_status text, p_amount integer, p_currency text,
  p_created_at timestamptz, p_period_start timestamptz, p_period_end timestamptz
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare
  v_previous public.coach_billing_invoices;
  v_account_mode text;
  v_subscription_id text;
begin
  if p_provider is null or p_provider not in ('simulator', 'onvo_test', 'onvo_live')
    or p_status is null or p_status not in ('draft', 'open', 'paid', 'void', 'uncollectible', 'failed') then
    raise exception 'invalid billing invoice' using errcode = '22023';
  end if;

  select a.mode, a.subscription_id into v_account_mode, v_subscription_id
  from public.coach_billing_accounts a where a.coach_id = p_coach_id for no key update;

  if v_account_mode is not null and v_account_mode <> p_provider then
    raise exception 'billing invoice mode does not match the billing account' using errcode = '22023';
  end if;

  if p_provider = 'onvo_live' then
    if v_account_mode is distinct from p_provider or nullif(btrim(p_subscription_id), '') is null
      or v_subscription_id is distinct from p_subscription_id
      or not exists (
        select 1 from public.coaches c
        where c.id = p_coach_id and c.role = 'coach' and c.account_type = 'independent'
      ) then
      raise exception 'live billing invoice does not match an independent billing account' using errcode = '22023';
    end if;
    if p_status = 'paid' and (nullif(btrim(p_payment_intent_id), '') is null
      or p_amount is null or p_amount <= 0 or p_period_start is null or p_period_end is null
      or not isfinite(p_period_start) or not isfinite(p_period_end) or p_period_end <= p_period_start) then
      raise exception 'live paid billing invoice requires a confirmed payment and a valid period' using errcode = '22023';
    end if;
  end if;

  select * into v_previous from public.coach_billing_invoices
    where provider = p_provider and provider_invoice_id = p_provider_invoice_id for update;
  if v_previous.coach_id is not null and (v_previous.coach_id is distinct from p_coach_id
    or v_previous.subscription_id is distinct from p_subscription_id) then
    raise exception 'billing invoice already belongs to a different subscription' using errcode = '22023';
  end if;
  if p_provider = 'onvo_live' and v_previous.status = 'paid' then
    if p_status = 'paid' and (p_payment_intent_id is distinct from v_previous.payment_intent_id
      or p_amount is distinct from v_previous.amount or p_currency is distinct from v_previous.currency
      or p_period_start is distinct from v_previous.period_start or p_period_end is distinct from v_previous.period_end) then
      raise exception 'confirmed live billing invoice differs from the recorded payment' using errcode = '22000';
    end if;
    return false;
  end if;

  insert into public.coach_billing_invoices as i (provider, provider_invoice_id, coach_id,
    subscription_id, payment_intent_id, status, amount, currency, created_at, period_start, period_end)
  values (p_provider, p_provider_invoice_id, p_coach_id, p_subscription_id,
    p_payment_intent_id, p_status, p_amount, p_currency, p_created_at, p_period_start, p_period_end)
  on conflict (provider, provider_invoice_id) do update set
    payment_intent_id = excluded.payment_intent_id,
    status = case when i.status = 'paid' then 'paid' else excluded.status end,
    amount = excluded.amount,
    currency = excluded.currency,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    updated_at = now()
    where i.coach_id = excluded.coach_id and i.subscription_id = excluded.subscription_id
      and (i.provider <> 'onvo_live' or i.status <> 'paid');
  if not found then
    raise exception 'billing invoice changed concurrently or belongs to a different subscription' using errcode = '22000';
  end if;

  if p_status = 'paid' and p_period_end is not null then
    update public.coaches set coach_plan = 'paid',
      next_plan_payment_date = greatest(coalesce(next_plan_payment_date, p_period_end::date), p_period_end::date)
      where id = p_coach_id and role = 'coach' and account_type = 'independent';
    update public.coach_billing_accounts set
      paid_through = greatest(coalesce(paid_through, p_period_end::date), p_period_end::date),
      updated_at = now()
      where coach_id = p_coach_id and mode = p_provider;
  end if;

  return v_previous.status is distinct from 'paid';
end;
$$;

revoke all on function public.record_coach_billing_invoice(text, text, uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_coach_billing_invoice(text, text, uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz)
  to service_role;

commit;
