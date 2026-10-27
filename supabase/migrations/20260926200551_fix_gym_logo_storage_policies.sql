begin;

create or replace function public.can_manage_gym_logo_object(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, auth
as $function$
declare
  v_folder text := (storage.foldername(p_object_name))[1];
begin
  if auth.uid() is null
    or v_folder is null
    or v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_gym_owner(v_folder::uuid);
end;
$function$;

comment on function public.can_manage_gym_logo_object(text) is
  'Allows gym logo Storage policies to validate the first path segment without exposing gym rows.';

revoke all on function public.can_manage_gym_logo_object(text) from public, anon;
grant execute on function public.can_manage_gym_logo_object(text) to authenticated, service_role;

drop policy if exists gym_logos_owner_select on storage.objects;
create policy gym_logos_owner_select
on storage.objects
for select
to authenticated
using (bucket_id = 'gym-logos' and public.can_manage_gym_logo_object(name));

drop policy if exists gym_logos_owner_insert on storage.objects;
create policy gym_logos_owner_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'gym-logos' and public.can_manage_gym_logo_object(name));

drop policy if exists gym_logos_owner_update on storage.objects;
create policy gym_logos_owner_update
on storage.objects
for update
to authenticated
using (bucket_id = 'gym-logos' and public.can_manage_gym_logo_object(name))
with check (bucket_id = 'gym-logos' and public.can_manage_gym_logo_object(name));

drop policy if exists gym_logos_owner_delete on storage.objects;
create policy gym_logos_owner_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'gym-logos' and public.can_manage_gym_logo_object(name));

commit;
