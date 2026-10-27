begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gym-logos',
  'gym-logos',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gym_logos_owner_select on storage.objects;
create policy gym_logos_owner_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'gym-logos'
  and exists (
    select 1
    from public.gyms g
    where g.id::text = (storage.foldername(name))[1]
      and public.is_gym_owner(g.id)
  )
);

drop policy if exists gym_logos_owner_insert on storage.objects;
create policy gym_logos_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gym-logos'
  and exists (
    select 1
    from public.gyms g
    where g.id::text = (storage.foldername(name))[1]
      and public.is_gym_owner(g.id)
  )
);

drop policy if exists gym_logos_owner_update on storage.objects;
create policy gym_logos_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'gym-logos'
  and exists (
    select 1
    from public.gyms g
    where g.id::text = (storage.foldername(name))[1]
      and public.is_gym_owner(g.id)
  )
)
with check (
  bucket_id = 'gym-logos'
  and exists (
    select 1
    from public.gyms g
    where g.id::text = (storage.foldername(name))[1]
      and public.is_gym_owner(g.id)
  )
);

drop policy if exists gym_logos_owner_delete on storage.objects;
create policy gym_logos_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gym-logos'
  and exists (
    select 1
    from public.gyms g
    where g.id::text = (storage.foldername(name))[1]
      and public.is_gym_owner(g.id)
  )
);

create or replace function public.update_gym_settings(
  p_gym_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_address text default null,
  p_logo_url text default null,
  p_brand_color text default null
)
returns void
language plpgsql
security invoker
set search_path = public, auth
as $function$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_logo_url text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_brand_color text := upper(nullif(trim(coalesce(p_brand_color, '')), ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_gym_owner(p_gym_id) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Gym name must contain between 2 and 120 characters' using errcode = '22023';
  end if;
  if v_email is not null and (
    char_length(v_email) > 254
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Invalid gym email' using errcode = '22023';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'Gym phone is too long' using errcode = '22023';
  end if;
  if v_address is not null and char_length(v_address) > 300 then
    raise exception 'Gym address is too long' using errcode = '22023';
  end if;
  if v_brand_color is not null and v_brand_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Invalid gym brand color' using errcode = '22023';
  end if;
  if v_logo_url is not null and (
    char_length(v_logo_url) > 2048
    or position('/storage/v1/object/public/gym-logos/' || p_gym_id::text || '/' in v_logo_url) = 0
  ) then
    raise exception 'Invalid gym logo URL' using errcode = '22023';
  end if;

  update public.gyms
  set name = v_name,
      email = v_email,
      phone = v_phone,
      address = v_address,
      logo_url = v_logo_url,
      brand_color = v_brand_color,
      updated_at = now()
  where id = p_gym_id;

  if not found then
    raise exception 'Gym not found' using errcode = 'P0002';
  end if;
end;
$function$;

comment on function public.update_gym_settings(uuid, text, text, text, text, text, text) is
  'Updates gym identity and contact data after checking owner or admin access.';

revoke all on function public.update_gym_settings(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_gym_settings(uuid, text, text, text, text, text, text)
  to authenticated, service_role;

create or replace function public.rotate_gym_access_code(p_gym_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, auth
as $function$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_gym_owner(p_gym_id) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.gyms g where g.id = p_gym_id) then
    raise exception 'Gym not found' using errcode = 'P0002';
  end if;

  for v_attempt in 1..12 loop
    v_code := '';
    for v_index in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * char_length(v_alphabet))::integer, 1);
    end loop;

    begin
      update public.gyms
      set access_code = v_code,
          updated_at = now()
      where id = p_gym_id;
      return v_code;
    exception when unique_violation then
      -- Generate another code. The unique constraint remains authoritative.
    end;
  end loop;

  raise exception 'Could not generate a unique access code' using errcode = 'P0001';
end;
$function$;

comment on function public.rotate_gym_access_code(uuid) is
  'Replaces the gym join code with a non-ambiguous eight-character code for owners and admins.';

revoke all on function public.rotate_gym_access_code(uuid) from public, anon;
grant execute on function public.rotate_gym_access_code(uuid) to authenticated, service_role;

commit;
