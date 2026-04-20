begin;

alter table public.coaches
  add column if not exists coach_plan text not null default 'standard';

update public.coaches
set coach_plan = 'standard'
where coach_plan is null or btrim(coach_plan) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'coaches_coach_plan_check'
      and conrelid = 'public.coaches'::regclass
  ) then
    alter table public.coaches
      add constraint coaches_coach_plan_check
      check (coach_plan in ('standard', 'paid'));
  end if;
end $$;

comment on column public.coaches.coach_plan is
  'Commercial plan for independent coaches: standard or paid.';

commit;
