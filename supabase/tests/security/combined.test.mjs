import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const { database, asUser, snapshot, id, coach, otherCoach, clientUser, attacker, admin, client, otherClient } = await import('./portal-fixture.mjs');
test('combined patches reject escalation, forged links and cross-tenant writes without altering stored data', async () => {
    const db = await database({ applyMigration: false });
    try {
        await db.exec(`
create schema storage;
create table gyms(id uuid primary key,owner_id uuid);
create table storage.objects(id text primary key,bucket_id text,name text,payload text);
create function public.is_gym_owner(g uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_admin() or exists(select 1 from public.gyms where id=g and owner_id=auth.uid()) or exists(select 1 from public.gym_staff where gym_id=g and coach_id=auth.uid())$$;
alter table storage.objects enable row level security;
create policy assets_public_read on storage.objects for select using(bucket_id='assets');
create policy assets_authenticated_insert on storage.objects for insert to authenticated with check(bucket_id='assets');
create policy assets_authenticated_update on storage.objects for update to authenticated using(bucket_id='assets') with check(bucket_id='assets');
create policy assets_authenticated_delete on storage.objects for delete to authenticated using(bucket_id='assets');
grant usage on schema storage to authenticated,anon,service_role;
grant all on storage.objects to authenticated,anon,service_role;
alter table coaches enable row level security;
create policy coaches_select on coaches for select using(public.is_admin() or id=auth.uid());
create policy coaches_insert on coaches for insert with check(public.is_admin() or id=auth.uid());
create policy coaches_update on coaches for update using(public.is_admin() or id=auth.uid()) with check(public.is_admin() or id=auth.uid());
create policy coaches_delete on coaches for delete using(public.is_admin() or id=auth.uid());
insert into storage.objects values ('mine','assets','coaches/${coach}/logo/current.png','same'),('theirs','assets','coaches/${otherCoach}/logo/current.png','same');
insert into independent_client_portal_access values('${attacker}','${client}','${coach}');
`);
        const baseline = await snapshot(db);
        const paths = [
            '20261028184202_harden_coach_roles.sql',
            '20261028184203_harden_assets_tenant_writes.sql',
            '20261028184209_harden_independent_portal_identity.sql'
        ];
        if (process.env.HARDENING_BASELINE !== '1') {
            for (const path of paths)
                await db.exec(await readFile(new URL('../../migrations/' + path, import.meta.url), 'utf8'));
        }
        assert.deepEqual(await snapshot(db), baseline, 'all migrations preserve rows and links');
        const original = await db.query('select * from storage.objects order by id');
        await asUser(db, coach, async () => {
            await db.exec(`set request.jwt.claims='{"role":"service_role","app_metadata":{"role":"admin"}}'`);
            await assert.rejects(db.exec(`update coaches set role='admin' where id='${coach}'`), { code: '42501' });
            await assert.rejects(db.exec(`insert into coaches(id,role) values('${coach}','admin') on conflict(id) do update set role=excluded.role`), { code: '42501' });
            await assert.rejects(db.exec(`update storage.objects set bucket_id='other' where id='mine'`), { code: '42501' });
            assert.equal((await db.query(`update storage.objects set name='coaches/${coach}/logo/stolen.png' where id='theirs' returning id`)).rows.length, 0);
            await assert.rejects(db.exec(`insert into storage.objects values('theirs','assets','coaches/${otherCoach}/logo/current.png','changed') on conflict(id) do update set payload=excluded.payload`), { code: '42501' });
        });
        assert.deepEqual(await db.query('select * from storage.objects order by id'), original);
        await asUser(db, attacker, async () => {
            assert.equal((await db.query(`update independent_client_portal_access set user_id='${clientUser}' where client_id='${client}' returning *`)).rows.length, 0);
            assert.equal((await db.query(`delete from independent_client_portal_access where client_id='${client}' returning *`)).rows.length, 0);
            assert.equal((await db.query(`select * from clients where id='${client}'`)).rows.length, 0);
            await assert.rejects(db.exec(`insert into independent_client_portal_access values('${attacker}','${otherClient}',null)`), { code: '42501' });
        });
        assert.deepEqual(await snapshot(db), baseline);
        await asUser(db, clientUser, async () => {
            await assert.rejects(db.exec(`update independent_client_portal_access set user_id='${attacker}' where client_id='${client}'`), { code: '42501' });
            await db.exec(`update clients set name='Independent verified' where id='${client}'`);
        });
        await asUser(db, admin, async () => {
            await db.exec(`update coaches set role='owner' where id='${otherCoach}'`);
            await db.exec(`insert into storage.objects values('global','assets','exercises_global/example.png','good')`);
        });
        const grants = (await db.query(`select has_function_privilege('anon','storage.can_manage_asset_object(text)','execute') anon_asset,has_function_privilege('anon','public.can_manage_independent_client_portal_access(uuid,uuid,uuid)','execute') anon_portal,has_function_privilege('authenticated','public.prevent_coach_role_escalation()','execute') direct_trigger`)).rows[0];
        assert.deepEqual(grants, { anon_asset: false, anon_portal: false, direct_trigger: false });
        const funcs = (await db.query(`select n.nspname,p.proname,pg_get_userbyid(p.proowner) owner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('can_manage_asset_object','can_manage_independent_client_portal_access','prevent_coach_role_escalation') order by p.proname`)).rows;
        assert.equal(funcs.length, 3);
        for (const fn of funcs) {
            assert.equal(fn.owner, 'postgres');
            assert.ok(fn.proconfig.some(setting => setting.startsWith('search_path=')));
        }
    }
    finally {
        await db.close();
    }
});
