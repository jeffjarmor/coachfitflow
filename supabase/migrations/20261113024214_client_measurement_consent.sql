begin;

create schema measurement_consent_private;
revoke all on schema measurement_consent_private from public, anon, authenticated, service_role;
grant usage on schema measurement_consent_private to authenticated;

-- The portal can edit clients.birth_date. Only a date entered or confirmed by
-- staff may establish eligibility to give online consent as an adult.
create table measurement_consent_private.staff_confirmed_birth_dates (
  client_id uuid primary key references public.clients(id) on delete cascade,
  birth_date date not null
);

create table measurement_consent_private.events (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  membership_id uuid references public.client_gym_memberships(id) on delete cascade,
  scope_id uuid not null,
  action text not null check (action in ('authorize_online', 'record_written', 'revoke')),
  version text,
  actor_id uuid references auth.users(id) on delete set null,
  subject_email_hash bytea not null,
  recorded_at timestamptz not null default clock_timestamp(),
  check ((action = 'revoke' and version is null) or (action <> 'revoke' and version is not null))
);

create index measurement_consent_event_scope_idx
  on measurement_consent_private.events (client_id, scope_id, membership_id, id desc);
create index measurement_consent_event_membership_idx
  on measurement_consent_private.events (membership_id) where membership_id is not null;
create index measurement_consent_event_actor_idx
  on measurement_consent_private.events (actor_id) where actor_id is not null;

alter table measurement_consent_private.staff_confirmed_birth_dates enable row level security;
alter table measurement_consent_private.events enable row level security;
revoke all on all tables in schema measurement_consent_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema measurement_consent_private from public, anon, authenticated, service_role;

-- Avoid using dates previously editable by linked Portal accounts as proof of age.
insert into measurement_consent_private.staff_confirmed_birth_dates (client_id, birth_date)
select c.id, c.birth_date from public.clients c
where c.birth_date is not null and c.user_id is null
  and not exists (select 1 from public.independent_client_portal_access access where access.client_id = c.id)
  and not exists (
    select 1 from public.client_portal_access access
    join public.client_gym_memberships membership on membership.id = access.client_gym_membership_id
    where membership.client_id = c.id
  );

-- Require the actual authenticated holder. Gym invitations can leave clients.user_id
-- empty, so match the confirmed Auth email to the client record and require the grant.
create function measurement_consent_private.is_portal_holder(
  p_client public.clients, p_membership_id uuid, p_user_id uuid
) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id and u.email_confirmed_at is not null
      and lower(btrim(u.email)) = lower(btrim(p_client.email))
      and (
        (p_membership_id is null and p_client.user_id = p_user_id and exists (
          select 1 from public.independent_client_portal_access a
          where a.client_id = p_client.id and a.user_id = p_user_id
            and (a.coach_id is null or a.coach_id = p_client.primary_coach_id)
        ))
        or (p_membership_id is not null and exists (
          select 1 from public.client_portal_access a
          where a.client_gym_membership_id = p_membership_id and a.user_id = p_user_id
        ))
      )
  );
$$;

create function measurement_consent_private.can_manage(
  p_client public.clients, p_gym_id uuid, p_actor uuid
) returns boolean
language sql stable set search_path = ''
as $$
  select p_actor is not null and (
    public.is_admin()
    or (p_gym_id is not null and public.can_manage_clients(p_gym_id))
    or (p_gym_id is null and p_client.primary_coach_id = p_actor and exists (
      select 1 from public.coaches c
      where c.id = p_actor and c.role = 'coach' and c.account_type = 'independent'
    ))
  );
$$;

create function measurement_consent_private.capture_staff_birth_date()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    return new;
  end if;

  if measurement_consent_private.can_manage(new, null, v_actor)
    or exists (
      select 1 from public.client_gym_memberships m where m.client_id = new.id
        and public.can_manage_clients(m.gym_id)
    )
    or (tg_op = 'INSERT' and new.primary_coach_id = v_actor and exists (
      select 1 from public.coaches c where c.id = v_actor
    )) then
    if new.birth_date is null then
      delete from measurement_consent_private.staff_confirmed_birth_dates d where d.client_id = new.id;
    else
      insert into measurement_consent_private.staff_confirmed_birth_dates (client_id, birth_date)
        values (new.id, new.birth_date)
      on conflict (client_id) do update set birth_date = excluded.birth_date;
    end if;
  end if;
  return new;
end;
$$;

create trigger capture_staff_measurement_consent_birth_date
  after insert or update of birth_date on public.clients
  for each row execute function measurement_consent_private.capture_staff_birth_date();

create function measurement_consent_private.latest_event(
  p_client_id uuid, p_membership_id uuid, p_scope_id uuid
) returns measurement_consent_private.events
language sql stable set search_path = ''
as $$
  select e.* from measurement_consent_private.events e
  where e.client_id = p_client_id and e.scope_id = p_scope_id
    and e.membership_id is not distinct from p_membership_id
  order by e.id desc limit 1;
