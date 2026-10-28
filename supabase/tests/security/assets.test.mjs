import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { PGlite } = await import(
  process.env.PGLITE_MODULE || '@electric-sql/pglite'
);

const migrationPath = new URL(
  '../../migrations/20261028184203_harden_assets_tenant_writes.sql',
  import.meta.url,
);
const baselineSchema = String.raw`
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create table public.coaches (id uuid primary key, role text not null);
create table public.gyms (id uuid primary key, owner_id uuid);
create table public.gym_staff (
  gym_id uuid not null,
  coach_id uuid not null,
  role text not null
);
create table storage.objects (
  id text primary key,
  bucket_id text not null,
  name text not null,
  owner_id text,
  payload text not null
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function public.is_admin() returns boolean language sql stable as $$
  select exists (
    select 1 from public.coaches
    where id = auth.uid() and role = 'admin'
  )
$$;
create function public.is_gym_owner(p_gym_id uuid) returns boolean
language sql stable as $$
  select public.is_admin() or exists (
    select 1 from public.gyms
    where id = p_gym_id and owner_id = auth.uid()
  ) or exists (
    select 1 from public.gym_staff
    where gym_id = p_gym_id and coach_id = auth.uid() and role = 'owner'
  )
$$;
alter table storage.objects enable row level security;
create policy assets_public_read on storage.objects for select using (bucket_id = 'assets');
create policy assets_authenticated_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assets');
create policy assets_authenticated_update on storage.objects for update to authenticated
  using (bucket_id = 'assets') with check (bucket_id = 'assets');
create policy assets_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'assets');
grant select, insert, update, delete on storage.objects to authenticated, anon, service_role;
grant usage on schema storage to authenticated, anon, service_role;
`;

const ids = {
  coachA: '10000000-0000-4000-8000-000000000001',
  coachB: '10000000-0000-4000-8000-000000000002',
  gymA: '20000000-0000-4000-8000-000000000001',
  gymB: '20000000-0000-4000-8000-000000000002',
  admin: '30000000-0000-4000-8000-000000000001',
  staff: '30000000-0000-4000-8000-000000000002',
};

const db = new PGlite();
await db.exec(baselineSchema);
await db.exec(`
  insert into public.coaches (id, role) values
    ('${ids.coachA}', 'coach'), ('${ids.coachB}', 'coach'),
    ('${ids.admin}', 'admin'), ('${ids.staff}', 'coach');
  insert into public.gyms (id, owner_id) values
    ('${ids.gymA}', '${ids.coachA}'), ('${ids.gymB}', '${ids.coachB}');
  insert into public.gym_staff (gym_id, coach_id, role) values
    ('${ids.gymA}', '${ids.staff}', 'trainer');
  insert into storage.objects (id, bucket_id, name, owner_id, payload) values
    ('coach-a-logo', 'assets', 'coaches/${ids.coachA}/logo/current.png', '${ids.coachA}', 'old-coach-a'),
    ('coach-b-logo', 'assets', 'coaches/${ids.coachB}/logo/current.png', '${ids.coachB}', 'old-coach-b'),
    ('gym-a-logo', 'assets', 'gyms/${ids.gymA}/logo_1.png', '${ids.coachA}', 'old-gym-a'),
    ('gym-b-logo', 'assets', 'gyms/${ids.gymB}/logo-1.png', '${ids.coachB}', 'old-gym-b'),
    ('global-exercise', 'assets', 'exercises_global/one.png', '${ids.admin}', 'old-global'),
    ('unknown-path', 'assets', 'misc/legacy.png', '${ids.coachA}', 'old-unknown');
`);

if (process.env.HARDENING_BASELINE !== '1') {
  await db.exec(await readFile(migrationPath, 'utf8'));
}

