drop policy if exists coaches_select on public.coaches;

create policy coaches_select on public.coaches
for select
using (
  is_admin()
  or id = current_user_id()
  or exists (
    select 1
    from public.gym_staff gs_current
    join public.gym_staff gs_target
      on gs_target.gym_id = gs_current.gym_id
    where gs_current.coach_id = current_user_id()
      and gs_target.coach_id = public.coaches.id
  )
);;
