drop policy if exists exercises_select on public.exercises;

create policy exercises_select
on public.exercises
for select
using (
  (
    source = 'global'::exercise_source
  )
  or is_admin()
  or (
    source = 'coach'::exercise_source
    and coach_id = current_user_id()
  )
  or (
    source = 'coach'::exercise_source
    and gym_id is not null
    and (
      exists (
        select 1
        from public.gym_staff gs
        where gs.gym_id = exercises.gym_id
          and gs.coach_id = current_user_id()
      )
      or exists (
        select 1
        from public.gyms g
        where g.id = exercises.gym_id
          and g.owner_id = current_user_id()
      )
    )
  )
);;