async function asRole(role, userId, action) {
  await db.exec(`set role ${role}`);
  if (userId) {
    await db.query('select set_config($1, $2, false)', [
      'request.jwt.claim.sub',
      userId,
    ]);
  } else {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
  try {
    return await action();
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

async function payload(id) {
  const result = await db.query('select payload, name from storage.objects where id = $1', [id]);
  return result.rows[0] ?? null;
}

test('coach can create, replace, and remove their own logo and exercise media', async () => {
  await asRole('authenticated', ids.coachA, async () => {
    await db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('coach-a-new', 'assets', $1, $2, 'new')`,
      [`coaches/${ids.coachA}/exercises/new.png`, ids.coachA],
    );
    await db.query(
      "update storage.objects set payload = 'replaced' where id = 'coach-a-logo'",
    );
    await db.query("delete from storage.objects where id = 'coach-a-new'");
  });
  assert.equal((await payload('coach-a-logo')).payload, 'replaced');
  assert.equal(await payload('coach-a-new'), null);
});

test('cross-coach writes, deletes, and path moves are rejected without changing objects', async () => {
  await asRole('authenticated', ids.coachA, async () => {
    await assert.rejects(db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('forged', 'assets', $1, $2, 'forged')`,
      [`coaches/${ids.coachB}/logo/forged.png`, ids.coachA],
    ));
    assert.equal((await db.query(
      `update storage.objects set payload = 'stolen' where id = 'coach-b-logo' returning id`,
    )).rows.length, 0);
    await assert.rejects(db.query(
      `update storage.objects set name = $1 where id = 'coach-a-logo' returning id`,
      [`coaches/${ids.coachB}/logo/moved.png`],
    ));
    assert.equal((await db.query(
      "delete from storage.objects where id = 'coach-b-logo' returning id",
    )).rows.length, 0);
  });
  assert.deepEqual(await payload('coach-b-logo'), {
    payload: 'old-coach-b',
    name: `coaches/${ids.coachB}/logo/current.png`,
  });
  assert.deepEqual(await payload('coach-a-logo'), {
    payload: 'replaced',
    name: `coaches/${ids.coachA}/logo/current.png`,
  });
});

test('gym owner may replace and clean up their logo, while other gym staff cannot write it', async () => {
  await asRole('authenticated', ids.coachA, async () => {
    await db.query("update storage.objects set payload = 'new-gym-logo' where id = 'gym-a-logo'");
    await db.query("delete from storage.objects where id = 'gym-a-logo'");
    await db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('gym-a-logo-again', 'assets', $1, $2, 'restored')`,
      [`gyms/${ids.gymA}/logo_2.png`, ids.coachA],
    );
    assert.equal((await db.query(
      "update storage.objects set payload = 'stolen' where id = 'gym-b-logo' returning id",
    )).rows.length, 0);
    assert.equal((await db.query(
      "delete from storage.objects where id = 'gym-b-logo' returning id",
    )).rows.length, 0);
  });
  await asRole('authenticated', ids.staff, async () => {
    assert.equal((await db.query(
      "delete from storage.objects where id = 'gym-b-logo' returning id",
    )).rows.length, 0);
    await assert.rejects(db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('staff-gym-write', 'assets', $1, $2, 'bad') returning id`,
      [`gyms/${ids.gymA}/logo_staff.png`, ids.staff],
    ));
  });
  assert.equal(await payload('gym-a-logo'), null);
  assert.equal((await payload('gym-a-logo-again')).payload, 'restored');
  assert.equal((await payload('gym-b-logo')).payload, 'old-gym-b');
  assert.equal(await payload('staff-gym-write'), null);
});

test('global exercise media and arbitrary cleanup are restricted to administrators', async () => {
  await asRole('authenticated', ids.coachA, async () => {
    await assert.rejects(db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('forged-global', 'assets', 'exercises_global/forged.png', $1, 'bad')`,
      [ids.coachA],
    ));
    assert.equal((await db.query(
      "delete from storage.objects where id = 'unknown-path' returning id",
    )).rows.length, 0);
  });
  await asRole('authenticated', ids.admin, async () => {
    await db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('admin-global', 'assets', 'exercises_global/new.png', $1, 'new')`,
      [ids.admin],
    );
    await db.query("delete from storage.objects where id = 'unknown-path'");
    await db.query("delete from storage.objects where id = 'gym-b-logo'");
  });
  assert.equal((await payload('admin-global')).payload, 'new');
  assert.equal(await payload('unknown-path'), null);
  assert.equal(await payload('gym-b-logo'), null);
});

