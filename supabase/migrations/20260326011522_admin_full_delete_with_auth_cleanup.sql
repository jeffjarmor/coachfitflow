begin;

create or replace function public.admin_delete_auth_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if target_user_id is null then
    return;
  end if;

  delete from public.client_portal_access where user_id = target_user_id;
  delete from public.activity_logins where user_id = target_user_id;
  update public.clients set user_id = null where user_id = target_user_id;

  delete from auth.users where id = target_user_id;
end;
$$;

create or replace function public.admin_delete_client_fully(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_membership_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select c.user_id into v_user_id
  from public.clients c
  where c.id = p_client_id;

  select coalesce(array_agg(id), '{}') into v_membership_ids
  from public.client_gym_memberships
  where client_id = p_client_id;

  delete from public.payments
  where client_gym_membership_id = any(v_membership_ids);

  delete from public.client_portal_access
  where client_gym_membership_id = any(v_membership_ids);

  delete from public.competitor_sheets
  where client_id = p_client_id;

  delete from public.measurements
  where client_id = p_client_id;

  delete from public.routines
  where client_id = p_client_id;

  delete from public.client_gym_memberships
  where client_id = p_client_id;

  delete from public.clients
  where id = p_client_id;

  if v_user_id is not null then
    perform public.admin_delete_auth_user(v_user_id);
  end if;
end;
$$;

grant execute on function public.admin_delete_auth_user(uuid) to authenticated;
grant execute on function public.admin_delete_client_fully(uuid) to authenticated;

commit;;