$$;

create function measurement_consent_private.is_minor(p_client public.clients)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when p_client.birth_date > cutoff.day or confirmed.birth_date > cutoff.day then true
    when confirmed.birth_date <= cutoff.day then false
  end
  from (select ((now() at time zone 'America/Costa_Rica')::date - interval '18 years')::date as day) cutoff
  left join measurement_consent_private.staff_confirmed_birth_dates confirmed on confirmed.client_id = p_client.id;
$$;

create function measurement_consent_private.email_hash(p_email text)
returns bytea
language sql immutable set search_path = ''
as $$ select sha256(convert_to(lower(btrim(p_email)), 'UTF8')); $$;

create function measurement_consent_private.event_is_authorized(
  p_event measurement_consent_private.events, p_client public.clients
) returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(p_event.subject_email_hash = measurement_consent_private.email_hash(p_client.email) and (
    p_event.action = 'record_written' or (
      p_event.action = 'authorize_online'
        and measurement_consent_private.is_minor(p_client) is false
        and measurement_consent_private.is_portal_holder(p_client, p_event.membership_id, p_event.actor_id)
    )
  ), false);
$$;

create function measurement_consent_private.revoke_changed_profile_consent()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_email_hash bytea := measurement_consent_private.email_hash(new.email);
  v_identity_changed boolean := v_email_hash is distinct from measurement_consent_private.email_hash(old.email);
  v_independent_link_changed boolean := new.primary_coach_id is distinct from old.primary_coach_id
    or new.user_id is distinct from old.user_id;
  v_check_age boolean := old.birth_date is distinct from new.birth_date
    and measurement_consent_private.is_minor(new) is not false;
begin
  if v_identity_changed or v_independent_link_changed or v_check_age then
    insert into measurement_consent_private.events (client_id, membership_id, scope_id, action, actor_id, subject_email_hash)
    select new.id, previous.membership_id, previous.scope_id, 'revoke', auth.uid(), v_email_hash
    from (
      select distinct on (e.membership_id, e.scope_id) e.membership_id, e.scope_id, e.action
      from measurement_consent_private.events e where e.client_id = new.id
      order by e.membership_id, e.scope_id, e.id desc
    ) previous
    where previous.action <> 'revoke' and (v_identity_changed
      or (v_independent_link_changed and previous.membership_id is null)
      or (v_check_age and previous.action = 'authorize_online'));
  end if;
  return new;
end;
$$;

create trigger revoke_changed_measurement_consent
  after update of email, user_id, primary_coach_id, birth_date on public.clients
  for each row execute function measurement_consent_private.revoke_changed_profile_consent();

