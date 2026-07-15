create or replace function public.can_access_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
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
      from public.clients c
      where c.id = p_client_id
        and c.user_id = public.current_user_id()
    )
    or exists (
      select 1
      from public.independent_client_portal_access icpa
      where icpa.client_id = p_client_id
        and icpa.user_id = public.current_user_id()
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
$function$;

alter policy routines_select on public.routines
using (
  is_admin()
  or coach_id = current_user_id()
  or (
    client_gym_membership_id is not null
    and (
      is_membership_client(client_gym_membership_id)
      or is_gym_staff_member(membership_gym_id(client_gym_membership_id))
    )
  )
  or (
    client_gym_membership_id is null
    and exists (
      select 1
      from public.clients c
      where c.id = routines.client_id
        and (
          c.user_id = current_user_id()
          or exists (
            select 1
            from public.independent_client_portal_access icpa
            where icpa.client_id = c.id
              and icpa.user_id = current_user_id()
          )
        )
    )
  )
);;
