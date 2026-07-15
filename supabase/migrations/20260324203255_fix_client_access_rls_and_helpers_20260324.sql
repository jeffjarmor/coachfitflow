create or replace function public.is_gym_owner(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_admin() or exists (
    select 1
    from public.gyms g
    where g.id = p_gym_id
      and g.owner_id = public.current_user_id()
  );
$$;

create or replace function public.is_gym_staff_member(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
  );
$$;

create or replace function public.is_membership_client(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.client_portal_access cpa
    where cpa.user_id = public.current_user_id()
      and cpa.client_gym_membership_id = p_membership_id
  );
$$;

create or replace function public.membership_gym_id(p_membership_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select cgm.gym_id
  from public.client_gym_memberships cgm
  where cgm.id = p_membership_id
  limit 1;
$$;

create or replace function public.can_manage_clients(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_edit_clients = true
  );
$$;

create or replace function public.can_create_routines(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_create_routines = true
  );
$$;

create or replace function public.can_manage_staff(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_manage_staff = true
  );
$$;

create or replace function public.can_view_payments(p_gym_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_gym_owner(p_gym_id) or exists (
    select 1
    from public.gym_staff gs
    where gs.gym_id = p_gym_id
      and gs.coach_id = public.current_user_id()
      and gs.can_view_payments = true
  );
$$;

create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_admin()
    or exists (
      select 1
      from public.clients c
      where c.id = p_client_id
        and c.primary_coach_id = public.current_user_id()
    )
    or exists (
      select 1
      from public.client_gym_memberships cgm
      where cgm.client_id = p_client_id
        and (
          public.is_gym_staff_member(cgm.gym_id)
          or public.is_membership_client(cgm.id)
        )
    );
$$;

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
for delete
using (public.can_access_client(id));

grant execute on function public.is_gym_owner(uuid) to anon, authenticated, service_role;
grant execute on function public.is_gym_staff_member(uuid) to anon, authenticated, service_role;
grant execute on function public.is_membership_client(uuid) to anon, authenticated, service_role;
grant execute on function public.membership_gym_id(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_clients(uuid) to anon, authenticated, service_role;
grant execute on function public.can_create_routines(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_staff(uuid) to anon, authenticated, service_role;
grant execute on function public.can_view_payments(uuid) to anon, authenticated, service_role;
grant execute on function public.can_access_client(uuid) to anon, authenticated, service_role;;
