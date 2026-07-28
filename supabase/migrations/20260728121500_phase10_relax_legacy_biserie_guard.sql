begin;

create or replace function public.enforce_paid_access_for_routine_exercise_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_coach_id uuid;
  v_account_type text;
begin
  -- Keep legacy biseries editable so existing routines are not broken when a
  -- standard coach adjusts sets/reps/rest on an older day.
  if coalesce(new.block_type, 'single') in ('single', 'biserie') then
    return new;
  end if;

  select r.coach_id, coalesce(c.account_type, 'independent')
    into v_coach_id, v_account_type
  from public.routine_days rd
  join public.routines r on r.id = rd.routine_id
  left join public.coaches c on c.id = r.coach_id
  where rd.id = new.routine_day_id
  limit 1;

  if v_coach_id is null then
    raise exception 'Routine day not found for exercise block' using errcode = '23503';
  end if;

  if v_account_type = 'gym' or public.is_admin() or public.is_independent_paid_coach_access_active(v_coach_id) then
    return new;
  end if;

  raise exception 'Paid coach subscription required for triseries' using errcode = '42501';
end;
$$;

comment on function public.enforce_paid_access_for_routine_exercise_blocks() is
  'Blocks triseries for standard independent coaches while keeping legacy biseries editable for existing routines.';

commit;
