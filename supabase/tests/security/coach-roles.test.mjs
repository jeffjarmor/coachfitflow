import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { beforeEach, afterEach } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migrationPath = new URL('../../migrations/20261029184057_harden_coach_roles.sql', import.meta.url);

const baselineSql = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create type public.coach_role as enum ('admin', 'coach', 'owner');
  create table public.coaches (
    id uuid primary key,
    email text not null,
    name text not null,
    phone text,
    logo_url text,
    brand_color text,
    role public.coach_role not null default 'coach',
    account_type text not null default 'independent',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create function public.current_user_id() returns uuid language sql stable as $$
    select auth.uid()
  $$;
  create function public.is_admin() returns boolean language sql stable security definer
    set search_path = public, auth as $$
      select exists (
        select 1 from public.coaches c
        where c.id = public.current_user_id() and c.role = 'admin'
      )
    $$;
  alter table public.coaches enable row level security;
  create policy coaches_select on public.coaches for select
    using (public.is_admin() or id = public.current_user_id());
  create policy coaches_insert on public.coaches for insert
    with check (public.is_admin() or id = public.current_user_id());
  create policy coaches_update on public.coaches for update
    using (public.is_admin() or id = public.current_user_id())
    with check (public.is_admin() or id = public.current_user_id());
  create policy coaches_delete on public.coaches for delete
    using (public.is_admin() or id = public.current_user_id());
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), public.current_user_id(), public.is_admin()
    to anon, authenticated, service_role;
  grant select, insert, update, delete on public.coaches to anon, authenticated, service_role;
`;

const coachId = '10000000-0000-0000-0000-000000000001';
const otherCoachId = '10000000-0000-0000-0000-000000000002';
const adminId = '10000000-0000-0000-0000-000000000003';
let db;

async function asRole(role, userId, sql) {
  await db.exec(`set role ${role}`);
  if (userId) {
    await db.query('select set_config($1, $2, false)', ['request.jwt.claim.sub', userId]);
  }
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function row(id) {
  return (await db.query('select id, name, phone, role, account_type from public.coaches where id = $1', [id])).rows[0];
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(baselineSql);
  await db.exec(`
    insert into public.coaches (id, email, name, role) values
      ('${coachId}', 'coach@example.test', 'Coach', 'coach'),
      ('${adminId}', 'admin@example.test', 'Admin', 'admin');
  `);
  if (process.env.HARDENING_BASELINE !== '1') {
    await db.exec(await readFile(migrationPath, 'utf8'));
  }
});

afterEach(async () => {
  await db?.close();
});

test('a coach cannot set their existing role to admin and the row stays unchanged', async () => {
  const before = await row(coachId);
  await db.query("select set_config('request.jwt.claims', '{\"user_metadata\":{\"role\":\"admin\"}}', false)");
  await assert.rejects(
    asRole('authenticated', coachId, `update public.coaches set role = 'admin' where id = '${coachId}'`),
    /role changes require an administrator or trusted database role/i
  );
  assert.deepEqual(await row(coachId), before);
});

test('the trigger function is not directly executable by authenticated users', async () => {
  await assert.rejects(
    asRole('authenticated', coachId, 'select public.prevent_coach_role_escalation()'),
    /permission denied for function prevent_coach_role_escalation/i
  );
  await asRole('authenticated', coachId, `update public.coaches set phone = '555-0111' where id = '${coachId}'`);
  assert.equal((await row(coachId)).phone, '555-0111');
});

test('a coach cannot insert an admin or owner coach row, including after self deletion', async () => {
  await asRole('authenticated', coachId, `delete from public.coaches where id = '${coachId}'`);
  for (const role of ['admin', 'owner']) {
    await assert.rejects(
      asRole('authenticated', coachId, `insert into public.coaches (id, email, name, role) values ('${coachId}', 'new@example.test', 'New', '${role}')`),
      /role changes require an administrator or trusted database role/i
    );
  }
  await asRole('authenticated', coachId, `insert into public.coaches (id, email, name) values ('${coachId}', 'new@example.test', 'New')`);
  assert.equal((await row(coachId)).role, 'coach');
});

test('a coach can edit ordinary profile fields and retain the default signup role', async () => {
  await asRole('authenticated', coachId, `update public.coaches set name = 'Updated', phone = '555-0100' where id = '${coachId}'`);
  assert.deepEqual(await row(coachId), {
    id: coachId,
    name: 'Updated',
    phone: '555-0100',
    role: 'coach',
    account_type: 'independent'
  });
  await asRole('authenticated', otherCoachId, `insert into public.coaches (id, email, name) values ('${otherCoachId}', 'signup@example.test', 'Signup')`);
  assert.equal((await row(otherCoachId)).role, 'coach');
});

test('an administrator can provision and change coach roles', async () => {
  await asRole('authenticated', adminId, `insert into public.coaches (id, email, name, role) values ('${otherCoachId}', 'provisioned@example.test', 'Provisioned', 'owner')`);
  assert.equal((await row(otherCoachId)).role, 'owner');
  await asRole('authenticated', adminId, `update public.coaches set role = 'admin' where id = '${coachId}'`);
  assert.equal((await row(coachId)).role, 'admin');
});

test('service_role and postgres maintenance can provision privileged roles', async () => {
  await asRole('service_role', null, `insert into public.coaches (id, email, name, role) values ('${otherCoachId}', 'service@example.test', 'Service', 'admin')`);
  assert.equal((await row(otherCoachId)).role, 'admin');
  await db.exec(`insert into public.coaches (id, email, name, role) values ('${otherCoachId.replace(/2$/, '4')}', 'postgres@example.test', 'Postgres', 'owner')`);
  assert.equal((await row(otherCoachId.replace(/2$/, '4'))).role, 'owner');
});
