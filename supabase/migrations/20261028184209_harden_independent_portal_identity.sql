begin;

-- Resolve the actual client owner under a fixed search path, without recursing
-- through clients_select (which depends on portal authorization itself).
create or replace function public.can_manage_independent_client_portal_access(
  p_client_id uuid, p_user_id uuid, p_coach_id uuid
)
returns boolean language sql stable security definer set search_path = ''
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
on public.independent_client_portal_access for all to authenticated
using (
  public.is_admin()
  or public.can_manage_independent_client_portal_access(client_id, user_id, coach_id)
)
with check (
  public.can_manage_independent_client_portal_access(client_id, user_id, coach_id)
);

-- Existing forged links must not remain an authorization source. Keep the
-- deployed plan gate and signature, and do not rewrite any stored identity.
create or replace function public.has_active_independent_client_portal_access(
  p_client_id uuid, p_user_id uuid default public.current_user_id()
)
returns boolean language sql stable security definer set search_path = ''
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
-- Preserve the existing function ACL: public policies already call this helper.
-- No new activation RPC, data cleanup, plan change, or gym policy is introduced.
commit;
