begin;

drop policy if exists exercises_select on public.exercises;
create policy exercises_select
  on public.exercises
  for select
  using (
    source = 'global'::public.exercise_source
    or public.is_admin()
    or (source = 'coach'::public.exercise_source and coach_id = (select auth.uid()))
    or (
      source = 'coach'::public.exercise_source
      and gym_id is not null
      and (
        exists (
          select 1 from public.gym_staff staff
          where staff.gym_id = exercises.gym_id
            and staff.coach_id = (select auth.uid())
        )
        or exists (
          select 1 from public.gyms gym
          where gym.id = exercises.gym_id
            and gym.owner_id = (select auth.uid())
        )
      )
    )
    or exists (
      select 1
      from public.routine_day_exercises assignment
      join public.routine_days day on day.id = assignment.routine_day_id
      join public.routines routine on routine.id = day.routine_id
      where assignment.exercise_id = exercises.id
        and (
          (
            routine.client_gym_membership_id is null
            and public.has_active_independent_client_portal_access(routine.client_id, (select auth.uid()))
          )
          or (
            routine.client_gym_membership_id is not null
            and (
              exists (
                select 1 from public.client_portal_access access
                where access.client_gym_membership_id = routine.client_gym_membership_id
                  and access.user_id = (select auth.uid())
              )
              or exists (
                select 1 from public.clients client
                where client.id = routine.client_id
                  and client.user_id = (select auth.uid())
              )
            )
          )
        )
    )
  );

comment on policy exercises_select on public.exercises is
  'Shows global/owned exercises and assigned private exercises only to an authorized routine Portal profile.';

create or replace function public.save_portal_training_set(
  p_routine_id uuid,
  p_routine_day_id uuid,
  p_assignment_id uuid,
  p_set_number integer,
  p_actual_reps integer default null,
  p_rir integer default null,
  p_load numeric default null
)
returns table(
  training_session_id uuid,
  training_set_id uuid,
  session_status text,
  actual_reps integer,
  rir integer,
  load numeric,
  load_unit text
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_session_date date := (now() at time zone 'America/Costa_Rica')::date;
  v_client_id uuid;
  v_coach_id uuid;
  v_membership_id uuid;
  v_exercise_id uuid;
  v_exercise_name text;
  v_exercise_order integer;
  v_planned_sets integer;
  v_planned_reps text;
  v_session_id uuid;
  v_set_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_set_number is null or p_set_number < 1 then
    raise exception 'Invalid set number' using errcode = '22023';
  end if;
  if p_actual_reps is not null and (p_actual_reps < 0 or p_actual_reps > 999) then
    raise exception 'Invalid repetitions' using errcode = '22023';
  end if;
  if p_rir is not null and (p_rir < 0 or p_rir > 10) then
    raise exception 'Invalid RIR' using errcode = '22023';
  end if;
  if p_load is not null and (p_load < 0 or p_load > 999999.99) then
    raise exception 'Invalid load' using errcode = '22023';
  end if;

  select
    routine.client_id,
    routine.coach_id,
    routine.client_gym_membership_id,
    assignment.exercise_id,
    exercise.name,
    assignment.order_index,
    assignment.sets,
    assignment.reps
  into
    v_client_id,
    v_coach_id,
    v_membership_id,
    v_exercise_id,
    v_exercise_name,
    v_exercise_order,
    v_planned_sets,
    v_planned_reps
  from public.routines routine
  join public.routine_days day
    on day.routine_id = routine.id
   and day.id = p_routine_day_id
  join public.routine_day_exercises assignment
    on assignment.routine_day_id = day.id
   and assignment.id = p_assignment_id
  join public.exercises exercise on exercise.id = assignment.exercise_id
  where routine.id = p_routine_id;

  if v_client_id is null then
    raise exception 'Routine exercise is not available' using errcode = '42501';
  end if;
  if p_set_number > v_planned_sets then
    raise exception 'Set number exceeds the routine plan' using errcode = '22023';
  end if;
  if not (
    (
      v_membership_id is null
      and public.has_active_independent_client_portal_access(v_client_id, v_actor_id)
    )
    or (
      v_membership_id is not null
      and (
        exists (
          select 1 from public.client_portal_access access
          where access.client_gym_membership_id = v_membership_id
            and access.user_id = v_actor_id
        )
        or exists (
          select 1 from public.clients client
          where client.id = v_client_id
            and client.user_id = v_actor_id
        )
      )
    )
  ) then
    raise exception 'Portal profile cannot write this routine' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', v_actor_id::text, p_routine_id::text, p_routine_day_id::text, v_session_date::text),
    0
  ));

  select session.id
  into v_session_id
  from public.training_sessions session
  where session.routine_id = p_routine_id
    and session.routine_day_id = p_routine_day_id
    and session.client_id = v_client_id
    and session.client_gym_membership_id is not distinct from v_membership_id
    and session.session_date = v_session_date
  order by session.started_at desc
  limit 1;

  if p_actual_reps is null and p_rir is null and p_load is null then
    if v_session_id is not null then
      delete from public.training_session_sets training_set
      where training_set.training_session_id = v_session_id
        and training_set.routine_day_id = p_routine_day_id
        and training_set.exercise_order = v_exercise_order
        and training_set.set_number = p_set_number;

      if not exists (
        select 1 from public.training_session_sets training_set
        where training_set.training_session_id = v_session_id
          and (training_set.actual_reps is not null or training_set.rir is not null or training_set.load is not null)
      ) then
        delete from public.training_sessions session where session.id = v_session_id;
        v_session_id := null;
      end if;
    end if;

    return query select v_session_id, null::uuid, 'in_progress'::text,
      null::integer, null::integer, null::numeric, 'kg'::text;
    return;
  end if;

  if v_session_id is null then
    insert into public.training_sessions (
      routine_id,
      routine_day_id,
      client_id,
      coach_id,
      client_gym_membership_id,
      portal_scope,
      session_date,
      status
    ) values (
      p_routine_id,
      p_routine_day_id,
      v_client_id,
      v_coach_id,
      v_membership_id,
      case when v_membership_id is null then 'independent' else 'gym' end,
      v_session_date,
      'in_progress'
    )
    returning id into v_session_id;
  end if;

  insert into public.training_session_sets (
    training_session_id,
    routine_day_id,
    exercise_id,
    exercise_name,
    exercise_order,
    set_number,
    planned_reps,
    actual_reps,
    rir,
    load,
    load_unit,
    updated_at
  ) values (
    v_session_id,
    p_routine_day_id,
    v_exercise_id,
    v_exercise_name,
    v_exercise_order,
    p_set_number,
    v_planned_reps,
    p_actual_reps,
    p_rir,
    p_load,
    'kg',
    now()
  )
  on conflict on constraint training_session_sets_training_session_id_routine_day_id_ex_key
  do update set
    exercise_id = excluded.exercise_id,
    exercise_name = excluded.exercise_name,
    planned_reps = excluded.planned_reps,
    actual_reps = excluded.actual_reps,
    rir = excluded.rir,
    load = excluded.load,
    load_unit = excluded.load_unit,
    updated_at = now()
  returning id into v_set_id;

  update public.training_sessions session
  set status = 'in_progress', completed_at = null, updated_at = now()
  where session.id = v_session_id;

  return query select v_session_id, v_set_id, 'in_progress'::text,
    p_actual_reps, p_rir, p_load, 'kg'::text;
