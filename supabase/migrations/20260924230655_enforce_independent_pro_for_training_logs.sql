begin;

-- The original policy trusted clients.user_id alone for independent training
-- logs. That allowed a portal identity to keep reading/writing RIR after the
-- coach's Pro plan expired. Gym sessions retain their existing access rule.
drop policy if exists training_sessions_client_or_coach on public.training_sessions;
create policy training_sessions_client_or_coach
  on public.training_sessions
  for all to authenticated
  using (
    (select auth.uid()) = coach_id
    or (
      client_gym_membership_id is null
      and portal_scope = 'independent'
      and public.has_active_independent_client_portal_access(client_id, (select auth.uid()))
      and exists (
        select 1 from public.routines routine
        where routine.id = training_sessions.routine_id
          and routine.client_id = training_sessions.client_id
          and routine.coach_id = training_sessions.coach_id
          and routine.client_gym_membership_id is null
      )
    )
    or (
      client_gym_membership_id is not null
      and (
        exists (
          select 1 from public.clients client
          where client.id = training_sessions.client_id
            and client.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.client_portal_access access
          where access.client_gym_membership_id = training_sessions.client_gym_membership_id
            and access.user_id = (select auth.uid())
        )
      )
    )
  )
  with check (
    (select auth.uid()) = coach_id
    or (
      client_gym_membership_id is null
      and portal_scope = 'independent'
      and public.has_active_independent_client_portal_access(client_id, (select auth.uid()))
      and exists (
        select 1 from public.routines routine
        where routine.id = training_sessions.routine_id
          and routine.client_id = training_sessions.client_id
          and routine.coach_id = training_sessions.coach_id
          and routine.client_gym_membership_id is null
      )
    )
    or (
      client_gym_membership_id is not null
      and (
        exists (
          select 1 from public.clients client
          where client.id = training_sessions.client_id
            and client.user_id = (select auth.uid())
        )
        or exists (
          select 1 from public.client_portal_access access
          where access.client_gym_membership_id = training_sessions.client_gym_membership_id
            and access.user_id = (select auth.uid())
        )
      )
    )
  );

-- Reuse the session's RLS and require that a set belongs to its recorded day.
drop policy if exists training_session_sets_client_or_coach on public.training_session_sets;
create policy training_session_sets_client_or_coach
  on public.training_session_sets
  for all to authenticated
  using (
    exists (
      select 1 from public.training_sessions session
      where session.id = training_session_sets.training_session_id
        and session.routine_day_id = training_session_sets.routine_day_id
    )
  )
  with check (
    exists (
      select 1 from public.training_sessions session
      where session.id = training_session_sets.training_session_id
        and session.routine_day_id = training_session_sets.routine_day_id
    )
  );

commit;
