begin;

create table public.onvo_payout_settlements (
  payout_id text primary key check (length(btrim(payout_id)) between 1 and 200),
  event_id text not null unique check (length(btrim(event_id)) between 1 and 200),
  account_id text not null check (length(btrim(account_id)) between 1 and 200),
  reference text,
  settled_at timestamptz not null,
  provider_updated_at timestamptz not null,
  currency text not null check (currency in ('CRC', 'USD')),
  transaction_count integer not null check (transaction_count >= 0),
  gross_minor bigint not null check (gross_minor >= 0),
  fees_minor bigint check (fees_minor is null or fees_minor >= 0),
  payout_fee_minor bigint check (payout_fee_minor is null or payout_fee_minor >= 0),
  retentions_minor bigint check (retentions_minor is null or retentions_minor >= 0),
  net_minor bigint not null check (net_minor >= 0),
  received_at timestamptz not null default now()
);

alter table public.onvo_payout_settlements enable row level security;
revoke all on public.onvo_payout_settlements from public, anon, authenticated;
grant insert on public.onvo_payout_settlements to service_role;

create index onvo_payout_settlements_currency_date_idx
  on public.onvo_payout_settlements (currency, settled_at desc);

create index if not exists coach_billing_invoices_provider_coach_subscription_created_idx
  on public.coach_billing_invoices (provider, coach_id, subscription_id, created_at, provider_invoice_id);

create index if not exists coach_billing_invoices_provider_currency_created_idx
  on public.coach_billing_invoices (provider, currency, created_at desc);

create or replace function public.record_onvo_payout_settlement(
  p_payout_id text,
  p_event_id text,
  p_account_id text,
  p_reference text,
  p_settled_at timestamptz,
  p_provider_updated_at timestamptz,
  p_currency text,
  p_transaction_count integer,
  p_gross_minor bigint,
  p_fees_minor bigint,
  p_payout_fee_minor bigint,
  p_retentions_minor bigint,
  p_net_minor bigint
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_inserted integer;
begin
  insert into public.onvo_payout_settlements (
    payout_id, event_id, account_id, reference, settled_at, provider_updated_at,
    currency, transaction_count, gross_minor, fees_minor, payout_fee_minor,
    retentions_minor, net_minor
  ) values (
    p_payout_id, p_event_id, p_account_id, p_reference, p_settled_at,
    p_provider_updated_at, p_currency, p_transaction_count, p_gross_minor,
    p_fees_minor, p_payout_fee_minor, p_retentions_minor, p_net_minor
  ) on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.record_onvo_payout_settlement(
  text, text, text, text, timestamptz, timestamptz, text, integer,
  bigint, bigint, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.record_onvo_payout_settlement(
  text, text, text, text, timestamptz, timestamptz, text, integer,
  bigint, bigint, bigint, bigint, bigint
) to service_role;

create or replace function public.admin_billing_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', plans.id,
    'name', plans.name,
    'email', plans.email,
    'plan', plans.plan,
    'accessThrough', plans.access_through,
    'renewal', plans.renewal
  ) order by plans.name nulls last, plans.email nulls last, plans.id), '[]'::jsonb)
  into v_result
  from (
    select
      c.id,
      c.name,
      c.email,
      case when c.coach_plan = 'paid' then 'paid' else 'standard' end as plan,
      c.next_plan_payment_date as access_through,
      case
        when a.subscription_status = 'canceled'
          or coalesce(a.cancel_at_period_end, false)
          or a.cancel_at is not null then 'disabled'
        when a.subscription_status = 'active' then 'automatic'
        when a.subscription_status = 'past_due' then 'pending'
        when a.subscription_status = 'unpaid' then 'failed'
        else null
      end as renewal
    from public.coaches c
    left join public.coach_billing_accounts a
      on a.coach_id = c.id and a.mode = 'onvo_test'
    where c.role = 'coach' and c.account_type = 'independent'
  ) plans;

  return v_result;
end;
$$;

