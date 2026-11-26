begin;

create table public.coach_billing_fiscal_profiles (
  coach_id uuid primary key references public.coaches(id) on delete cascade,
  receptor jsonb not null check (jsonb_typeof(receptor) = 'object')
);

create table public.coach_billing_fiscal_jobs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches(id) on delete set null,
  account_id text not null,
  invoice_id text not null,
  payment_intent_id text,
  subscription_id text not null,
  source_event_id text not null,
  price_id text,
  amount_minor bigint,
  currency text,
  payment_method text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  request_body text,
  idempotency_key text generated always as ('zummith-pro:' || id::text) stored unique,
  state text not null default 'review' check (state in ('pending', 'submitted', 'accepted', 'review')),
  review_reason text check (review_reason collate "C" ~ '^[a-z][a-z0-9_]{0,63}$'),
  review_event_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  bonfire_request_id uuid,
  estado_fiscal text,
  clave text,
  consecutivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, invoice_id),
  check ((lease_token is null) = (lease_expires_at is null)),
  check (state = 'review' or request_body is not null),
  check (state not in ('submitted', 'accepted') or bonfire_request_id is not null),
  check (state <> 'accepted' or (estado_fiscal is not distinct from 'aceptado' and clave is not null and consecutivo is not null))
);

comment on table public.coach_billing_fiscal_jobs is
  'STAG outbox for signed, commercial ONVO Test invoices. Bonfire emission is supervised separately.';

create index coach_billing_fiscal_jobs_payment_idx on public.coach_billing_fiscal_jobs (account_id, payment_intent_id);
create index coach_billing_fiscal_jobs_cycle_idx on public.coach_billing_fiscal_jobs (account_id, subscription_id, period_start);
create index coach_billing_fiscal_jobs_ready_idx on public.coach_billing_fiscal_jobs (next_attempt_at, created_at)
  where state in ('pending', 'submitted');

alter table public.coach_billing_fiscal_profiles enable row level security;
alter table public.coach_billing_fiscal_jobs enable row level security;
revoke all on public.coach_billing_fiscal_profiles, public.coach_billing_fiscal_jobs from public, anon, authenticated, service_role;
grant select, insert, update on public.coach_billing_fiscal_profiles, public.coach_billing_fiscal_jobs to service_role;

create function public.keep_coach_billing_fiscal_request()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
begin
  if row(new.id, new.account_id, new.invoice_id, new.payment_intent_id, new.subscription_id, new.source_event_id,
      new.price_id, new.amount_minor, new.currency, new.payment_method, new.paid_at, new.period_start, new.period_end)
    is distinct from row(old.id, old.account_id, old.invoice_id, old.payment_intent_id, old.subscription_id, old.source_event_id,
      old.price_id, old.amount_minor, old.currency, old.payment_method, old.paid_at, old.period_start, old.period_end)
    or (old.request_body is not null and new.request_body is distinct from old.request_body) then
    raise exception 'fiscal request cannot be rewritten' using errcode = '22000';
  end if;
  return new;
end;
$$;

create trigger keep_coach_billing_fiscal_request before update of id, account_id, invoice_id, payment_intent_id,
  subscription_id, source_event_id, price_id, amount_minor, currency, payment_method, paid_at, period_start, period_end,
  request_body on public.coach_billing_fiscal_jobs
  for each row execute function public.keep_coach_billing_fiscal_request();

