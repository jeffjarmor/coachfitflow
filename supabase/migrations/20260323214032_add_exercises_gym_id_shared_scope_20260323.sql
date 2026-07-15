alter table public.exercises add column if not exists gym_id uuid references public.gyms(id) on delete set null;
create index if not exists idx_exercises_gym_id on public.exercises(gym_id);;
