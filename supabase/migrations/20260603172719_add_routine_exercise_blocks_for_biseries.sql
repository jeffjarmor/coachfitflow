alter table public.routine_day_exercises
  add column if not exists block_type text not null default 'single',
  add column if not exists block_id uuid,
  add column if not exists block_label text,
  add column if not exists block_position integer,
  add column if not exists block_rest text;

update public.routine_day_exercises
set block_type = 'single'
where block_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'routine_day_exercises_block_type_check'
      and conrelid = 'public.routine_day_exercises'::regclass
  ) then
    alter table public.routine_day_exercises
      add constraint routine_day_exercises_block_type_check
      check (block_type in ('single', 'biserie'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'routine_day_exercises_block_position_check'
      and conrelid = 'public.routine_day_exercises'::regclass
  ) then
    alter table public.routine_day_exercises
      add constraint routine_day_exercises_block_position_check
      check (block_position is null or block_position > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'routine_day_exercises_block_shape_check'
      and conrelid = 'public.routine_day_exercises'::regclass
  ) then
    alter table public.routine_day_exercises
      add constraint routine_day_exercises_block_shape_check
      check (
        (block_type = 'single' and block_id is null and block_position is null)
        or
        (block_type = 'biserie' and block_id is not null and block_position is not null)
      );
  end if;
end $$;

create index if not exists idx_routine_day_exercises_block
  on public.routine_day_exercises(routine_day_id, block_id, block_position)
  where block_id is not null;

comment on column public.routine_day_exercises.block_type is 'Exercise grouping type within a routine day. single = normal exercise, biserie = two-exercise paired block.';
comment on column public.routine_day_exercises.block_id is 'Shared identifier for exercises that belong to the same routine-day block.';
comment on column public.routine_day_exercises.block_label is 'Display label for the block, such as A, B, C.';
comment on column public.routine_day_exercises.block_position is 'Position inside the block, such as 1 or 2 for a biserie.';
comment on column public.routine_day_exercises.block_rest is 'Rest instruction after completing the whole block.';;
