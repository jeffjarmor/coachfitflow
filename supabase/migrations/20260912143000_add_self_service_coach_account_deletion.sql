begin;

create or replace function public.assert_current_coach_account_deletable()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform 1
    from public.coaches
    where id = v_user_id
      and role = 'coach'
      and account_type = 'independent'
    for update;
  if not found then
    raise exception 'Only independent coach accounts can use self-service deletion'
      using errcode = '42501';
  end if;

  -- Hold client rows while checking for gym memberships; concurrent inserts
  -- referencing these clients must wait until this transaction completes.
  perform 1 from public.clients
  where primary_coach_id = v_user_id
  for update;

  if exists (select 1 from public.gyms where owner_id = v_user_id) then
    raise exception 'Gym owners must transfer or delete their gym first'
      using errcode = '23503';
  end if;

  -- Clients can be shared with a gym. Deleting one would cascade into its
  -- membership, payments, portal access and training history, so this flow
  -- must stop until the gym relationship has been resolved separately.
  if exists (select 1 from public.gym_staff where coach_id = v_user_id)
    or exists (
      select 1
      from public.client_gym_memberships membership
      join public.clients client on client.id = membership.client_id
      where client.primary_coach_id = v_user_id
    )
    or exists (
      select 1 from public.routines
      where coach_id = v_user_id and client_gym_membership_id is not null
    )
    or exists (
      select 1 from public.training_sessions
      where coach_id = v_user_id and client_gym_membership_id is not null
    )
    or exists (
      select 1 from public.routines routine
      join public.clients client on client.id = routine.client_id
      where client.primary_coach_id = v_user_id and routine.coach_id <> v_user_id
    )
    or exists (
      select 1 from public.competitor_sheets sheet
      join public.clients client on client.id = sheet.client_id
      where client.primary_coach_id = v_user_id and sheet.coach_id <> v_user_id
    )
    or exists (
      select 1 from public.training_sessions session
      join public.clients client on client.id = session.client_id
      where client.primary_coach_id = v_user_id and session.coach_id <> v_user_id
    ) then
    raise exception 'Resolve gym-linked or shared client work before deleting this account'
      using errcode = '23503';
  end if;

  -- A coach-owned exercise can also be referenced by another coach's plan.
  -- The FK would reject the delete; detect it before Storage cleanup begins.
  if exists (
    select 1
    from public.exercises exercise
    join public.routine_day_exercises item on item.exercise_id = exercise.id
    join public.routine_days day on day.id = item.routine_day_id
    join public.routines routine on routine.id = day.routine_id
    where exercise.coach_id = v_user_id and routine.coach_id <> v_user_id
  ) or exists (
    select 1
    from public.exercises exercise
    join public.routine_warmup_exercises item on item.exercise_id = exercise.id
    join public.routines routine on routine.id = item.routine_id
    where exercise.coach_id = v_user_id and routine.coach_id <> v_user_id
  ) then
    raise exception 'Resolve exercises used by another coach before deleting this account'
      using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.assert_current_coach_account_deletable() from public, anon;
grant execute on function public.assert_current_coach_account_deletable() to authenticated;

create or replace function public.delete_current_coach_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_client_user_ids uuid[];
  v_client_user_id uuid;
begin
  perform public.assert_current_coach_account_deletable();

  select coalesce(array_agg(distinct linked.user_id) filter (where linked.user_id is not null), '{}'::uuid[])
    into v_client_user_ids
  from (
    select c.user_id
    from public.clients c
    where c.primary_coach_id = v_user_id

    union

    select access.user_id
    from public.independent_client_portal_access access
    join public.clients c on c.id = access.client_id
    where c.primary_coach_id = v_user_id

    union

    select access.user_id
    from public.client_portal_access access
    join public.client_gym_memberships membership
      on membership.id = access.client_gym_membership_id
    join public.clients c on c.id = membership.client_id
    where c.primary_coach_id = v_user_id
  ) linked;

  delete from public.competitor_sheets where coach_id = v_user_id;
  delete from public.routines where coach_id = v_user_id;
  delete from public.exercises where coach_id = v_user_id;
  delete from public.clients where primary_coach_id = v_user_id;
  delete from public.coaches where id = v_user_id;

  foreach v_client_user_id in array v_client_user_ids loop
    if v_client_user_id <> v_user_id
      and not exists (select 1 from public.coaches coach where coach.id = v_client_user_id)
      and not exists (select 1 from public.clients c where c.user_id = v_client_user_id)
      and not exists (
        select 1 from public.independent_client_portal_access access
        where access.user_id = v_client_user_id
      )
      and not exists (
        select 1 from public.client_portal_access access
        where access.user_id = v_client_user_id
      ) then
      delete from auth.users where id = v_client_user_id;
    end if;
  end loop;
  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.delete_current_coach_account() from public, anon;
grant execute on function public.delete_current_coach_account() to authenticated;

comment on function public.delete_current_coach_account() is
  'Permanently deletes the authenticated independent coach and owned database data. Storage objects must be removed through the Storage API before this call.';

commit;