test('malformed and unknown paths are denied without UUID cast errors', async () => {
  await asRole('authenticated', ids.coachA, async () => {
    await assert.rejects(db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('malformed-gym', 'assets', 'gyms/not-a-uuid/logo.png', $1, 'bad')`,
      [ids.coachA],
    ));
    await assert.rejects(db.query(
      `insert into storage.objects (id, bucket_id, name, owner_id, payload)
       values ('unknown-new', 'assets', 'misc/new.png', $1, 'bad')`,
      [ids.coachA],
    ));
  });
  assert.equal(await payload('malformed-gym'), null);
  assert.equal(await payload('unknown-new'), null);
});

test('anonymous users retain public reads but cannot write', async () => {
  const expectedReadableCount = (await db.query(
    'select count(*)::int as count from storage.objects',
  )).rows[0].count;
  await asRole('anon', null, async () => {
    assert.equal((await db.query("select count(*)::int as count from storage.objects")).rows[0].count, expectedReadableCount);
    await assert.rejects(db.query(
      `insert into storage.objects (id, bucket_id, name, payload)
       values ('anonymous-write', 'assets', 'coaches/${ids.coachA}/logo/anon.png', 'bad')`,
    ));
  });
  assert.equal(await payload('anonymous-write'), null);
});

test('the migration can create its helper without CREATE permission on the managed storage schema', async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(baselineSchema);
    await isolated.exec(`
      create role migration_executor;
      grant usage, create on schema public to migration_executor;
      grant usage on schema storage, auth to migration_executor;
      grant select on public.coaches, public.gyms, public.gym_staff to migration_executor;
      -- Owning the test table isolates the schema-CREATE prerequisite. Real
      -- Supabase policy ownership/managed-role behavior still needs HTTP tests.
      alter table storage.objects owner to migration_executor;
      set role migration_executor;
    `);
    assert.equal((await isolated.query(
      "select has_schema_privilege(current_user, 'storage', 'CREATE') allowed",
    )).rows[0].allowed, false);
    await isolated.exec(await readFile(migrationPath, 'utf8'));
    const helper = (await isolated.query(`
      select n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where p.proname='can_manage_asset_object'
    `)).rows;
    assert.deepEqual(helper, [{ nspname: 'public' }]);
    const grants = (await isolated.query(`select
      has_function_privilege('anon', 'public.can_manage_asset_object(text)', 'execute') anonymous,
      has_function_privilege('authenticated', 'public.can_manage_asset_object(text)', 'execute') authenticated,
      has_function_privilege('service_role', 'public.can_manage_asset_object(text)', 'execute') service
    `)).rows[0];
    assert.deepEqual(grants, { anonymous: false, authenticated: true, service: false });
  } finally {
    await isolated.close();
  }
});

test('direct helper calls expose only current-identity booleans and preserve service maintenance', async () => {
  const state = async () => (await db.query(`select
    (select jsonb_agg(c order by id) from coaches c) coaches,
    (select jsonb_agg(g order by id) from gyms g) gyms,
    (select jsonb_agg(o order by id) from storage.objects o) objects
  `)).rows;
  const before = await state();
  await asRole('authenticated', ids.coachA, async () => {
    for (const [name, expected] of [
      [`coaches/${ids.coachA}/logo/example.png`, true],
      [`coaches/${ids.coachB}/logo/example.png`, false],
      [`gyms/${ids.gymA}/logo.png`, true],
      [`gyms/${ids.gymB}/logo.png`, false],
      ['exercises_global/example.png', false],
      ["anything'; delete from coaches; --", false],
      [null, false],
      ['gyms/------------------------------------/logo.png', false],
    ]) {
      assert.equal((await db.query(
        'select public.can_manage_asset_object($1) allowed', [name],
      )).rows[0].allowed, expected);
    }
  });
  assert.deepEqual(await state(), before);
  for (const role of ['anon', 'service_role']) {
    await asRole(role, null, async () => assert.rejects(db.query(
      'select public.can_manage_asset_object($1)', [`coaches/${ids.coachA}/logo/example.png`],
    ), { code: '42501' }));
  }
  await asRole('service_role', null, () => db.query(`
    insert into storage.objects values ('trusted-maintenance', 'assets', 'any/path', null, 'maintenance')
  `));
  assert.equal((await payload('trusted-maintenance')).payload, 'maintenance');
  const fn = (await db.query(`select p.prosecdef, p.provolatile, p.proconfig,
    pg_get_function_identity_arguments(p.oid) args from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='can_manage_asset_object'
  `)).rows[0];
  assert.equal(fn.prosecdef, true);
  assert.equal(fn.provolatile, 's');
  assert.deepEqual(fn.proconfig, ['search_path=""']);
  assert.equal(fn.args, 'p_object_name text');
});
