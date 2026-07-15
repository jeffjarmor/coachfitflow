insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'assets_public_read'
  ) then
    create policy assets_public_read
      on storage.objects
      for select
      using (bucket_id = 'assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'assets_authenticated_insert'
  ) then
    create policy assets_authenticated_insert
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'assets_authenticated_update'
  ) then
    create policy assets_authenticated_update
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'assets')
      with check (bucket_id = 'assets');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'assets_authenticated_delete'
  ) then
    create policy assets_authenticated_delete
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'assets');
  end if;
end $$;;