create or replace function public.admin_billing_report(p_month date, p_currency text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_previous_month_start timestamptz;
  v_previous_month_end timestamptz;
  v_as_of timestamptz := statement_timestamp();
  v_active_subscriptions integer;
  v_renewals_due integer;
  v_collected_minor numeric;
  v_previous_collected_minor numeric;
  v_movements jsonb;
  v_settlements jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'month must be the first day of a calendar month' using errcode = '22023';
  end if;
  if p_currency is null or p_currency not in ('USD', 'CRC') then
    raise exception 'currency must be USD or CRC' using errcode = '22023';
  end if;

  v_month_start := p_month::timestamp at time zone 'America/Costa_Rica';
  v_month_end := (p_month + interval '1 month')::date::timestamp at time zone 'America/Costa_Rica';
  v_previous_month_start := (p_month - interval '1 month')::date::timestamp at time zone 'America/Costa_Rica';
  v_previous_month_end := v_month_start;

  select count(*)::integer into v_active_subscriptions
  from public.coach_billing_accounts a
  join public.coaches c on c.id = a.coach_id
  where a.mode = 'onvo_test' and a.plan_currency = p_currency
    and a.subscription_status = 'active'
    and c.role = 'coach' and c.account_type = 'independent';

  select count(*)::integer into v_renewals_due
  from public.coach_billing_accounts a
  join public.coaches c on c.id = a.coach_id
  where a.mode = 'onvo_test' and a.plan_currency = p_currency
    and a.subscription_status in ('past_due', 'unpaid')
    and not coalesce(a.cancel_at_period_end, false) and a.cancel_at is null
    and a.current_period_end >= v_month_start and a.current_period_end < v_month_end
    and c.role = 'coach' and c.account_type = 'independent';

  select coalesce(sum(i.amount::bigint), 0) into v_collected_minor
  from public.coach_billing_invoices i
  where i.provider = 'onvo_test' and i.currency = p_currency and i.status = 'paid'
    and i.created_at >= v_month_start and i.created_at < v_month_end;

  select coalesce(sum(i.amount::bigint), 0) into v_previous_collected_minor
  from public.coach_billing_invoices i
  where i.provider = 'onvo_test' and i.currency = p_currency and i.status = 'paid'
    and i.created_at >= v_previous_month_start and i.created_at < v_previous_month_end;

  select coalesce(jsonb_agg(movement order by created_at desc, invoice_id desc), '[]'::jsonb)
  into v_movements
  from (
    select
      i.created_at,
      i.provider_invoice_id as invoice_id,
      jsonb_build_object(
        'id', i.provider_invoice_id,
        'coachName', coalesce(c.name, c.email, 'Coach'),
        'date', i.created_at,
        'status', i.status,
        'amountMinor', i.amount,
        'currency', i.currency,
        'kind', case when exists (
          select 1 from public.coach_billing_invoices older
          where older.provider = i.provider and older.coach_id = i.coach_id
            and older.subscription_id = i.subscription_id
            and (older.created_at, older.provider_invoice_id) < (i.created_at, i.provider_invoice_id)
        ) then 'renewal' else 'subscription' end
      ) as movement
    from public.coach_billing_invoices i
    join public.coaches c on c.id = i.coach_id
    where i.provider = 'onvo_test' and i.currency = p_currency
      and i.created_at >= v_month_start and i.created_at < v_month_end
  ) rows_for_month;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.payout_id,
    'reference', p.reference,
    'date', p.settled_at,
    'transactionCount', p.transaction_count,
    'grossMinor', p.gross_minor,
    'feesMinor', p.fees_minor,
    'payoutFeeMinor', p.payout_fee_minor,
    'retentionsMinor', p.retentions_minor,
    'netMinor', p.net_minor,
    'status', 'paid'
  ) order by p.settled_at desc, p.payout_id desc), '[]'::jsonb)
  into v_settlements
  from public.onvo_payout_settlements p
  where p.currency = p_currency and p.settled_at >= v_month_start and p.settled_at < v_month_end;

  return jsonb_build_object(
    'asOf', v_as_of,
    'activeSubscriptions', v_active_subscriptions,
    'renewalsDue', v_renewals_due,
    'collectedMinor', v_collected_minor,
    'previousCollectedMinor', v_previous_collected_minor,
    'movements', v_movements,
    'settlements', v_settlements
  );
end;
$$;

revoke all on function public.admin_billing_plans() from public, anon;
revoke all on function public.admin_billing_report(date, text) from public, anon;
grant execute on function public.admin_billing_plans() to authenticated;
grant execute on function public.admin_billing_report(date, text) to authenticated;

commit;
