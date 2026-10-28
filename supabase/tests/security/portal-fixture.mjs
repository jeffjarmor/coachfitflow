import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migration = await readFile(new URL('../../migrations/20261028184209_harden_independent_portal_identity.sql', import.meta.url), 'utf8');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [coach, otherCoach, clientUser, attacker, admin] = [1, 2, 3, 4, 5].map(id);
const [client, otherClient, unlinkedClient] = [11, 12, 13].map(id);

// Reduced schema with the relevant deployed production policies/functions.
// This deliberately models the vulnerable deployed helper, not optional Oct 10 SQL.
async function database({ applyMigration = process.env.HARDENING_BASELINE !== '1' } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.current_user_id() returns uuid language sql stable as $$ select auth.uid() $$;
    create table coaches(id uuid primary key, role text default 'coach', account_type text default 'independent',
      coach_plan text default 'paid', next_plan_payment_date date default current_date + 30);
    create table clients(id uuid primary key, user_id uuid, primary_coach_id uuid, name text,
      portal_status text default 'pending', updated_at timestamptz default now());
    create table independent_client_portal_access(user_id uuid, client_id uuid references clients,
      coach_id uuid, primary key(user_id, client_id));
    create table client_gym_memberships(id uuid primary key, client_id uuid references clients, gym_id uuid, user_id uuid);
    create table gym_staff(gym_id uuid, coach_id uuid);
    create function public.is_admin() returns boolean language sql stable security definer set search_path='' as
      $$ select exists(select 1 from public.coaches where id=auth.uid() and role='admin') $$;
    create function public.is_gym_staff_member(gym uuid) returns boolean language sql stable security definer set search_path='' as
      $$ select exists(select 1 from public.gym_staff where gym_id=gym and coach_id=auth.uid()) $$;
    create function public.is_membership_client(membership uuid) returns boolean language sql stable security definer set search_path='' as
      $$ select exists(select 1 from public.client_gym_memberships where id=membership and user_id=auth.uid()) $$;
    create function public.has_active_independent_client_portal_access(p_client_id uuid, p_user_id uuid default public.current_user_id())
    returns boolean language sql stable security definer set search_path=public,auth as $$
      select exists(select 1 from independent_client_portal_access a join clients c on c.id=a.client_id
        join coaches co on co.id=coalesce(a.coach_id,c.primary_coach_id)
        where a.client_id=p_client_id and a.user_id=p_user_id and co.account_type='independent'
        and coalesce(co.coach_plan,'standard')='paid' and co.next_plan_payment_date is not null
        and co.next_plan_payment_date>=current_date) $$;
    create function public.can_access_client(p_client_id uuid) returns boolean language sql stable security definer set search_path=public,auth as $$
      select public.is_admin()
      or exists(select 1 from public.clients c where c.id=p_client_id and c.primary_coach_id=public.current_user_id())
      or public.has_active_independent_client_portal_access(p_client_id,public.current_user_id())
      or exists(select 1 from public.client_gym_memberships m where m.client_id=p_client_id
        and (public.is_gym_staff_member(m.gym_id) or public.is_membership_client(m.id))) $$;
    alter table clients enable row level security;
    alter table independent_client_portal_access enable row level security;
    create policy clients_select on clients for select using(public.can_access_client(id));
    create policy clients_update on clients for update using(public.can_access_client(id)) with check(public.can_access_client(id));
    create policy clients_delete on clients for delete using(public.can_access_client(id));
    create policy independent_portal_access_self_or_coach on independent_client_portal_access for all
      using(auth.uid()=user_id or auth.uid()=coach_id) with check(auth.uid()=user_id or auth.uid()=coach_id);
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant all on all tables in schema public to authenticated,service_role;
    grant select on clients to anon;
    insert into coaches(id,role) values ('${coach}','coach'),('${otherCoach}','coach'),('${admin}','admin');
    insert into clients(id,user_id,primary_coach_id,name) values
      ('${client}','${clientUser}','${coach}','Invited client'),
      ('${otherClient}','${id(6)}','${otherCoach}','Other client'),
      ('${unlinkedClient}',null,'${coach}','Not invited');
    insert into independent_client_portal_access values ('${clientUser}','${client}','${coach}');
  `);
  if (applyMigration) await db.exec(migration);
  return db;
}

async function asUser(db, actor, action, role = 'authenticated') {
  await db.exec(`set role ${role}; set request.jwt.claim.sub='${actor || ''}';`);
  try { return await action(); }
  finally { await db.exec("reset role; set request.jwt.claim.sub='';"); }
}
async function snapshot(db) {
  return (await db.query(`select (select jsonb_agg(c order by id) from clients c) clients,
    (select jsonb_agg(a order by user_id,client_id) from independent_client_portal_access a) links`)).rows;
}

export { database, asUser, snapshot, id, coach, otherCoach, clientUser, attacker, admin, client, otherClient, unlinkedClient };
