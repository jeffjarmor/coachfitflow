alter policy coaches_select on public.coaches
using (
  is_admin()
  or id = current_user_id()
  or exists (
    select 1
    from public.gym_staff gs_current
    join public.gym_staff gs_target on gs_target.gym_id = gs_current.gym_id
    where gs_current.coach_id = current_user_id()
      and gs_target.coach_id = coaches.id
  )
  or exists (
    select 1
    from public.independent_client_portal_access icpa
    where icpa.user_id = current_user_id()
      and icpa.coach_id = coaches.id
  )
);;
