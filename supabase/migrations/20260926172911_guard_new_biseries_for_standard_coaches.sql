begin;

-- A standard coach may keep editing a routine that already contained a legacy
-- biserie, but cannot create a new biserie or triserie. The save RPC replaces
-- the assignments inside one transaction, so remember the legacy routine just
-- before its existing biserie rows are deleted.
create or replace function public.remember_legacy_biserie_routine_edit()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_routine_id uuid;
begin
  if coalesce(old.block_type, 'single') <> 'biserie' then
    return old;
  end if;

  select rd.routine_id
    into v_routine_id
  from public.routine_days rd
  where rd.id = old.routine_day_id;

  if v_routine_id is not null then
    perform set_config('zummith.legacy_biserie_routine_id', v_routine_id::text, true);
  end if;
  return old;
end;
$$;

revoke all on function public.remember_legacy_biserie_routine_edit()
  from public, anon, authenticated;

drop trigger if exists trg_remember_legacy_biserie_routine_edit
  on public.routine_day_exercises;

create trigger trg_remember_legacy_biserie_routine_edit
before delete on public.routine_day_exercises
for each row
execute function public.remember_legacy_biserie_routine_edit();

create or replace function public.enforce_paid_access_for_routine_exercise_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_routine_id uuid;
  v_coach_id uuid;
  v_account_type text;
  v_legacy_routine_id text;
begin
  if coalesce(new.block_type, 'single') = 'single' then
    return new;
  end if;

  select r.id, r.coach_id, coalesce(c.account_type, 'independent')
    into v_routine_id, v_coach_id, v_account_type
  from public.routine_days rd
  join public.routines r on r.id = rd.routine_id
  left join public.coaches c on c.id = r.coach_id
  where rd.id = new.routine_day_id
  limit 1;

  if v_coach_id is null then
    raise exception 'Routine day not found for exercise block' using errcode = '23503';
  end if;

  v_legacy_routine_id := current_setting('zummith.legacy_biserie_routine_id', true);
  if new.block_type = 'biserie'
    and v_legacy_routine_id = v_routine_id::text then
    return new;
  end if;

  if v_account_type = 'gym'
    or public.is_admin()
    or public.is_independent_paid_coach_access_active(v_coach_id) then
    return new;
  end if;

  raise exception 'Paid coach subscription required for exercise blocks'
    using errcode = '42501';
end;
$$;

revoke all on function public.enforce_paid_access_for_routine_exercise_blocks()
  from public, anon, authenticated;

comment on function public.remember_legacy_biserie_routine_edit() is
  'Marks one routine transaction so an existing legacy biserie can be replaced by save_routine_plan.';

comment on function public.enforce_paid_access_for_routine_exercise_blocks() is
  'Blocks new biseries and triseries for standard independent coaches while preserving edits to legacy biseries.';

commit;
