begin;

-- Validate existing trusted identities without depending on clients_select:
-- that policy itself checks portal links, including during a first self-upsert.
create or replace function public.can_manage_independent_client_portal_access(
  p_client_id uuid, p_user_id uuid, p_coach_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.clients client
    where client.id = p_client_id
      and (p_coach_id is null or p_coach_id = client.primary_coach_id)
      and (
        public.is_admin()
        or client.primary_coach_id = auth.uid()
        or (client.user_id = auth.uid() and p_user_id = auth.uid())
      )
  );
$$;
revoke all on function public.can_manage_independent_client_portal_access(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_manage_independent_client_portal_access(uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists independent_portal_access_self_or_coach on public.independent_client_portal_access;
create policy independent_portal_access_self_or_coach
on public.independent_client_portal_access
for all to authenticated
using (
  public.is_admin()
  or public.can_manage_independent_client_portal_access(client_id, user_id, coach_id)
)
with check (
  public.can_manage_independent_client_portal_access(client_id, user_id, coach_id)
);

-- Existing self-created links must not grant access after the policy is fixed.
create or replace function public.has_active_independent_client_portal_access(
  p_client_id uuid, p_user_id uuid default public.current_user_id()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.independent_client_portal_access access
    join public.clients client on client.id = access.client_id
    join public.coaches coach on coach.id = client.primary_coach_id
    where access.client_id = p_client_id
      and access.user_id = p_user_id
      and client.user_id = p_user_id
      and (access.coach_id is null or access.coach_id = client.primary_coach_id)
      and coach.account_type = 'independent'
      and coalesce(coach.coach_plan, 'standard') = 'paid'
      and coach.next_plan_payment_date is not null
      and coach.next_plan_payment_date >= current_date
  );
$$;
revoke all on function public.has_active_independent_client_portal_access(uuid, uuid) from public, anon;
grant execute on function public.has_active_independent_client_portal_access(uuid, uuid) to authenticated, service_role;

-- A portal login may acknowledge an invitation but cannot create or repair
-- access links. Direct profile/membership writes stay protected by their RLS.
create or replace function public.activate_current_client_portal_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  independent_activated integer := 0;
  gym_activated integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.clients client
  set portal_status = 'active', updated_at = pg_catalog.now()
  where client.portal_status = 'pending'
    and client.user_id = actor_id
    and exists (
      select 1 from public.independent_client_portal_access access
      where access.user_id = actor_id
        and access.client_id = client.id
        and (access.coach_id is null or access.coach_id = client.primary_coach_id)
    );
  get diagnostics independent_activated = row_count;

  update public.client_gym_memberships membership
  set portal_status = 'active', updated_at = pg_catalog.now()
  where membership.portal_status = 'pending'
    and exists (
      select 1 from public.client_portal_access access
      where access.user_id = actor_id
        and access.client_gym_membership_id = membership.id
    );
  get diagnostics gym_activated = row_count;

  return pg_catalog.jsonb_build_object('independent', independent_activated, 'gym', gym_activated);
end;
$$;

revoke all on function public.activate_current_client_portal_access() from public, anon;
grant execute on function public.activate_current_client_portal_access() to authenticated;
comment on function public.activate_current_client_portal_access() is
  'Acknowledges existing portal invitations for auth.uid() without granting access, changing identities, roles or billing.';

commit;
