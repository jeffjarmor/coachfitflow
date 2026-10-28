begin;

create or replace function public.prevent_coach_role_escalation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role <> 'coach' and not public.is_admin() then
      raise exception 'coach role changes require an administrator or trusted database role'
        using errcode = '42501';
    end if;
  elsif new.role is distinct from old.role and not public.is_admin() then
    raise exception 'coach role changes require an administrator or trusted database role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_coach_role_escalation() from public;
revoke all on function public.prevent_coach_role_escalation()
  from anon, authenticated, service_role;

drop trigger if exists prevent_coach_role_escalation on public.coaches;
create trigger prevent_coach_role_escalation
before insert or update of role on public.coaches
for each row
execute function public.prevent_coach_role_escalation();

commit;
