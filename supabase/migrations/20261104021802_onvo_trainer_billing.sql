begin;

create table public.coach_billing_accounts (
  coach_id uuid primary key references public.coaches(id) on delete cascade,
  mode text not null check (mode in ('simulator', 'onvo_test')),
  customer_id text,
  subscription_id text,
  subscription_create_pending boolean not null default false,
  subscription_status text check (subscription_status is null or subscription_status in
    ('incomplete', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete_expired', 'trialing')),
  payment_method_id text,
  payment_method_brand text,
  payment_method_last4 text check (payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'),
  payment_method_exp_month integer check (payment_method_exp_month is null or payment_method_exp_month between 1 and 12),
  payment_method_exp_year integer,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  paid_through date,
  plan_price_id text,
  plan_name text not null default 'Pro',
  plan_amount integer check (plan_amount is null or plan_amount >= 0),
  plan_currency text,
  plan_interval text check (plan_interval is null or plan_interval in ('day', 'week', 'month', 'year')),
  plan_interval_count integer check (plan_interval_count is null or plan_interval_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_billing_invoices (
  provider text not null check (provider in ('simulator', 'onvo_test')),
  provider_invoice_id text not null,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  subscription_id text not null,
  payment_intent_id text,
  status text not null check (status in ('draft', 'open', 'paid', 'void', 'uncollectible', 'failed')),
  amount integer not null check (amount >= 0),
  currency text not null,
  created_at timestamptz not null,
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz not null default now(),
  primary key (provider, provider_invoice_id)
);

create index coach_billing_invoices_owner_period_idx
  on public.coach_billing_invoices (coach_id, period_end desc, created_at desc);

create table public.coach_billing_events (
  event_key text primary key,
  coach_id uuid not null references public.coaches(id) on delete cascade,
  event_type text not null,
  provider_object_id text not null,
  received_at timestamptz not null default now()
);

create table public.coach_billing_operations (
  coach_id uuid not null references public.coaches(id) on delete cascade,
  action text not null check (action in ('subscribe', 'cancel', 'change-payment-method')),
  claim_id uuid not null,
  lease_until timestamptz not null,
  primary key (coach_id, action)
);

alter table public.coach_billing_accounts enable row level security;
alter table public.coach_billing_invoices enable row level security;
alter table public.coach_billing_events enable row level security;
alter table public.coach_billing_operations enable row level security;

revoke all on public.coach_billing_accounts, public.coach_billing_invoices,
  public.coach_billing_events, public.coach_billing_operations from anon, authenticated;
grant select on public.coach_billing_accounts, public.coach_billing_invoices to authenticated;
grant all on public.coach_billing_accounts, public.coach_billing_invoices,
  public.coach_billing_events, public.coach_billing_operations to service_role;

create policy coach_billing_accounts_owner_select on public.coach_billing_accounts
  for select to authenticated using (
    coach_id = (select auth.uid()) and exists (
      select 1 from public.coaches c where c.id = coach_billing_accounts.coach_id
        and c.role = 'coach' and c.account_type = 'independent'
    )
  );

create policy coach_billing_invoices_owner_select on public.coach_billing_invoices
  for select to authenticated using (
    coach_id = (select auth.uid()) and exists (
      select 1 from public.coaches c where c.id = coach_billing_invoices.coach_id
        and c.role = 'coach' and c.account_type = 'independent'
    )
  );

create or replace function public.claim_coach_billing_operation(p_coach_id uuid, p_action text)
returns uuid language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare v_claim_id uuid;
begin
  if p_action not in ('subscribe', 'cancel', 'change-payment-method') then
    raise exception 'invalid billing action' using errcode = '22023';
  end if;
  insert into public.coach_billing_operations (coach_id, action, claim_id, lease_until)
    values (p_coach_id, p_action, gen_random_uuid(), now() + interval '3 minutes')
    on conflict (coach_id, action) do nothing
    returning claim_id into v_claim_id;
  return v_claim_id;
end;
$$;

create or replace function public.release_coach_billing_operation(
  p_coach_id uuid, p_action text, p_claim_id uuid
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare v_deleted integer;
begin
  delete from public.coach_billing_operations
    where coach_id = p_coach_id and action = p_action and claim_id = p_claim_id;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.claim_coach_billing_event(p_event_key text, p_coach_id uuid,
  p_event_type text, p_provider_object_id text)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare v_inserted integer;
begin
  insert into public.coach_billing_events (event_key, coach_id, event_type, provider_object_id)
    values (p_event_key, p_coach_id, p_event_type, p_provider_object_id)
    on conflict (event_key) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create or replace function public.record_coach_billing_invoice(
  p_provider text, p_provider_invoice_id text, p_coach_id uuid, p_subscription_id text,
  p_payment_intent_id text, p_status text, p_amount integer, p_currency text,
  p_created_at timestamptz, p_period_start timestamptz, p_period_end timestamptz
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare v_previous_status text;
begin
  if p_provider not in ('simulator', 'onvo_test') or p_status not in
      ('draft', 'open', 'paid', 'void', 'uncollectible', 'failed') then
    raise exception 'invalid billing invoice' using errcode = '22023';
  end if;
  select status into v_previous_status from public.coach_billing_invoices
    where provider = p_provider and provider_invoice_id = p_provider_invoice_id for update;
  insert into public.coach_billing_invoices (provider, provider_invoice_id, coach_id,
    subscription_id, payment_intent_id, status, amount, currency, created_at, period_start, period_end)
  values (p_provider, p_provider_invoice_id, p_coach_id, p_subscription_id,
    p_payment_intent_id, p_status, p_amount, p_currency, p_created_at, p_period_start, p_period_end)
  on conflict (provider, provider_invoice_id) do update set
    payment_intent_id = excluded.payment_intent_id,
    status = case when public.coach_billing_invoices.status = 'paid' then 'paid' else excluded.status end,
    amount = excluded.amount,
    currency = excluded.currency,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    updated_at = now();
  if p_status = 'paid' then
    update public.coaches set coach_plan = 'paid',
      next_plan_payment_date = greatest(coalesce(next_plan_payment_date, p_period_end::date), p_period_end::date)
      where id = p_coach_id and role = 'coach' and account_type = 'independent'
        and p_period_end is not null;
    update public.coach_billing_accounts set
      paid_through = greatest(coalesce(paid_through, p_period_end::date), p_period_end::date),
      updated_at = now()
      where coach_id = p_coach_id and p_period_end is not null;
  end if;
  return v_previous_status <> 'paid' or v_previous_status is null;
end;
$$;

revoke all on function public.claim_coach_billing_operation(uuid, text) from public, anon, authenticated;
revoke all on function public.release_coach_billing_operation(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.claim_coach_billing_event(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.record_coach_billing_invoice(text, text, uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_coach_billing_operation(uuid, text) to service_role;
grant execute on function public.release_coach_billing_operation(uuid, text, uuid) to service_role;
grant execute on function public.claim_coach_billing_event(text, uuid, text, text) to service_role;
grant execute on function public.record_coach_billing_invoice(text, text, uuid, text, text, text, integer, text, timestamptz, timestamptz, timestamptz) to service_role;

commit;
