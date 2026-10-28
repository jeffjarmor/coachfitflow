import assert from 'node:assert/strict';
import test from 'node:test';
import { database, asUser, snapshot, id, coach, otherCoach, clientUser, attacker, admin, client, otherClient, unlinkedClient } from './portal-fixture.mjs';

test('a forged self-link or claimed coach ID cannot grant client access', async () => {
  const db = await database();
  try {
    for (const sql of [
      `insert into independent_client_portal_access values ('${attacker}','${otherClient}','${otherCoach}')`,
      `insert into independent_client_portal_access values ('${attacker}','${otherClient}','${attacker}')`,
      `insert into independent_client_portal_access values ('${attacker}','${unlinkedClient}',null)`
    ]) {
      const before = await snapshot(db);
      await asUser(db, attacker, () => assert.rejects(db.exec(sql), { code: '42501' }));
      assert.deepEqual(await snapshot(db), before);
    }
  } finally { await db.close(); }
});

test('a historical forged link cannot read, edit, delete, or repair the victim identity', async () => {
  const db = await database();
  try {
    await db.exec(`insert into independent_client_portal_access values ('${attacker}','${client}','${coach}')`);
    const before = await snapshot(db);
    await asUser(db, attacker, async () => {
      assert.deepEqual((await db.query(`select * from clients where id='${client}'`)).rows, []);
      assert.equal((await db.query(`update clients set user_id='${attacker}',name='Hijacked' where id='${client}' returning id`)).rows.length, 0);
      assert.equal((await db.query(`delete from clients where id='${client}' returning id`)).rows.length, 0);
    });
    assert.deepEqual(await snapshot(db), before, 'No cleanup/remapping is performed on legacy records');
  } finally { await db.close(); }
});

test('valid invitations, profile edits, owner/admin actions, and self-upserts still work', async () => {
  const db = await database();
  try {
    await asUser(db, coach, async () => {
      await db.exec(`update clients set user_id='${id(7)}' where id='${unlinkedClient}';
        insert into independent_client_portal_access values ('${id(7)}','${unlinkedClient}','${coach}');`);
      assert.equal((await db.query(`select id from clients`)).rows.length, 2);
    });
    await asUser(db, clientUser, async () => {
      await db.exec(`insert into independent_client_portal_access values ('${clientUser}','${client}','${coach}')
        on conflict(user_id,client_id) do update set coach_id=excluded.coach_id;`);
      assert.equal((await db.query(`select name from clients where id='${client}'`)).rows[0].name, 'Invited client');
      assert.equal((await db.query(`update clients set name='Updated',portal_status='active' where id='${client}' returning name`)).rows[0].name, 'Updated');
    });
    await asUser(db, admin, async () => {
      assert.equal((await db.query('select id from clients')).rows.length, 3);
      await db.exec(`delete from independent_client_portal_access where client_id='${unlinkedClient}'`);
    });
  } finally { await db.close(); }
});

test('plan expiry, identity mismatch, wrong coach, anonymous denial and gym access keep their boundaries', async () => {
  const db = await database();
  try {
    for (const expiry of ['current_date - 1', 'null']) {
      await db.exec(`update coaches set next_plan_payment_date=${expiry} where id='${coach}'`);
      await asUser(db, clientUser, async () => assert.equal((await db.query('select id from clients')).rows.length, 0));
    }
    await db.exec(`update coaches set next_plan_payment_date=current_date+30,coach_plan='standard' where id='${coach}'`);
    await asUser(db, clientUser, async () => assert.equal((await db.query('select id from clients')).rows.length, 0));
    await db.exec(`update coaches set coach_plan='paid' where id='${coach}';
      update independent_client_portal_access set coach_id='${otherCoach}' where client_id='${client}'`);
    await asUser(db, clientUser, async () => assert.equal((await db.query('select id from clients')).rows.length, 0));
    await asUser(db, null, async () => assert.equal((await db.query('select id from clients')).rows.length, 0), 'anon');
    await db.exec(`insert into client_gym_memberships values ('${id(20)}','${otherClient}','${id(21)}','${attacker}');
      insert into gym_staff values ('${id(21)}','${coach}');`);
    for (const actor of [coach, attacker]) {
      await asUser(db, actor, async () => assert.equal((await db.query(`select id from clients where id='${otherClient}'`)).rows.length, 1));
    }
  } finally { await db.close(); }
});
