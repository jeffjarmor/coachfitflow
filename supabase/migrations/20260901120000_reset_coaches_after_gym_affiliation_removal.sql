-- Keep coach account/plan state consistent when their final gym affiliation is removed.
--
-- The admin deletion flow removes gym_staff rows before deleting the gym itself,
-- so both events need coverage:
--   1. gym_staff DELETE resets trainers and secondary owners.
--   2. gyms DELETE resets the primary owner.
--
-- Coaches that still belong to or own another gym are intentionally left unchanged.

create or replace function public.reset_coach_after_final_gym_affiliation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.gym_staff gs
    where gs.coach_id = old.coach_id
  ) and not exists (
    select 1
    from public.gyms g
    where g.owner_id = old.coach_id
  ) then
    update public.coaches
    set account_type = 'independent'::public.account_type,
        coach_plan = 'standard',
        next_plan_payment_date = null,
        updated_at = now()
    where id = old.coach_id;
  end if;

  return old;
end;
$$;

revoke all on function public.reset_coach_after_final_gym_affiliation() from public;

drop trigger if exists reset_coach_after_gym_staff_delete on public.gym_staff;
create trigger reset_coach_after_gym_staff_delete
after delete on public.gym_staff
for each row
execute function public.reset_coach_after_final_gym_affiliation();

create or replace function public.reset_primary_owner_after_final_gym_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.owner_id is not null
     and not exists (
       select 1
       from public.gym_staff gs
       where gs.coach_id = old.owner_id
     )
     and not exists (
       select 1
       from public.gyms g
       where g.owner_id = old.owner_id
     ) then
    update public.coaches
    set account_type = 'independent'::public.account_type,
        coach_plan = 'standard',
        next_plan_payment_date = null,
        updated_at = now()
    where id = old.owner_id;
  end if;

  return old;
end;
$$;

revoke all on function public.reset_primary_owner_after_final_gym_delete() from public;

drop trigger if exists reset_primary_owner_after_gym_delete on public.gyms;
create trigger reset_primary_owner_after_gym_delete
after delete on public.gyms
for each row
execute function public.reset_primary_owner_after_final_gym_delete();
