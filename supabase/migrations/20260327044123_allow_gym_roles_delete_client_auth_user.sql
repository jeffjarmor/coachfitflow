create or replace function public.admin_delete_auth_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_current_user uuid := public.current_user_id();
  v_authorized boolean := false;
begin
  if target_user_id is null then
    return;
  end if;

  if public.is_admin() then
    v_authorized := true;
  elsif v_current_user is not null then
    select exists (
      select 1
      from public.clients c
      join public.client_gym_memberships cgm on cgm.client_id = c.id
      left join public.gym_staff gs
        on gs.gym_id = cgm.gym_id
       and gs.coach_id = v_current_user
       and coalesce(gs.can_edit_clients, false) = true
      join public.gyms g on g.id = cgm.gym_id
      where c.user_id = target_user_id
        and (
          g.owner_id = v_current_user
          or gs.coach_id is not null
          or cgm.assigned_coach_id = v_current_user
        )
    ) into v_authorized;
  end if;

  if not coalesce(v_authorized, false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from public.client_portal_access where user_id = target_user_id;
  delete from public.activity_logins where user_id = target_user_id;
  update public.clients set user_id = null where user_id = target_user_id;

  delete from auth.users where id = target_user_id;
end;
$$;;
