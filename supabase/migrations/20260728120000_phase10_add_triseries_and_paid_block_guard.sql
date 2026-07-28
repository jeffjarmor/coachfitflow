begin;

alter table public.routine_day_exercises
  drop constraint if exists routine_day_exercises_block_type_check;

alter table public.routine_day_exercises
  add constraint routine_day_exercises_block_type_check
  check (block_type in ('single', 'biserie', 'triserie'));

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
  if coalesce(new.block_type, 'single') = 'single' then
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

  raise exception 'Paid coach subscription required for exercise blocks' using errcode = '42501';
end;
$$;

drop trigger if exists trg_enforce_paid_access_for_routine_exercise_blocks
  on public.routine_day_exercises;

create trigger trg_enforce_paid_access_for_routine_exercise_blocks
before insert or update of block_type, routine_day_id
on public.routine_day_exercises
for each row
execute function public.enforce_paid_access_for_routine_exercise_blocks();

comment on column public.routine_day_exercises.block_type is
  'Exercise grouping type within a routine day. single = normal exercise, biserie = two-exercise block, triserie = three-exercise block.';

comment on function public.enforce_paid_access_for_routine_exercise_blocks() is
  'Prevents grouped exercise blocks for standard independent coaches while allowing gyms, admins, and active paid independent coaches.';

commit;
