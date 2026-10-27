begin;

create or replace function public.save_routine_plan(
  p_coach_id uuid,
  p_plan jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_routine_id uuid;
  v_client_id uuid;
  v_day jsonb;
  v_day_id uuid;
  v_day_count integer;
  v_exercise jsonb;
  v_day_exercise_id uuid;
  v_week jsonb;
  v_warmup_id text;
  v_warmup_order integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_coach_id is null or (p_coach_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Coach scope not allowed' using errcode = '42501';
  end if;

  v_client_id := nullif(p_plan->>'client_id', '')::uuid;
  if v_client_id is null or not exists (
    select 1
    from public.clients c
    where c.id = v_client_id
      and (c.primary_coach_id = p_coach_id or public.is_admin())
  ) then
    raise exception 'Client not available for this coach' using errcode = '42501';
  end if;

  if nullif(p_plan->>'name', '') is null
    or nullif(p_plan->>'objective', '') is null
    or jsonb_array_length(coalesce(p_plan->'days', '[]'::jsonb)) = 0 then
    raise exception 'Routine name, objective and days are required' using errcode = '22023';
  end if;
  v_day_count := jsonb_array_length(p_plan->'days');

  if nullif(p_plan->>'id', '') is null then
    insert into public.routines (
      coach_id, client_id, name, objective, training_days_count,
      duration_weeks, start_date, end_date, notes,
      warmup_enabled, warmup_custom_text
    ) values (
      p_coach_id,
      v_client_id,
      trim(p_plan->>'name'),
      trim(p_plan->>'objective'),
      v_day_count,
      greatest(1, coalesce((p_plan->>'duration_weeks')::integer, 1)),
      nullif(p_plan->>'start_date', '')::date,
      nullif(p_plan->>'end_date', '')::date,
      nullif(trim(coalesce(p_plan->>'notes', '')), ''),
      coalesce((p_plan->'warmup'->>'enabled')::boolean, false),
      nullif(trim(coalesce(p_plan->'warmup'->>'custom_text', '')), '')
    ) returning id into v_routine_id;
  else
    v_routine_id := (p_plan->>'id')::uuid;

    if not exists (
      select 1 from public.routines r
      where r.id = v_routine_id
        and r.coach_id = p_coach_id
        and r.client_id = v_client_id
    ) then
      raise exception 'Routine not available for this coach' using errcode = '42501';
    end if;

    update public.routines
    set name = trim(p_plan->>'name'),
        objective = trim(p_plan->>'objective'),
        training_days_count = v_day_count,
        duration_weeks = greatest(1, coalesce((p_plan->>'duration_weeks')::integer, 1)),
        start_date = nullif(p_plan->>'start_date', '')::date,
        end_date = nullif(p_plan->>'end_date', '')::date,
        notes = nullif(trim(coalesce(p_plan->>'notes', '')), ''),
        warmup_enabled = coalesce((p_plan->'warmup'->>'enabled')::boolean, false),
        warmup_custom_text = nullif(trim(coalesce(p_plan->'warmup'->>'custom_text', '')), ''),
        updated_at = now()
    where id = v_routine_id;

    -- Training sessions reference routine_days with ON DELETE CASCADE. Keep the
    -- existing day IDs when editing so saved RIR history is not erased.
    if exists (
      select 1
      from public.training_sessions ts
      join public.routine_days rd on rd.id = ts.routine_day_id
      where rd.routine_id = v_routine_id
        and rd.day_number > v_day_count
    ) then
      raise exception 'Cannot remove a routine day with training history' using errcode = '23503';
    end if;
    delete from public.routine_days
    where routine_id = v_routine_id and day_number > v_day_count;
    delete from public.routine_warmup_exercises where routine_id = v_routine_id;
  end if;

  for v_day in
    select value from jsonb_array_elements(p_plan->'days')
  loop
    select id into v_day_id
    from public.routine_days
    where routine_id = v_routine_id
      and day_number = (v_day->>'day_number')::integer
    for update;

    if v_day_id is null then
      insert into public.routine_days (
        routine_id, day_number, day_name, muscle_groups, notes
      ) values (
        v_routine_id,
        (v_day->>'day_number')::integer,
        trim(v_day->>'day_name'),
        array(select jsonb_array_elements_text(coalesce(v_day->'muscle_groups', '[]'::jsonb))),
        nullif(trim(coalesce(v_day->>'notes', '')), '')
      ) returning id into v_day_id;
    else
      update public.routine_days
      set day_name = trim(v_day->>'day_name'),
          muscle_groups = array(select jsonb_array_elements_text(coalesce(v_day->'muscle_groups', '[]'::jsonb))),
          notes = nullif(trim(coalesce(v_day->>'notes', '')), '')
      where id = v_day_id;
      delete from public.routine_day_exercises where routine_day_id = v_day_id;
    end if;

    for v_exercise in
      select value from jsonb_array_elements(coalesce(v_day->'exercises', '[]'::jsonb))
    loop
      if not exists (
        select 1 from public.exercises e
        where e.id = (v_exercise->>'exercise_id')::uuid
          and (e.source = 'global' or e.coach_id = p_coach_id)
      ) then
        raise exception 'Exercise not available for this coach' using errcode = '42501';
      end if;

      insert into public.routine_day_exercises (
        routine_day_id, exercise_id, sets, reps, rest, notes,
        is_superset, video_url, image_url, order_index,
        block_type, block_id, block_label, block_position, block_rest
      ) values (
        v_day_id,
        (v_exercise->>'exercise_id')::uuid,
        greatest(1, (v_exercise->>'sets')::integer),
        trim(v_exercise->>'reps'),
        trim(v_exercise->>'rest'),
        nullif(trim(coalesce(v_exercise->>'notes', '')), ''),
        coalesce(v_exercise->>'block_type', 'single') in ('biserie', 'triserie'),
        nullif(v_exercise->>'video_url', ''),
        nullif(v_exercise->>'image_url', ''),
        (v_exercise->>'order_index')::integer,
        coalesce(v_exercise->>'block_type', 'single'),
        nullif(v_exercise->>'block_id', '')::uuid,
        nullif(trim(coalesce(v_exercise->>'block_label', '')), ''),
        nullif(v_exercise->>'block_position', '')::integer,
        nullif(trim(coalesce(v_exercise->>'block_rest', '')), '')
      ) returning id into v_day_exercise_id;

      for v_week in
        select value from jsonb_array_elements(coalesce(v_exercise->'week_configs', '[]'::jsonb))
      loop
        insert into public.routine_week_configs (
          routine_day_exercise_id, start_week, end_week, sets, reps, rest, notes
        ) values (
          v_day_exercise_id,
          (v_week->>'start_week')::integer,
          (v_week->>'end_week')::integer,
          greatest(1, (v_week->>'sets')::integer),
          trim(v_week->>'reps'),
          trim(v_week->>'rest'),
          nullif(trim(coalesce(v_week->>'notes', '')), '')
        );
      end loop;
    end loop;
  end loop;

  if coalesce((p_plan->'warmup'->>'enabled')::boolean, false) then
    for v_warmup_id in
      select value #>> '{}'
      from jsonb_array_elements(coalesce(p_plan->'warmup'->'exercise_ids', '[]'::jsonb))
    loop
      if not exists (
        select 1 from public.exercises e
        where e.id = v_warmup_id::uuid
          and (e.source = 'global' or e.coach_id = p_coach_id)
      ) then
        raise exception 'Warmup exercise not available for this coach' using errcode = '42501';
      end if;

      insert into public.routine_warmup_exercises (routine_id, exercise_id, order_index)
      values (v_routine_id, v_warmup_id::uuid, v_warmup_order);
      v_warmup_order := v_warmup_order + 1;
    end loop;
  end if;

  return v_routine_id;
end;
$$;

revoke all on function public.save_routine_plan(uuid, jsonb) from public, anon;
grant execute on function public.save_routine_plan(uuid, jsonb) to authenticated;

comment on function public.save_routine_plan(uuid, jsonb) is
  'Atomically creates or replaces a complete independent-coach routine plan, including days, exercises, progression and warmup.';

commit;
