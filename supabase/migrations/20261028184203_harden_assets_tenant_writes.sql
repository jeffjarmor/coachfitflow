begin;

create or replace function storage.can_manage_asset_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_gym_id_text text;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- Administrators retain cleanup access for legacy and orphaned objects.
  if public.is_admin() then
    return true;
  end if;

  if p_object_name ~ '^coaches/[0-9a-fA-F-]{36}/(logo|exercises)/.+$' then
    return split_part(p_object_name, '/', 2) = auth.uid()::text;
  end if;

  if p_object_name ~ '^gyms/[0-9a-fA-F-]{36}/logo[^/]*(/.*)?$' then
    v_gym_id_text := split_part(p_object_name, '/', 2);
    if v_gym_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    return public.is_gym_owner(v_gym_id_text::uuid);
  end if;

  -- Global exercise assets and every unrecognized legacy path are admin-only.
  return false;
end;
$function$;

comment on function storage.can_manage_asset_object(text) is
  'Checks authenticated ownership of supported assets paths; administrators may clean up legacy or orphaned objects.';

revoke all on function storage.can_manage_asset_object(text) from public, anon;
grant execute on function storage.can_manage_asset_object(text) to authenticated;

drop policy if exists assets_authenticated_insert on storage.objects;
create policy assets_authenticated_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'assets'
  and storage.can_manage_asset_object(name)
);

drop policy if exists assets_authenticated_update on storage.objects;
create policy assets_authenticated_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'assets'
  and storage.can_manage_asset_object(name)
)
with check (
  bucket_id = 'assets'
  and storage.can_manage_asset_object(name)
);

drop policy if exists assets_authenticated_delete on storage.objects;
create policy assets_authenticated_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'assets'
  and storage.can_manage_asset_object(name)
);

commit;
