create or replace function public.admin_ensure_auth_user_for_email(
  p_email text,
  p_gym_id uuid,
  p_client_id uuid,
  p_role text default 'gym_client',
  p_user_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text;
  v_user_id uuid;
  v_now timestamptz := now();
  v_password text;
  v_current_user uuid := public.current_user_id();
  v_authorized boolean := false;
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_client_name text;
  v_effective_metadata jsonb := coalesce(p_user_metadata, '{}'::jsonb);
  v_role text := lower(trim(coalesce(p_role, 'gym_client')));
begin
  if v_current_user is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_client_id is null then
    raise exception 'client_id is required' using errcode = '22023';
  end if;

  if v_role = 'independent_client' then
    select (
      public.is_admin()
      or exists (
        select 1
        from public.clients c
        join public.coaches coach on coach.id = c.primary_coach_id
        where c.id = p_client_id
          and c.primary_coach_id = v_current_user
          and coach.account_type = 'independent'
          and coalesce(coach.coach_plan, 'standard') = 'paid'
      )
    ) into v_authorized;

    if not coalesce(v_authorized, false) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.clients c
      where c.id = p_client_id
        and c.primary_coach_id = v_current_user
    ) and not public.is_admin() then
      raise exception 'Client is not assigned to the current coach' using errcode = '22023';
    end if;
  else
    if p_gym_id is null then
      raise exception 'gym_id is required for gym clients' using errcode = '22023';
    end if;

    select (
      public.is_admin()
      or exists (
        select 1
        from public.gyms g
        where g.id = p_gym_id
          and g.owner_id = v_current_user
      )
      or exists (
        select 1
        from public.gym_staff gs
        where gs.gym_id = p_gym_id
          and gs.coach_id = v_current_user
          and coalesce(gs.can_edit_clients, false) = true
      )
      or exists (
        select 1
        from public.client_gym_memberships cgm
        where cgm.gym_id = p_gym_id
          and cgm.client_id = p_client_id
          and cgm.assigned_coach_id = v_current_user
      )
    ) into v_authorized;

    if not coalesce(v_authorized, false) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.client_gym_memberships cgm
      where cgm.gym_id = p_gym_id
        and cgm.client_id = p_client_id
    ) then
      raise exception 'Client is not part of the provided gym' using errcode = '22023';
    end if;
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required' using errcode = '22023';
  end if;

  select nullif(trim(c.name), '') into v_client_name
  from public.clients c
  where c.id = p_client_id
  limit 1;

  if v_client_name is not null then
    v_effective_metadata := v_effective_metadata
      || jsonb_build_object(
        'name', v_client_name,
        'full_name', v_client_name,
        'display_name', v_client_name,
        'client_id', p_client_id
      );

    if p_gym_id is not null then
      v_effective_metadata := v_effective_metadata || jsonb_build_object('gym_id', p_gym_id);
    end if;
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = v_email
    and u.deleted_at is null
  limit 1;

  if v_user_id is not null then
    update auth.users
    set
      instance_id = coalesce(instance_id, v_instance_id),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_effective_metadata,
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', coalesce(nullif(trim(p_role), ''), 'gym_client')),
      updated_at = now()
    where id = v_user_id;

    return v_user_id;
  end if;

  v_user_id := gen_random_uuid();
  v_password := encode(gen_random_bytes(24), 'hex') || 'Aa1!';

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous
  ) values (
    v_user_id,
    v_instance_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    v_now,
    '',
    '',
    '',
    '',
    v_now,
    v_now,
    jsonb_build_object(
      'provider', 'email',
      'providers', jsonb_build_array('email'),
      'role', coalesce(nullif(trim(p_role), ''), 'gym_client')
    ),
    v_effective_metadata,
    false,
    false
  );

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    created_at,
    updated_at
  ) values (
    v_user_id::text,
    v_user_id,
    jsonb_build_object(
      'sub', v_user_id::text,
      'email', v_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    v_now,
    v_now
  )
  on conflict (provider, provider_id) do nothing;

  return v_user_id;
exception
  when unique_violation then
    select u.id
      into v_user_id
    from auth.users u
    where lower(u.email) = v_email
      and u.deleted_at is null
    limit 1;

    if v_user_id is null then
      raise;
    end if;

    update auth.users
    set
      instance_id = coalesce(instance_id, v_instance_id),
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change = coalesce(email_change, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_effective_metadata,
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', coalesce(nullif(trim(p_role), ''), 'gym_client')),
      updated_at = now()
    where id = v_user_id;

    return v_user_id;
end;
$$;
