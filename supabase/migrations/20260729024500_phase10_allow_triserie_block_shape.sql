begin;

alter table public.routine_day_exercises
  drop constraint if exists routine_day_exercises_block_shape_check;

alter table public.routine_day_exercises
  add constraint routine_day_exercises_block_shape_check
  check (
    (
      coalesce(block_type, 'single') = 'single'
      and block_id is null
      and block_position is null
    )
    or
    (
      coalesce(block_type, 'single') in ('biserie', 'triserie')
      and block_id is not null
      and block_position is not null
    )
  ) not valid;

comment on constraint routine_day_exercises_block_shape_check
  on public.routine_day_exercises is
  'Allows single exercises without block fields and grouped biserie/triserie exercises with block id and position.';

commit;
