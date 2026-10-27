begin;

create or replace function public.save_competitor_sheet(
  p_coach_id uuid,
  p_sheet jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sheet_id uuid;
  v_client_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_coach_id is null or (p_coach_id <> auth.uid() and not public.is_admin()) then
    raise exception 'Coach scope not allowed' using errcode = '42501';
  end if;

  v_client_id := nullif(p_sheet->>'client_id', '')::uuid;
  if v_client_id is null or not exists (
    select 1 from public.clients c
    where c.id = v_client_id
      and (c.primary_coach_id = p_coach_id or public.is_admin())
  ) then
    raise exception 'Client not available for this coach' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_sheet->>'mesocycle_title', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'macrocycle_title', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'frequency_text', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'split_text', '')), '') is null
    or nullif(trim(coalesce(p_sheet->>'training_days_text', '')), '') is null
    or jsonb_typeof(coalesce(p_sheet->'workouts', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_sheet->'workouts') = 0
    or jsonb_typeof(coalesce(p_sheet->'day_labels', 'null'::jsonb)) <> 'array'
    or jsonb_array_length(p_sheet->'day_labels') = 0 then
    raise exception 'Competitor sheet fields, days and workouts are required' using errcode = '22023';
  end if;

  if nullif(p_sheet->>'id', '') is null then
    insert into public.competitor_sheets (
      coach_id, client_id, program_title, mesocycle_title, macrocycle_title,
      frequency_text, split_text, training_days_text, day_labels, week_plans, workouts
    ) values (
      p_coach_id,
      v_client_id,
      nullif(trim(coalesce(p_sheet->>'program_title', '')), ''),
      trim(p_sheet->>'mesocycle_title'),
      trim(p_sheet->>'macrocycle_title'),
      trim(p_sheet->>'frequency_text'),
      trim(p_sheet->>'split_text'),
      trim(p_sheet->>'training_days_text'),
      array(select jsonb_array_elements_text(p_sheet->'day_labels')),
      coalesce(p_sheet->'week_plans', '[]'::jsonb),
      p_sheet->'workouts'
    ) returning id into v_sheet_id;
  else
    v_sheet_id := (p_sheet->>'id')::uuid;
    if not exists (
      select 1 from public.competitor_sheets s
      where s.id = v_sheet_id and s.coach_id = p_coach_id and s.client_id = v_client_id
    ) then
      raise exception 'Competitor sheet not available for this coach' using errcode = '42501';
    end if;

    update public.competitor_sheets
    set program_title = nullif(trim(coalesce(p_sheet->>'program_title', '')), ''),
        mesocycle_title = trim(p_sheet->>'mesocycle_title'),
        macrocycle_title = trim(p_sheet->>'macrocycle_title'),
        frequency_text = trim(p_sheet->>'frequency_text'),
        split_text = trim(p_sheet->>'split_text'),
        training_days_text = trim(p_sheet->>'training_days_text'),
        day_labels = array(select jsonb_array_elements_text(p_sheet->'day_labels')),
        week_plans = coalesce(p_sheet->'week_plans', '[]'::jsonb),
        workouts = p_sheet->'workouts',
        updated_at = now()
    where id = v_sheet_id;
  end if;

  return v_sheet_id;
end;
$$;

revoke all on function public.save_competitor_sheet(uuid, jsonb) from public, anon;
grant execute on function public.save_competitor_sheet(uuid, jsonb) to authenticated;

comment on function public.save_competitor_sheet(uuid, jsonb) is
  'Creates or updates a complete competitor sheet after checking coach ownership of the selected client.';

commit;
