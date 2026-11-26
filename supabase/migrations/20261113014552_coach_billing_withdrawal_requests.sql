begin;

create table public.coach_billing_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.coaches(id) on delete set null,
  billing_mode text not null check (billing_mode in ('simulator', 'onvo_test')),
  subscription_id text not null check (length(btrim(subscription_id)) > 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  first_paid_invoice_created_at timestamptz,
  requested_at timestamptz not null,
  refund_due_on date generated always as ((requested_at at time zone 'America/Costa_Rica')::date + 8) stored,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  resolved_at timestamptz,
  resolution_note text check (length(resolution_note) between 1 and 1000),
  unique (coach_id, subscription_id, billing_mode),
  check (
    (status = 'pending' and resolved_at is null and resolution_note is null)
    or (status <> 'pending' and resolved_at is not null and resolution_note is not null)
  )
);

create index coach_billing_withdrawal_requests_requested_at_idx
  on public.coach_billing_withdrawal_requests (requested_at desc, id);

alter table public.coach_billing_withdrawal_requests enable row level security;

revoke all on public.coach_billing_withdrawal_requests from public, anon, authenticated, service_role;
grant select on public.coach_billing_withdrawal_requests to authenticated;

create policy coach_billing_withdrawal_requests_select
  on public.coach_billing_withdrawal_requests for select to authenticated
  using (coach_id = (select auth.uid()) or (select public.is_admin()));

create schema coach_billing_private;

revoke all on schema coach_billing_private from public, anon, authenticated, service_role;
grant usage on schema coach_billing_private to authenticated;

create table coach_billing_private.withdrawal_resolutions (
  request_id uuid primary key references public.coach_billing_withdrawal_requests(id) on delete cascade,
  resolved_by uuid references public.coaches(id) on delete set null
);

alter table coach_billing_private.withdrawal_resolutions enable row level security;
revoke all on coach_billing_private.withdrawal_resolutions from public, anon, authenticated, service_role;

create function coach_billing_private.request_withdrawal(p_subscription_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach_id uuid := auth.uid();
  v_requested_at timestamptz := statement_timestamp();
  v_account public.coach_billing_accounts;
  v_request public.coach_billing_withdrawal_requests;
begin
  perform 1 from public.coaches c
    where c.id = v_coach_id and c.role = 'coach' and c.account_type = 'independent'
    for key share;
  if not found then
    raise exception 'Only independent coaches can request withdrawal' using errcode = '42501';
  end if;

  if nullif(btrim(p_subscription_id), '') is null then
    raise exception 'A subscription is required' using errcode = '22023';
  end if;

  select a.* into v_account from public.coach_billing_accounts a
    where a.coach_id = v_coach_id for share;

  if v_account.subscription_id is distinct from p_subscription_id then
    select r.* into v_request from public.coach_billing_withdrawal_requests r
      where r.coach_id = v_coach_id and r.subscription_id = p_subscription_id
      order by r.requested_at desc limit 1;
    if found then
      return to_jsonb(v_request);
    end if;
    raise exception 'The subscription does not match the current billing account' using errcode = '22023';
  end if;

  insert into public.coach_billing_withdrawal_requests (
    coach_id, billing_mode, subscription_id, current_period_start, current_period_end,
    first_paid_invoice_created_at, requested_at
  ) values (
    v_coach_id, v_account.mode, v_account.subscription_id, v_account.current_period_start,
    v_account.current_period_end, (
      select min(i.created_at) from public.coach_billing_invoices i
      where i.coach_id = v_coach_id and i.provider = v_account.mode
        and i.subscription_id = v_account.subscription_id and i.status = 'paid'
    ), v_requested_at
  ) on conflict (coach_id, subscription_id, billing_mode) do nothing
  returning * into v_request;

  if not found then
    select r.* into strict v_request from public.coach_billing_withdrawal_requests r
      where r.coach_id = v_coach_id and r.subscription_id = v_account.subscription_id
        and r.billing_mode = v_account.mode;
  end if;

  return to_jsonb(v_request);
end;
$$;

create function coach_billing_private.resolve_withdrawal(
  p_request_id uuid, p_status text, p_resolution_note text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_resolution_note text := regexp_replace(p_resolution_note, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_request public.coach_billing_withdrawal_requests;
begin
  if v_admin_id is null or not public.is_admin() then
    raise exception 'Only admins can resolve withdrawal requests' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('approved', 'rejected')
    or v_resolution_note is null or length(v_resolution_note) not between 1 and 1000 then
    raise exception 'A final decision and a resolution note of up to 1000 characters are required'
      using errcode = '22023';
  end if;

  update public.coach_billing_withdrawal_requests r
    set status = p_status, resolved_at = clock_timestamp(), resolution_note = v_resolution_note
    where r.id = p_request_id and r.status = 'pending'
    returning r.* into v_request;

  if found then
    insert into coach_billing_private.withdrawal_resolutions (request_id, resolved_by)
      values (v_request.id, v_admin_id);
    return to_jsonb(v_request);
  end if;

  select r.* into v_request from public.coach_billing_withdrawal_requests r
    where r.id = p_request_id;
  if not found then
    raise exception 'Withdrawal request was not found' using errcode = 'P0002';
  end if;
  if v_request.status = p_status and v_request.resolution_note = v_resolution_note then
    return to_jsonb(v_request);
  end if;
  raise exception 'Withdrawal request has already been resolved' using errcode = '55000';
end;
$$;

create function public.request_coach_billing_withdrawal(p_subscription_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coach_billing_private.request_withdrawal(p_subscription_id);
$$;

create function public.resolve_coach_billing_withdrawal(
  p_request_id uuid, p_status text, p_resolution_note text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select coach_billing_private.resolve_withdrawal(p_request_id, p_status, p_resolution_note);
$$;

revoke all on function coach_billing_private.request_withdrawal(text),
  coach_billing_private.resolve_withdrawal(uuid, text, text),
  public.request_coach_billing_withdrawal(text),
  public.resolve_coach_billing_withdrawal(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function coach_billing_private.request_withdrawal(text),
  coach_billing_private.resolve_withdrawal(uuid, text, text),
  public.request_coach_billing_withdrawal(text),
  public.resolve_coach_billing_withdrawal(uuid, text, text)
  to authenticated;

commit;
