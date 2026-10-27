begin;

create or replace function public.update_client_portal_profile(
  p_client_id uuid,
  p_membership_id uuid,
  p_name text,
  p_phone text,
  p_birth_date date,
  p_address text,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_authorized boolean := false;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_client_id is null or char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Invalid profile name' using errcode = '22023';
  end if;
  if char_length(coalesce(p_phone, '')) > 50
    or char_length(coalesce(p_address, '')) > 500
    or char_length(coalesce(p_notes, '')) > 2000 then
    raise exception 'Profile field is too long' using errcode = '22023';
  end if;
  if p_birth_date is not null
    and (p_birth_date > current_date or p_birth_date < current_date - interval '120 years') then
    raise exception 'Invalid birth date' using errcode = '22023';
  end if;

  if p_membership_id is null then
    v_authorized := public.has_active_independent_client_portal_access(p_client_id, v_actor_id);
  else
    select exists (
      select 1
      from public.client_portal_access access
      join public.client_gym_memberships membership
        on membership.id = access.client_gym_membership_id
      where access.user_id = v_actor_id
        and membership.id = p_membership_id
        and membership.client_id = p_client_id
    ) into v_authorized;
  end if;

  if not v_authorized then
    raise exception 'Profile access denied' using errcode = '42501';
  end if;

  update public.clients
  set name = v_name,
      phone = nullif(trim(coalesce(p_phone, '')), ''),
      birth_date = p_birth_date,
      age = case
        when p_birth_date is null then age
        else extract(year from age(current_date, p_birth_date))::integer
      end,
      address = nullif(trim(coalesce(p_address, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = p_client_id;

  if not found then
    raise exception 'Client profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_client_portal_profile(uuid, uuid, text, text, date, text, text) from public;
revoke all on function public.update_client_portal_profile(uuid, uuid, text, text, date, text, text) from anon;
grant execute on function public.update_client_portal_profile(uuid, uuid, text, text, date, text, text) to authenticated, service_role;

comment on function public.update_client_portal_profile(uuid, uuid, text, text, date, text, text) is
  'Allows an authorized Portal identity to update only personal profile fields for its exact independent or gym context.';

commit;
