begin;

create or replace function public.register_gym_payment(
  p_gym_id uuid,
  p_membership_id uuid,
  p_amount numeric,
  p_currency text default 'CRC',
  p_method text default null,
  p_paid_date timestamptz default now(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_payment_id uuid;
  v_current_due timestamptz;
  v_effective_paid_date timestamptz := coalesce(p_paid_date, now());
  v_next_due timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_view_payments(p_gym_id) then
    raise exception 'Payment permission required' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  select membership.next_payment_due_date
    into v_current_due
  from public.client_gym_memberships membership
  where membership.id = p_membership_id
    and membership.gym_id = p_gym_id
  for update;

  if not found then
    raise exception 'Gym membership not found' using errcode = 'P0002';
  end if;

  if v_current_due is not null and v_current_due::date > v_effective_paid_date::date then
    v_next_due := v_current_due + interval '1 month';
  else
    v_next_due := v_effective_paid_date + interval '1 month';
  end if;

  insert into public.payments (
    client_gym_membership_id,
    amount,
    currency,
    method,
    due_date,
    paid_date,
    status,
    notes,
    created_by
  ) values (
    p_membership_id,
    p_amount,
    coalesce(nullif(trim(p_currency), ''), 'CRC'),
    nullif(trim(coalesce(p_method, '')), ''),
    coalesce(v_current_due, v_effective_paid_date),
    v_effective_paid_date,
    'paid',
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  ) returning id into v_payment_id;

  update public.client_gym_memberships
  set next_payment_due_date = v_next_due,
      subscription_status = 'active',
      updated_at = now()
  where id = p_membership_id;

  return v_payment_id;
end;
$$;

revoke all on function public.register_gym_payment(uuid, uuid, numeric, text, text, timestamptz, text)
  from public, anon;
grant execute on function public.register_gym_payment(uuid, uuid, numeric, text, text, timestamptz, text)
  to authenticated;

comment on function public.register_gym_payment(uuid, uuid, numeric, text, text, timestamptz, text) is
  'Registers a paid gym membership charge and advances the next due date atomically for authorized payment staff.';

commit;
