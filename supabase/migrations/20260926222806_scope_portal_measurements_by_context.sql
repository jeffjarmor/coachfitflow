begin;

-- Measurement rows belong either to an independent coach/client relationship or
-- to one concrete gym membership. Checking only client_id allowed a Portal user
-- with one context to read rows created in another context for the same client.
drop policy if exists measurements_select on public.measurements;

create policy measurements_select on public.measurements
for select
to authenticated
using (
  public.is_admin()
  or (
    client_gym_membership_id is null
    and (
      exists (
        select 1
        from public.clients client
        where client.id = measurements.client_id
          and client.primary_coach_id = (select auth.uid())
      )
      or public.has_active_independent_client_portal_access(
        measurements.client_id,
        (select auth.uid())
      )
    )
  )
  or (
    client_gym_membership_id is not null
    and (
      public.is_gym_staff_member(public.membership_gym_id(client_gym_membership_id))
      or public.is_membership_client(client_gym_membership_id)
    )
  )
);

commit;