create function public.normalize_coach_billing_fiscal_receptor(p_receptor jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = pg_catalog, public, pg_temp as $$
declare
  v_fields text[] := array['nombre', 'tipo', 'numero', 'actividad', 'correo'];
  v_address_fields text[] := array['provincia', 'canton', 'distrito', 'otrasSenas'];
  v_address jsonb := p_receptor->'ubicacion';
  v_nombre text := btrim(p_receptor->>'nombre');
  v_senas text := btrim(v_address->>'otrasSenas');
  v_tipo text := p_receptor->>'tipo';
  v_numero text := p_receptor->>'numero';
  v_correo text := p_receptor->>'correo';
  v_identification_pattern text;
begin
  if jsonb_typeof(p_receptor) is distinct from 'object' or jsonb_typeof(v_address) is distinct from 'object'
    or p_receptor - (v_fields || array['ubicacion']) <> '{}'::jsonb or v_address - v_address_fields <> '{}'::jsonb
    or exists (select 1 from unnest(v_fields) field where jsonb_typeof(p_receptor->field) is distinct from 'string')
    or exists (select 1 from unnest(v_address_fields) field where jsonb_typeof(v_address->field) is distinct from 'string') then
    return null;
  end if;

  v_identification_pattern := case v_tipo
    when '01' then '^[1-9][0-9]{8}$'
    when '02' then '^[0-9]{10}$'
    when '03' then '^[1-9][0-9]{10,11}$'
    when '04' then '^[0-9]{10}$'
  end;

  if v_identification_pattern is null or v_numero collate "C" !~ v_identification_pattern
    or char_length(v_nombre) not between 3 and 100 or char_length(v_senas) not between 5 and 160
    or (v_nombre || v_senas) collate "C" ~ U&'[\0001-\0008\000B\000C\000E-\001F\FFFE\FFFF]'
    or (p_receptor->>'actividad') collate "C" !~ '^[0-9]{4}\.[0-9]$'
    or char_length(v_correo) > 160
    or v_correo collate "C" !~ '^[A-Za-z0-9_]+([-+.''][A-Za-z0-9_]+)*@[A-Za-z0-9_]+([-.][A-Za-z0-9_]+)*\.[A-Za-z0-9_]+([-.][A-Za-z0-9_]+)*$'
    or (v_address->>'provincia') collate "C" !~ '^[1-7]$'
    or (v_address->>'canton') collate "C" !~ '^[0-9]{2}$' or v_address->>'canton' = '00'
    or (v_address->>'distrito') collate "C" !~ '^[0-9]{2}$' or v_address->>'distrito' = '00' then
    return null;
  end if;

  return p_receptor || jsonb_build_object('nombre', v_nombre, 'ubicacion', v_address || jsonb_build_object('otrasSenas', v_senas));
end;
$$;

create function public.coach_billing_fiscal_request_body(p_job public.coach_billing_fiscal_jobs, p_receptor jsonb)
returns text language sql stable security invoker set search_path = pg_catalog, public, pg_temp set timezone = 'UTC' as $$
  select jsonb_build_object(
    'eventoId', p_job.source_event_id,
    'referenciaExterna', p_job.invoice_id,
    'codigoServicio', 'pro-mensual',
    'ocurridoEn', p_job.paid_at,
    'periodo', jsonb_build_object('inicio', p_job.period_start, 'fin', p_job.period_end),
    'receptor', p_receptor,
    'pago', jsonb_build_object(
      'proveedor', 'onvo', 'cuenta', p_job.account_id, 'referencia', p_job.payment_intent_id,
      'montoMenor', p_job.amount_minor, 'moneda', p_job.currency, 'medioPago', p_job.payment_method
    )
  )::text
$$;

-- Lock the billing account first, then the commercial identities in a consistent order.
create function public.store_coach_billing_fiscal_job(
  p_coach_id uuid, p_subscription_id text, p_invoice jsonb, p_fiscal jsonb
) returns table (block_billing boolean, changed boolean)
language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare
  v_onvo_reference_pattern constant text := '^[A-Za-z0-9_-]{1,200}$';
  v_reference_pattern constant text := '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$';
  v_job public.coach_billing_fiscal_jobs;
  v_existing public.coach_billing_fiscal_jobs;
  v_paid_invoice public.coach_billing_invoices;
  v_receptor jsonb;
  v_normalized jsonb;
  v_account_price_id text;
  v_lock bigint;
  v_conflict text;
  v_paid_conflict boolean;
  v_job_conflict boolean;
  v_changed boolean := false;
begin
  select a.plan_price_id into v_account_price_id from public.coach_billing_accounts a join public.coaches c on c.id = a.coach_id
    where a.coach_id = p_coach_id and a.mode = 'onvo_test' and a.subscription_id = p_subscription_id
      and c.role = 'coach' and c.account_type = 'independent' for no key update of a;
  if not found then
    raise exception 'fiscal test sale does not match a coach subscription' using errcode = '22023';
  end if;

  v_job.coach_id := p_coach_id;
  v_job.subscription_id := p_subscription_id;
  v_job.account_id := p_fiscal->>'account_id';
  v_job.source_event_id := p_fiscal->>'event_id';
  v_job.invoice_id := p_invoice->>'id';
  v_job.payment_intent_id := p_invoice->>'payment_intent_id';
  if pg_input_is_valid(p_invoice->>'amount', 'bigint') then
    v_job.amount_minor := (p_invoice->>'amount')::bigint;
  end if;
  v_job.currency := p_invoice->>'currency';
  if pg_input_is_valid(p_invoice->>'period_start', 'timestamp with time zone') then
    v_job.period_start := (p_invoice->>'period_start')::timestamptz;
  end if;
  if pg_input_is_valid(p_invoice->>'period_end', 'timestamp with time zone') then
    v_job.period_end := (p_invoice->>'period_end')::timestamptz;
  end if;
  v_job.price_id := p_fiscal->>'price_id';
  v_job.payment_method := p_fiscal->>'payment_method';
  if pg_input_is_valid(p_fiscal->>'paid_at', 'timestamp with time zone') then
    v_job.paid_at := (p_fiscal->>'paid_at')::timestamptz;
  end if;
  v_job.review_reason := p_fiscal->>'review_reason';

  if (v_job.account_id collate "C" ~ v_onvo_reference_pattern and v_job.source_event_id collate "C" ~ v_onvo_reference_pattern
    and v_job.invoice_id collate "C" ~ v_onvo_reference_pattern) is not true then
    raise exception 'fiscal test sale reference is invalid' using errcode = '22023';
  end if;
  if v_job.review_reason collate "C" !~ '^[a-z][a-z0-9_]{0,63}$' then
    v_job.review_reason := 'invalid_fiscal_data';
  end if;

  for v_lock in
    select distinct hashtextextended(key::text, 0)
      from unnest(array[
        jsonb_build_array('bonfire-invoice', v_job.invoice_id),
        case when v_job.payment_intent_id is not null then jsonb_build_array('bonfire-payment', v_job.account_id, v_job.payment_intent_id) end,
        case when v_job.period_start is not null then jsonb_build_array('bonfire-cycle', v_job.account_id, v_job.subscription_id, extract(epoch from v_job.period_start)) end
      ]) key
      where key is not null order by 1
  loop
    perform pg_advisory_xact_lock(v_lock);
  end loop;

  select * into v_existing from public.coach_billing_fiscal_jobs j
    where j.account_id = v_job.account_id and j.invoice_id = v_job.invoice_id;

  select * into v_paid_invoice from public.coach_billing_invoices i
    where i.provider = 'onvo_test' and i.provider_invoice_id = v_job.invoice_id and i.status = 'paid';

  v_job_conflict := v_existing.id is not null and (
      v_existing.coach_id is distinct from v_job.coach_id
      or v_existing.subscription_id is distinct from v_job.subscription_id
      or v_existing.payment_intent_id is distinct from v_job.payment_intent_id
      or v_existing.amount_minor is distinct from v_job.amount_minor or v_existing.currency is distinct from v_job.currency
      or v_existing.period_start is distinct from v_job.period_start or v_existing.period_end is distinct from v_job.period_end
    );
  v_paid_conflict := v_paid_invoice.provider_invoice_id is not null and (
      v_paid_invoice.coach_id is distinct from v_job.coach_id or v_paid_invoice.subscription_id is distinct from v_job.subscription_id
      or v_paid_invoice.payment_intent_id is distinct from v_job.payment_intent_id
      or v_paid_invoice.amount is distinct from v_job.amount_minor or v_paid_invoice.currency is distinct from v_job.currency
      or v_paid_invoice.period_start is distinct from v_job.period_start or v_paid_invoice.period_end is distinct from v_job.period_end
    );

  if v_job_conflict or v_paid_conflict then
    v_conflict := 'invoice_conflict';
  elsif exists (select 1 from public.coach_billing_fiscal_jobs j
    where j.account_id = v_job.account_id and j.invoice_id <> v_job.invoice_id and j.payment_intent_id = v_job.payment_intent_id)
    or exists (select 1 from public.coach_billing_invoices i where i.provider = 'onvo_test' and i.status = 'paid'
      and i.provider_invoice_id <> v_job.invoice_id and i.payment_intent_id = v_job.payment_intent_id) then
    v_conflict := 'duplicate_payment';
  elsif exists (select 1 from public.coach_billing_fiscal_jobs j
    where j.account_id = v_job.account_id and j.invoice_id <> v_job.invoice_id
      and j.subscription_id = v_job.subscription_id and j.period_start = v_job.period_start)
    or exists (select 1 from public.coach_billing_invoices i where i.provider = 'onvo_test' and i.status = 'paid'
      and i.provider_invoice_id <> v_job.invoice_id and i.subscription_id = v_job.subscription_id and i.period_start = v_job.period_start) then
    v_conflict := 'duplicate_cycle';
  end if;

  if v_conflict is not null then
    -- Keep a lease already in flight so the worker can persist a receipt that Bonfire already issued.
    update public.coach_billing_fiscal_jobs j set state = 'review', review_reason = v_conflict,
      review_event_id = v_job.source_event_id, updated_at = now()
    where j.account_id = v_job.account_id and (j.invoice_id = v_job.invoice_id
      or j.payment_intent_id = v_job.payment_intent_id
      or (j.subscription_id = v_job.subscription_id and j.period_start = v_job.period_start))
      and row(j.state, j.review_reason, j.review_event_id) is distinct from row('review'::text, v_conflict, v_job.source_event_id);
    v_changed := found;
    v_job.review_reason := v_conflict;
  end if;

  -- An early observation under review can disagree with a later independently verified payment.
  -- Keep that fiscal review open without treating it as an already-confirmed payment.
  block_billing := v_paid_conflict or coalesce(v_conflict = 'duplicate_payment', false)
    or (v_job_conflict and (v_existing.request_body is not null or v_existing.coach_id is distinct from v_job.coach_id));

  if v_existing.id is not null then
    if v_conflict is null and v_job.review_reason is not null then
      update public.coach_billing_fiscal_jobs set state = 'review', review_reason = v_job.review_reason,
        review_event_id = v_job.source_event_id, updated_at = now()
      where id = v_existing.id and (review_reason is null or review_reason in ('missing_buyer', 'invalid_buyer'))
        and row(state, review_reason, review_event_id) is distinct from row('review'::text, v_job.review_reason, v_job.source_event_id);
      v_changed := found;
    end if;
    changed := v_changed;
    return next;
    return;
  end if;

  if v_job.review_reason is null then
    if (v_job.account_id collate "C" ~ v_reference_pattern and v_job.source_event_id collate "C" ~ v_reference_pattern
      and v_job.invoice_id collate "C" ~ v_reference_pattern and v_job.payment_intent_id collate "C" ~ v_reference_pattern
      and v_job.price_id collate "C" ~ v_reference_pattern
      and v_job.price_id = v_account_price_id
      and v_job.amount_minor between 1 and 9007199254740991 and v_job.currency in ('CRC', 'USD')
      and v_job.payment_method in ('02', '04') and isfinite(v_job.paid_at)
      and isfinite(v_job.period_start) and isfinite(v_job.period_end) and v_job.period_start < v_job.period_end) is not true then
      v_job.review_reason := 'invalid_fiscal_data';
    else
      select f.receptor into v_receptor from public.coach_billing_fiscal_profiles f where f.coach_id = p_coach_id;
      v_normalized := public.normalize_coach_billing_fiscal_receptor(v_receptor);
      if v_normalized is null then
        v_job.review_reason := case when v_receptor is null then 'missing_buyer' else 'invalid_buyer' end;
      else
        v_job.request_body := public.coach_billing_fiscal_request_body(v_job, v_normalized);
      end if;
    end if;
  end if;

  insert into public.coach_billing_fiscal_jobs (
    coach_id, account_id, invoice_id, payment_intent_id, subscription_id, source_event_id, price_id,
    amount_minor, currency, payment_method, paid_at, period_start, period_end, request_body, state, review_reason, review_event_id
  ) values (
    v_job.coach_id, v_job.account_id, v_job.invoice_id, v_job.payment_intent_id, v_job.subscription_id, v_job.source_event_id,
    v_job.price_id, v_job.amount_minor, v_job.currency, v_job.payment_method, v_job.paid_at, v_job.period_start, v_job.period_end,
    v_job.request_body, case when v_job.review_reason is null then 'pending' else 'review' end, v_job.review_reason,
    case when v_job.review_reason is not null then v_job.source_event_id end
  );
  changed := true;
  return next;
end;
$$;

create function public.record_coach_billing_signed_event_with_fiscal(
  p_event_key text, p_coach_id uuid, p_event_type text, p_provider_object_id text,
  p_provider text, p_subscription_id text, p_invoice jsonb, p_subscription jsonb,
  p_attempt_count integer, p_next_payment_attempt timestamptz, p_fiscal jsonb
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp set lock_timeout = '2s' as $$
declare
  v_block_billing boolean;
begin
  if p_provider is distinct from 'onvo_test' or p_event_type is null
    or p_event_type not in ('payment_intent.succeeded', 'subscription_renewal.succeeded')
    or p_invoice->>'status' is distinct from 'paid' or p_invoice->>'id' is distinct from p_provider_object_id
    or p_event_key is distinct from 'onvo-signed:onvo_test:' || (p_fiscal->>'account_id') || ':' || (p_fiscal->>'event_id') then
    raise exception 'fiscal intake requires a signed ONVO Test payment' using errcode = '22023';
  end if;

  if exists (select 1 from public.coach_billing_events where event_key = p_event_key) then
    return false;
  end if;

  select result.block_billing into strict v_block_billing
    from public.store_coach_billing_fiscal_job(p_coach_id, p_subscription_id, p_invoice, p_fiscal) result;
  if v_block_billing then
    return false;
  end if;

  return public.record_coach_billing_signed_event(
    p_event_key, p_coach_id, p_event_type, p_provider_object_id, p_provider, p_subscription_id,
    p_invoice, p_subscription, p_attempt_count, p_next_payment_attempt
  );
end;
$$;

create function public.record_coach_billing_fiscal_review(
  p_coach_id uuid, p_provider text, p_subscription_id text, p_invoice jsonb, p_fiscal jsonb
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp set lock_timeout = '2s' as $$
declare
  v_changed boolean;
begin
  if p_provider is distinct from 'onvo_test' or p_fiscal->>'review_reason' is null then
    raise exception 'fiscal review requires an ONVO Test sale and a review reason' using errcode = '22023';
  end if;
  select result.changed into strict v_changed
    from public.store_coach_billing_fiscal_job(p_coach_id, p_subscription_id, p_invoice, p_fiscal) result;
  return v_changed;
end;
$$;

create function public.prepare_coach_billing_fiscal_job(p_job_id uuid)
returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare
  v_job public.coach_billing_fiscal_jobs;
  v_receptor jsonb;
begin
  select * into v_job from public.coach_billing_fiscal_jobs j
    where j.id = p_job_id and j.state = 'review' and j.review_reason in ('missing_buyer', 'invalid_buyer')
      and j.request_body is null and j.bonfire_request_id is null and j.lease_token is null for no key update;
  if not found then return false; end if;

  select public.normalize_coach_billing_fiscal_receptor(f.receptor) into v_receptor
    from public.coach_billing_fiscal_profiles f where f.coach_id = v_job.coach_id;
  if v_receptor is null then return false; end if;

  update public.coach_billing_fiscal_jobs set request_body = public.coach_billing_fiscal_request_body(v_job, v_receptor),
    state = 'pending', review_reason = null, next_attempt_at = now(), updated_at = now() where id = p_job_id;
  return found;
end;
$$;

create function public.claim_coach_billing_fiscal_jobs(p_limit integer)
returns setof public.coach_billing_fiscal_jobs language sql security invoker set search_path = pg_catalog, public, pg_temp as $$
  with ready as (
    select id from public.coach_billing_fiscal_jobs
    where state in ('pending', 'submitted') and next_attempt_at <= now()
      and (lease_expires_at is null or lease_expires_at <= now())
    order by next_attempt_at, created_at, id for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 20))
  )
  update public.coach_billing_fiscal_jobs j set lease_token = gen_random_uuid(), lease_expires_at = now() + interval '2 minutes',
    attempt_count = j.attempt_count + 1, updated_at = now()
  from ready where ready.id = j.id returning j.*
$$;

create function public.finish_coach_billing_fiscal_job(
  p_job_id uuid, p_lease_token uuid, p_state text, p_next_attempt_at timestamptz,
  p_bonfire_request_id uuid, p_estado_fiscal text, p_clave text, p_consecutivo text, p_review_reason text
) returns boolean language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $$
declare
  v_job public.coach_billing_fiscal_jobs;
  v_receipt_conflict boolean;
begin
  select * into v_job from public.coach_billing_fiscal_jobs j
    where j.id = p_job_id and j.lease_token = p_lease_token and j.lease_expires_at > now() for no key update;
  if not found then return false; end if;

  v_receipt_conflict := v_job.bonfire_request_id is not null and p_bonfire_request_id is not null
    and v_job.bonfire_request_id <> p_bonfire_request_id;

  update public.coach_billing_fiscal_jobs set
    state = case when v_job.state = 'review' or v_receipt_conflict then 'review' else p_state end,
    review_reason = case when v_job.state = 'review' then v_job.review_reason
      when v_receipt_conflict then 'bonfire_request_conflict' else p_review_reason end,
    next_attempt_at = coalesce(p_next_attempt_at, now()),
    bonfire_request_id = coalesce(v_job.bonfire_request_id, p_bonfire_request_id),
    estado_fiscal = case when v_receipt_conflict then v_job.estado_fiscal else coalesce(p_estado_fiscal, v_job.estado_fiscal) end,
    clave = case when v_receipt_conflict then v_job.clave else coalesce(p_clave, v_job.clave) end,
    consecutivo = case when v_receipt_conflict then v_job.consecutivo else coalesce(p_consecutivo, v_job.consecutivo) end,
    lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_job_id;
  return found;
end;
$$;

revoke all on function public.keep_coach_billing_fiscal_request(),
  public.normalize_coach_billing_fiscal_receptor(jsonb),
  public.coach_billing_fiscal_request_body(public.coach_billing_fiscal_jobs, jsonb),
  public.store_coach_billing_fiscal_job(uuid, text, jsonb, jsonb),
  public.record_coach_billing_signed_event_with_fiscal(text, uuid, text, text, text, text, jsonb, jsonb, integer, timestamptz, jsonb),
  public.record_coach_billing_fiscal_review(uuid, text, text, jsonb, jsonb),
  public.prepare_coach_billing_fiscal_job(uuid), public.claim_coach_billing_fiscal_jobs(integer),
  public.finish_coach_billing_fiscal_job(uuid, uuid, text, timestamptz, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.normalize_coach_billing_fiscal_receptor(jsonb),
  public.coach_billing_fiscal_request_body(public.coach_billing_fiscal_jobs, jsonb),
  public.store_coach_billing_fiscal_job(uuid, text, jsonb, jsonb),
  public.record_coach_billing_signed_event_with_fiscal(text, uuid, text, text, text, text, jsonb, jsonb, integer, timestamptz, jsonb),
  public.record_coach_billing_fiscal_review(uuid, text, text, jsonb, jsonb),
  public.prepare_coach_billing_fiscal_job(uuid), public.claim_coach_billing_fiscal_jobs(integer),
  public.finish_coach_billing_fiscal_job(uuid, uuid, text, timestamptz, uuid, text, text, text, text)
  to service_role;

commit;
