begin;

drop policy if exists clients_update on public.clients;

create policy clients_update on public.clients
for update
using (
  public.is_admin()
  or primary_coach_id = public.current_user_id()
  or exists (
    select 1
    from public.client_gym_memberships membership
    where membership.client_id = clients.id
      and public.can_manage_clients(membership.gym_id)
  )
)
with check (
  public.is_admin()
  or primary_coach_id = public.current_user_id()
  or exists (
    select 1
    from public.client_gym_memberships membership
    where membership.client_id = clients.id
      and public.can_manage_clients(membership.gym_id)
  )
);

comment on policy clients_update on public.clients is
  'Limits profile updates to admins, the independent owner, or gym staff with client-management permission.';

commit;
