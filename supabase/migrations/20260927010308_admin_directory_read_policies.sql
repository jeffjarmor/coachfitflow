-- The global admin directory needs to resolve gym and membership context for
-- clients without making administrators members of every gym. Keep the
-- existing member/client policies intact and add narrowly scoped SELECT-only
-- policies for authenticated users whose coach row is an administrator.

drop policy if exists gyms_admin_select on public.gyms;
create policy gyms_admin_select
on public.gyms
for select
to authenticated
using ((select public.is_admin()));

drop policy if exists cgm_admin_select on public.client_gym_memberships;
create policy cgm_admin_select
on public.client_gym_memberships
for select
to authenticated
using ((select public.is_admin()));