create function measurement_consent_private.consent(
  p_client_id uuid, p_membership_id uuid, p_action text, p_version text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client public.clients;
  v_gym_id uuid;
  v_scope_id uuid;
  v_is_minor boolean;
  v_can_manage boolean;
  v_is_holder boolean;
  v_can_authorize boolean;
  v_latest measurement_consent_private.events;
  v_authorized boolean;
begin
  if v_actor is null then
    raise exception 'Consent access denied' using errcode = '42501';
  end if;

  if p_action is null then
    select c.* into v_client from public.clients c where c.id = p_client_id;
  else
    -- Serializes authorization and revocation with measurement writes.
    select c.* into v_client from public.clients c where c.id = p_client_id for no key update;
  end if;

  if v_client.id is null then
    raise exception 'Consent access denied' using errcode = '42501';
  end if;

  if p_membership_id is null then
    v_scope_id := v_client.primary_coach_id;
  elsif p_action is null then
    select m.gym_id into v_gym_id from public.client_gym_memberships m
    where m.id = p_membership_id and m.client_id = p_client_id;
    v_scope_id := v_gym_id;
  else
    select m.gym_id into v_gym_id from public.client_gym_memberships m
    where m.id = p_membership_id and m.client_id = p_client_id for share;
    v_scope_id := v_gym_id;
  end if;

  if v_scope_id is null then
    raise exception 'Consent access denied' using errcode = '42501';
  end if;

  v_can_manage := measurement_consent_private.can_manage(v_client, v_gym_id, v_actor);
  v_is_holder := measurement_consent_private.is_portal_holder(v_client, p_membership_id, v_actor);
  if not (v_can_manage or v_is_holder) then
    raise exception 'Consent access denied' using errcode = '42501';
  end if;

  v_is_minor := measurement_consent_private.is_minor(v_client);
  v_can_authorize := v_is_holder and v_is_minor is false and (
    p_membership_id is not null or public.has_active_independent_client_portal_access(p_client_id, v_actor)
  );
  v_latest := measurement_consent_private.latest_event(p_client_id, p_membership_id, v_scope_id);
  v_authorized := measurement_consent_private.event_is_authorized(v_latest, v_client);

  if p_action is not null then
    if p_action not in ('authorize_online', 'record_written', 'revoke')
      or (p_action <> 'revoke' and p_version is distinct from '2026-11-12-v1') then
      raise exception 'Invalid measurement consent action or version' using errcode = '22023';
    end if;
    if (p_action = 'authorize_online' and not v_can_authorize)
      or (p_action = 'record_written' and not v_can_manage) then
      raise exception 'Consent action denied' using errcode = '42501';
    end if;

    if (p_action = 'revoke' and v_latest.action in ('authorize_online', 'record_written')) or (
      p_action <> 'revoke' and not (
        v_authorized and v_latest.action = p_action and v_latest.version = p_version
      )
    ) then
      insert into measurement_consent_private.events (client_id, membership_id, scope_id, action, version, actor_id, subject_email_hash)
      values (p_client_id, p_membership_id, v_scope_id, p_action,
        case when p_action <> 'revoke' then p_version end, v_actor, measurement_consent_private.email_hash(v_client.email))
      returning * into v_latest;
      v_authorized := p_action <> 'revoke';
    end if;
  end if;

  return jsonb_build_object(
    'authorized', v_authorized,
    'is_minor', v_is_minor,
    'source', case when v_authorized then case v_latest.action when 'authorize_online' then 'portal' else 'written' end end,
    'changed_at', v_latest.recorded_at,
    'can_authorize_online', v_can_authorize,
    'can_record_written', v_can_manage,
    'can_revoke', v_authorized
  );
end;
$$;

create function public.get_client_measurement_consent(p_client_id uuid, p_membership_id uuid default null)
returns jsonb
language sql security invoker set search_path = ''
as $$ select measurement_consent_private.consent(p_client_id, p_membership_id, null, null); $$;

create function public.set_client_measurement_consent(
  p_client_id uuid, p_membership_id uuid, p_action text, p_version text default null
) returns jsonb
language sql security invoker set search_path = ''
as $$ select measurement_consent_private.consent(p_client_id, p_membership_id, p_action, p_version); $$;

-- The legacy columns are global to a client, unlike context-scoped measurements.
-- Preserve historical values and allow clearing them. New values go in measurements.
create function measurement_consent_private.protect_global_metrics()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.weight is not null or new.height is not null then
      raise exception 'measurement_consent_required' using errcode = 'P0001';
    end if;
  elsif (new.weight is not null and new.weight is distinct from old.weight)
    or (new.height is not null and new.height is distinct from old.height) then
    raise exception 'measurement_consent_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger require_scoped_client_measurements
  before insert or update of weight, height on public.clients
  for each row when (not (
    session_user in ('postgres', 'supabase_admin') and current_setting('role', true) = 'none' and auth.uid() is null
  ))
  execute function measurement_consent_private.protect_global_metrics();

create function measurement_consent_private.require_consent_for_measurement()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_client public.clients;
  v_scope_id uuid;
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1
    and (to_jsonb(new) - array['client_gym_membership_id', 'routine_id'])
      = (to_jsonb(old) - array['client_gym_membership_id', 'routine_id'])
    and (new.client_gym_membership_id is not distinct from old.client_gym_membership_id
      or (new.client_gym_membership_id is null and not exists (
        select 1 from public.client_gym_memberships m where m.id = old.client_gym_membership_id
      )))
    and (new.routine_id is not distinct from old.routine_id or (new.routine_id is null and not exists (
      select 1 from public.routines r where r.id = old.routine_id
    ))) then
    -- Allow the existing foreign keys to clear deleted routine/membership links.
    return new;
  end if;

  if tg_op = 'UPDATE' and (new.client_id is distinct from old.client_id
    or new.client_gym_membership_id is distinct from old.client_gym_membership_id) then
    raise exception 'measurement_consent_required' using errcode = 'P0001';
  end if;

  select c.* into v_client from public.clients c where c.id = new.client_id for share;
  if new.client_gym_membership_id is null then
    v_scope_id := v_client.primary_coach_id;
  else
    select m.gym_id into v_scope_id from public.client_gym_memberships m
    where m.id = new.client_gym_membership_id and m.client_id = new.client_id for share;
  end if;

  if v_scope_id is null or not measurement_consent_private.event_is_authorized(
    measurement_consent_private.latest_event(new.client_id, new.client_gym_membership_id, v_scope_id), v_client
  ) then
    raise exception 'measurement_consent_required' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger require_consent_for_measurement
  before insert or update on public.measurements
  for each row when (not (
    session_user in ('postgres', 'supabase_admin') and current_setting('role', true) = 'none' and auth.uid() is null
  ))
  execute function measurement_consent_private.require_consent_for_measurement();

revoke execute on all functions in schema measurement_consent_private from public, anon, authenticated, service_role;
grant execute on function measurement_consent_private.consent(uuid, uuid, text, text) to authenticated;

revoke all on function public.get_client_measurement_consent(uuid, uuid),
  public.set_client_measurement_consent(uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.get_client_measurement_consent(uuid, uuid),
  public.set_client_measurement_consent(uuid, uuid, text, text) to authenticated;

commit;
