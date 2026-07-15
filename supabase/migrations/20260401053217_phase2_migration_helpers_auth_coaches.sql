create or replace function public.migration_create_auth_user(
  p_email text,
  p_role text default 'coach',
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
  v_instance_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_meta jsonb := coalesce(p_user_metadata, '{}'::jsonb);
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    raise exception 'Email is required' using errcode = '22023';
  end if;

  select u.id into v_user_id
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
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', coalesce(nullif(trim(p_role), ''), 'coach')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_meta,
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
      'role', coalesce(nullif(trim(p_role), ''), 'coach')
    ),
    v_meta,
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
    select u.id into v_user_id
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
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', coalesce(nullif(trim(p_role), ''), 'coach')),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_meta,
      updated_at = now()
    where id = v_user_id;

    return v_user_id;
end;
$$;

create or replace function public.migration_upsert_coach(
  p_firebase_project_id text,
  p_firebase_uid text,
  p_email text,
  p_name text,
  p_phone text default null,
  p_logo_url text default null,
  p_brand_color text default null,
  p_role text default 'coach',
  p_account_type text default 'independent',
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_role coach_role;
  v_account_type account_type;
  v_user_id uuid;
  v_name text;
  v_doc_path text;
  v_existing_mapped_uid text;
begin
  if coalesce(trim(p_firebase_project_id), '') = '' then
    raise exception 'firebase_project_id is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_firebase_uid), '') = '' then
    raise exception 'firebase_uid is required' using errcode = '22023';
  end if;

  if coalesce(trim(p_email), '') = '' then
    raise exception 'email is required' using errcode = '22023';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := split_part(lower(trim(p_email)), '@', 1);
  end if;

  v_role := case lower(coalesce(trim(p_role), 'coach'))
    when 'admin' then 'admin'::coach_role
    when 'owner' then 'owner'::coach_role
    else 'coach'::coach_role
  end;

  v_account_type := case lower(coalesce(trim(p_account_type), 'independent'))
    when 'gym' then 'gym'::account_type
    else 'independent'::account_type
  end;

  v_user_id := public.migration_create_auth_user(
    p_email,
    v_role::text,
    coalesce(p_payload, '{}'::jsonb)
      || jsonb_build_object(
        'name', v_name,
        'full_name', v_name,
        'display_name', v_name,
        'firebase_uid', p_firebase_uid
      )
  );

  select m.firebase_uid into v_existing_mapped_uid
  from public.migration_id_map m
  where m.entity_type = 'coach'
    and m.firebase_project_id = p_firebase_project_id
    and m.supabase_table = 'coaches'
    and m.supabase_id = v_user_id
    and m.firebase_uid is not null
    and m.firebase_uid <> p_firebase_uid
  limit 1;

  if v_existing_mapped_uid is not null then
    raise exception 'Email collision: supabase user already mapped to firebase_uid %', v_existing_mapped_uid
      using errcode = '23505';
  end if;

  insert into public.coaches (
    id,
    email,
    name,
    phone,
    logo_url,
    brand_color,
    role,
    account_type,
    created_at,
    updated_at
  ) values (
    v_user_id,
    lower(trim(p_email)),
    v_name,
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    nullif(trim(coalesce(p_brand_color, '')), ''),
    v_role,
    v_account_type,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    phone = excluded.phone,
    logo_url = excluded.logo_url,
    brand_color = excluded.brand_color,
    role = excluded.role,
    account_type = excluded.account_type,
    updated_at = now();

  v_doc_path := format('coaches/%s', p_firebase_uid);

  insert into public.migration_id_map (
    entity_type,
    firebase_project_id,
    firebase_uid,
    firebase_doc_path,
    firebase_doc_id,
    supabase_table,
    supabase_id,
    match_strategy,
    confidence,
    payload,
    created_at,
    updated_at
  ) values (
    'coach',
    p_firebase_project_id,
    p_firebase_uid,
    v_doc_path,
    p_firebase_uid,
    'coaches',
    v_user_id,
    'by_email',
    0.90,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (entity_type, firebase_project_id, firebase_doc_path, firebase_doc_id)
  do update
  set
    supabase_table = excluded.supabase_table,
    supabase_id = excluded.supabase_id,
    match_strategy = excluded.match_strategy,
    confidence = excluded.confidence,
    payload = excluded.payload,
    updated_at = now();

  return v_user_id;
end;
$$;

revoke all on function public.migration_create_auth_user(text, text, jsonb) from public;
revoke all on function public.migration_upsert_coach(text, text, text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public.migration_create_auth_user(text, text, jsonb) from anon;
revoke all on function public.migration_upsert_coach(text, text, text, text, text, text, text, text, text, jsonb) from anon;
revoke all on function public.migration_create_auth_user(text, text, jsonb) from authenticated;
revoke all on function public.migration_upsert_coach(text, text, text, text, text, text, text, text, text, jsonb) from authenticated;;
