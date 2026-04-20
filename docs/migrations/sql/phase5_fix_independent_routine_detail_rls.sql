alter policy routine_days_select on public.routine_days
using (
  exists (
    select 1
    from public.routines r
    where r.id = routine_days.routine_id
      and (
        is_admin()
        or r.coach_id = current_user_id()
        or (
          r.client_gym_membership_id is not null
          and is_membership_client(r.client_gym_membership_id)
        )
        or (
          r.client_gym_membership_id is not null
          and is_gym_staff_member(membership_gym_id(r.client_gym_membership_id))
        )
        or (
          r.client_gym_membership_id is null
          and exists (
            select 1
            from public.clients c
            where c.id = r.client_id
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
      )
  )
);

alter policy rde_select on public.routine_day_exercises
using (
  exists (
    select 1
    from public.routine_days rd
    join public.routines r on r.id = rd.routine_id
    where rd.id = routine_day_exercises.routine_day_id
      and (
        is_admin()
        or r.coach_id = current_user_id()
        or (
          r.client_gym_membership_id is not null
          and is_membership_client(r.client_gym_membership_id)
        )
        or (
          r.client_gym_membership_id is not null
          and is_gym_staff_member(membership_gym_id(r.client_gym_membership_id))
        )
        or (
          r.client_gym_membership_id is null
          and exists (
            select 1
            from public.clients c
            where c.id = r.client_id
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
      )
  )
);

alter policy rwc_select on public.routine_week_configs
using (
  exists (
    select 1
    from public.routine_day_exercises rde
    join public.routine_days rd on rd.id = rde.routine_day_id
    join public.routines r on r.id = rd.routine_id
    where rde.id = routine_week_configs.routine_day_exercise_id
      and (
        is_admin()
        or r.coach_id = current_user_id()
        or (
          r.client_gym_membership_id is not null
          and is_membership_client(r.client_gym_membership_id)
        )
        or (
          r.client_gym_membership_id is not null
          and is_gym_staff_member(membership_gym_id(r.client_gym_membership_id))
        )
        or (
          r.client_gym_membership_id is null
          and exists (
            select 1
            from public.clients c
            where c.id = r.client_id
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
      )
  )
);

alter policy rwe_select on public.routine_warmup_exercises
using (
  exists (
    select 1
    from public.routines r
    where r.id = routine_warmup_exercises.routine_id
      and (
        is_admin()
        or r.coach_id = current_user_id()
        or (
          r.client_gym_membership_id is not null
          and is_membership_client(r.client_gym_membership_id)
        )
        or (
          r.client_gym_membership_id is not null
          and is_gym_staff_member(membership_gym_id(r.client_gym_membership_id))
        )
        or (
          r.client_gym_membership_id is null
          and exists (
            select 1
            from public.clients c
            where c.id = r.client_id
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
      )
  )
);
