begin;

alter table public.independent_client_portal_access enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_session_sets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'independent_client_portal_access' and policyname = 'independent_portal_access_self_or_coach'
  ) then
    create policy independent_portal_access_self_or_coach
      on public.independent_client_portal_access
      for all
      using (auth.uid() = user_id or auth.uid() = coach_id)
      with check (auth.uid() = user_id or auth.uid() = coach_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'training_sessions' and policyname = 'training_sessions_client_or_coach'
  ) then
    create policy training_sessions_client_or_coach
      on public.training_sessions
      for all
      using (
        auth.uid() = coach_id
        or exists (
          select 1 from public.clients c
          where c.id = training_sessions.client_id
            and c.user_id = auth.uid()
        )
        or exists (
          select 1 from public.client_portal_access cpa
          where cpa.client_gym_membership_id = training_sessions.client_gym_membership_id
            and cpa.user_id = auth.uid()
        )
      )
      with check (
        auth.uid() = coach_id
        or exists (
          select 1 from public.clients c
          where c.id = training_sessions.client_id
            and c.user_id = auth.uid()
        )
        or exists (
          select 1 from public.client_portal_access cpa
          where cpa.client_gym_membership_id = training_sessions.client_gym_membership_id
            and cpa.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'training_session_sets' and policyname = 'training_session_sets_client_or_coach'
  ) then
    create policy training_session_sets_client_or_coach
      on public.training_session_sets
      for all
      using (
        exists (
          select 1
          from public.training_sessions ts
          where ts.id = training_session_sets.training_session_id
            and (
              ts.coach_id = auth.uid()
              or exists (
                select 1 from public.clients c
                where c.id = ts.client_id
                  and c.user_id = auth.uid()
              )
              or exists (
                select 1 from public.client_portal_access cpa
                where cpa.client_gym_membership_id = ts.client_gym_membership_id
                  and cpa.user_id = auth.uid()
              )
            )
        )
      )
      with check (
        exists (
          select 1
          from public.training_sessions ts
          where ts.id = training_session_sets.training_session_id
            and (
              ts.coach_id = auth.uid()
              or exists (
                select 1 from public.clients c
                where c.id = ts.client_id
                  and c.user_id = auth.uid()
              )
              or exists (
                select 1 from public.client_portal_access cpa
                where cpa.client_gym_membership_id = ts.client_gym_membership_id
                  and cpa.user_id = auth.uid()
              )
            )
        )
      );
  end if;
end $$;

commit;;
