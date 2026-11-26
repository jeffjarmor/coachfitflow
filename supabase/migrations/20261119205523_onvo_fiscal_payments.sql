begin;

create table public.onvo_fiscal_payments (
  mode text not null check (mode in ('test', 'live')),
  account_id text not null check (char_length(account_id) between 1 and 255 and account_id = btrim(account_id)),
  payment_intent_id text not null check (char_length(payment_intent_id) between 1 and 255 and payment_intent_id = btrim(payment_intent_id)),
  source_event_id text not null check (char_length(source_event_id) between 1 and 255 and source_event_id = btrim(source_event_id)),
  amount_minor bigint not null check (amount_minor between 1 and 9007199254740991),
  currency text not null check (currency collate "C" ~ '^[A-Z]{3}$'),
  payment_confirmed_at timestamptz not null check (isfinite(payment_confirmed_at)),
  created_at timestamptz not null default now(),
  primary key (mode, account_id, payment_intent_id)
);

comment on table public.onvo_fiscal_payments is
  'Verified ONVO payments received for fiscal processing. A row does not indicate that a tax invoice was issued.';

alter table public.onvo_fiscal_payments enable row level security;
revoke all on table public.onvo_fiscal_payments from public, anon, authenticated, service_role;
grant select, insert on table public.onvo_fiscal_payments to service_role;

create function public.record_onvo_fiscal_payment(
  p_mode text,
  p_account_id text,
  p_payment_intent_id text,
  p_source_event_id text,
  p_amount_minor bigint,
  p_currency text,
  p_payment_confirmed_at timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  recorded_amount bigint;
  recorded_currency text;
begin
  insert into public.onvo_fiscal_payments (
    mode, account_id, payment_intent_id, source_event_id, amount_minor, currency, payment_confirmed_at
  ) values (
    p_mode, p_account_id, p_payment_intent_id, p_source_event_id, p_amount_minor, p_currency, p_payment_confirmed_at
  )
  on conflict (mode, account_id, payment_intent_id) do nothing;

  if found then
    return true;
  end if;

  select amount_minor, currency into strict recorded_amount, recorded_currency
  from public.onvo_fiscal_payments
  where mode = p_mode and account_id = p_account_id and payment_intent_id = p_payment_intent_id;

  if recorded_amount <> p_amount_minor or recorded_currency <> p_currency then
    raise exception 'ONVO fiscal payment does not match the payment already recorded' using errcode = '22000';
  end if;

  return false;
end;
$$;

revoke all on function public.record_onvo_fiscal_payment(text, text, text, text, bigint, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_onvo_fiscal_payment(text, text, text, text, bigint, text, timestamptz)
  to service_role;

commit;
