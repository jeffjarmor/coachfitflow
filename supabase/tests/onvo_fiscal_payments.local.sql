-- Local integration test. Apply the migration before running this rollback-only script.
begin;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated'] loop
    if has_table_privilege(role_name, 'public.onvo_fiscal_payments', 'select,insert')
      or has_function_privilege(role_name,
        'public.record_onvo_fiscal_payment(text,text,text,text,bigint,text,timestamptz)', 'execute') then
      raise exception 'browser role % can access fiscal intake', role_name;
    end if;
  end loop;
  if has_table_privilege('service_role', 'public.onvo_fiscal_payments', 'update,delete,truncate') then
    raise exception 'service_role can change or delete verified payments';
  end if;
end;
$$;

set local role service_role;

do $$
begin
  if not public.record_onvo_fiscal_payment(
    'test', 'fiscal-test-account', 'fiscal-test-payment', 'fiscal-test-first-event', 1815, 'USD', now()
  ) then raise exception 'first confirmed payment was not recorded'; end if;

  if public.record_onvo_fiscal_payment(
    'test', 'fiscal-test-account', 'fiscal-test-payment', 'fiscal-test-renewal-event', 1815, 'USD', now() + interval '1 second'
  ) then raise exception 'another event for the same payment created a second row'; end if;

  if not public.record_onvo_fiscal_payment(
    'live', 'fiscal-test-account', 'fiscal-test-payment', 'fiscal-test-live-event', 1815, 'USD', now()
  ) then raise exception 'live payment overlapped with a test payment'; end if;

  if not public.record_onvo_fiscal_payment(
    'test', 'fiscal-test-other-account', 'fiscal-test-payment', 'fiscal-test-other-event', 1815, 'USD', now()
  ) then raise exception 'payment overlapped with another account'; end if;

  begin
    perform public.record_onvo_fiscal_payment(
      'test', 'fiscal-test-account', 'fiscal-test-payment', 'fiscal-test-conflicting-event', 1816, 'USD', now()
    );
    raise exception 'conflicting duplicate amount was accepted';
  exception when sqlstate '22000' then null;
  end;

  begin
    perform public.record_onvo_fiscal_payment(
      'test', 'fiscal-test-account', 'fiscal-test-payment', 'fiscal-test-conflicting-event', 1815, 'CRC', now()
    );
    raise exception 'conflicting duplicate currency was accepted';
  exception when sqlstate '22000' then null;
  end;

  begin
    perform public.record_onvo_fiscal_payment(
      'test', 'fiscal-test-account', 'fiscal-test-unpaid', 'fiscal-test-zero-event', 0, 'USD', now()
    );
    raise exception 'zero payment amount was accepted';
  exception when check_violation then null;
  end;

  if not exists (
    select 1 from public.onvo_fiscal_payments
    where mode = 'test' and account_id = 'fiscal-test-account' and payment_intent_id = 'fiscal-test-payment'
      and source_event_id = 'fiscal-test-first-event' and amount_minor = 1815 and currency = 'USD'
  ) then raise exception 'recorded payment changed during deduplication'; end if;
end;
$$;

rollback;
