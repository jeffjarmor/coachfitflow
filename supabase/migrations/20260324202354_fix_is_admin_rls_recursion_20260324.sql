create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.coaches c
    where c.id = public.current_user_id()
      and c.role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;;
