begin;
select plan(4);

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-000000009001', 'admin-directory@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-000000009002', 'coach-directory@example.invalid', 'authenticated', 'authenticated');

insert into public.coaches (id, email, name, role, account_type) values
  ('00000000-0000-0000-0000-000000009001', 'admin-directory@example.invalid', 'Admin Directory', 'admin', 'independent'),
  ('00000000-0000-0000-0000-000000009002', 'coach-directory@example.invalid', 'Coach Directory', 'coach', 'independent');

insert into public.gyms (id, name, access_code) values
  ('00000000-0000-0000-0000-000000009101', 'Gym Directory', 'DIR-RLS-9101');

insert into public.clients (id, name, email, age, goal) values
  ('00000000-0000-0000-0000-000000009201', 'Client Directory', 'client-directory@example.invalid', 30, 'Prueba RLS');

insert into public.client_gym_memberships (id, client_id, gym_id) values
  ('00000000-0000-0000-0000-000000009301', '00000000-0000-0000-0000-000000009201', '00000000-0000-0000-0000-000000009101');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009001', true);

select results_eq(
  $$select id from public.gyms where id = '00000000-0000-0000-0000-000000009101'$$,
  $$values ('00000000-0000-0000-0000-000000009101'::uuid)$$,
  'an administrator can read every gym for the global directory'
);

select results_eq(
  $$select id from public.client_gym_memberships where id = '00000000-0000-0000-0000-000000009301'$$,
  $$values ('00000000-0000-0000-0000-000000009301'::uuid)$$,
  'an administrator can read membership context for every client'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000009002', true);

select is_empty(
  $$select id from public.gyms where id = '00000000-0000-0000-0000-000000009101'$$,
  'a coach outside the gym cannot read it'
);

select is_empty(
  $$select id from public.client_gym_memberships where id = '00000000-0000-0000-0000-000000009301'$$,
  'a coach outside the gym cannot read its memberships'
);

select * from finish();
rollback;
