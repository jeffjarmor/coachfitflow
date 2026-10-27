begin;

-- Supersedes the 2026-09-23 implementation. A client with a gym membership
-- cannot be deleted here: the membership owns payments, portal access and
-- training history that belong to another operational scope.
create or replace function public.delete_owned_independent_client(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_coach_id uuid := auth.uid();
  v_auth_user_ids uuid[] := '{}'::uuid[];
  v_auth_user_id uuid;
  v_deleted_auth_users integer := 0;
begin
  if v_coach_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.coaches coach
    where coach.id = v_coach_id
      and coach.role = 'coach'
      and coach.account_type = 'independent'
  ) then
    raise exception 'Only independent coaches can delete clients from this flow'
      using errcode = '42501';
  end if;

  perform 1 from public.clients client
    where client.id = p_client_id
      and client.primary_coach_id = v_coach_id
    for update;
  if not found then
    raise exception 'Client not found or not owned by the current coach'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.client_gym_memberships membership
    where membership.client_id = p_client_id
  ) or exists (
    select 1 from public.routines routine
    where routine.client_id = p_client_id and routine.coach_id <> v_coach_id
  ) or exists (
    select 1 from public.competitor_sheets sheet
    where sheet.client_id = p_client_id and sheet.coach_id <> v_coach_id
  ) or exists (
    select 1 from public.training_sessions session
    where session.client_id = p_client_id and session.coach_id <> v_coach_id
  ) then
    raise exception 'Resolve gym membership or another coach work before deleting this client'
      using errcode = '23503';
  end if;

  select coalesce(array_agg(distinct linked.user_id) filter (where linked.user_id is not null), '{}'::uuid[])
    into v_auth_user_ids
  from (
    select client.user_id
    from public.clients client
    where client.id = p_client_id

    union

    select access.user_id
    from public.independent_client_portal_access access
    where access.client_id = p_client_id
  ) linked;

  delete from public.clients
  where id = p_client_id
    and primary_coach_id = v_coach_id;

  foreach v_auth_user_id in array v_auth_user_ids loop
    if not exists (select 1 from public.coaches coach where coach.id = v_auth_user_id)
      and not exists (select 1 from public.clients client where client.user_id = v_auth_user_id)
      and not exists (
        select 1 from public.independent_client_portal_access access
        where access.user_id = v_auth_user_id
      )
      and not exists (
        select 1 from public.client_portal_access access
        where access.user_id = v_auth_user_id
      ) then
      delete from auth.users where id = v_auth_user_id;
      if found then
        v_deleted_auth_users := v_deleted_auth_users + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'client_deleted', true,
    'auth_users_deleted', v_deleted_auth_users
  );
end;
$$;

revoke all on function public.delete_owned_independent_client(uuid) from public, anon;
grant execute on function public.delete_owned_independent_client(uuid) to authenticated;

comment on function public.delete_owned_independent_client(uuid) is
  'Deletes only a client owned by the authenticated independent coach, refusing gym-linked clients and preserving shared Auth identities.';

commit;