end;
$function$;

create or replace function public.complete_portal_training_session(p_session_id uuid)
returns table(training_session_id uuid, session_status text, completed_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_client_id uuid;
  v_membership_id uuid;
  v_completed_at timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select session.client_id, session.client_gym_membership_id
  into v_client_id, v_membership_id
  from public.training_sessions session
  where session.id = p_session_id;

  if v_client_id is null or not (
    (
      v_membership_id is null
      and public.has_active_independent_client_portal_access(v_client_id, v_actor_id)
    )
    or (
      v_membership_id is not null
      and (
        exists (
          select 1 from public.client_portal_access access
          where access.client_gym_membership_id = v_membership_id
            and access.user_id = v_actor_id
        )
        or exists (
          select 1 from public.clients client
          where client.id = v_client_id
            and client.user_id = v_actor_id
        )
      )
    )
  ) then
    raise exception 'Portal profile cannot complete this session' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.training_session_sets training_set
    where training_set.training_session_id = p_session_id
      and (training_set.actual_reps is not null or training_set.rir is not null or training_set.load is not null)
  ) then
    raise exception 'Complete at least one set before finishing' using errcode = '22023';
  end if;

  update public.training_sessions session
  set status = 'completed', completed_at = v_completed_at, updated_at = v_completed_at
  where session.id = p_session_id;

  return query select p_session_id, 'completed'::text, v_completed_at;
end;
$function$;

comment on function public.save_portal_training_set(uuid, uuid, uuid, integer, integer, integer, numeric) is
  'Atomically creates or resumes today''s authorized portal session and saves one prescribed set.';
comment on function public.complete_portal_training_session(uuid) is
  'Marks an authorized portal training session complete after at least one meaningful set.';

revoke all on function public.save_portal_training_set(uuid, uuid, uuid, integer, integer, integer, numeric)
  from public, anon;
revoke all on function public.complete_portal_training_session(uuid)
  from public, anon;
grant execute on function public.save_portal_training_set(uuid, uuid, uuid, integer, integer, integer, numeric)
  to authenticated, service_role;
grant execute on function public.complete_portal_training_session(uuid)
  to authenticated, service_role;

commit;
