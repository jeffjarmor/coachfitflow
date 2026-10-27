begin;

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
    select 1
    from public.coaches c
    where c.id = v_coach_id
      and c.role = 'coach'
      and c.account_type = 'independent'
  ) then
    raise exception 'Only independent coaches can delete clients from this flow'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.primary_coach_id = v_coach_id
  ) then
    raise exception 'Client not found or not owned by the current coach'
      using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct linked.user_id) filter (where linked.user_id is not null), '{}'::uuid[])
    into v_auth_user_ids
  from (
    select c.user_id
    from public.clients c
    where c.id = p_client_id

    union

    select access.user_id
    from public.independent_client_portal_access access
    where access.client_id = p_client_id

    union

    select access.user_id
    from public.client_portal_access access
    join public.client_gym_memberships membership
      on membership.id = access.client_gym_membership_id
    where membership.client_id = p_client_id
  ) linked;

  -- Cascades remove routines, measurements, memberships, portal links and RIR history.
  delete from public.clients
  where id = p_client_id
    and primary_coach_id = v_coach_id;

  foreach v_auth_user_id in array v_auth_user_ids loop
    -- A portal identity may be shared by another client or membership. Delete it only
    -- after every remaining reference has disappeared.
    if not exists (select 1 from public.coaches coach where coach.id = v_auth_user_id)
      and not exists (select 1 from public.clients c where c.user_id = v_auth_user_id)
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
  'Deletes a client owned by the authenticated independent coach and removes linked Auth identities only when they have no remaining portal access.';

commit;
