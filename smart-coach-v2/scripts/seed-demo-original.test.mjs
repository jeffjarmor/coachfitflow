import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { ACCOUNT_DEFINITIONS, API_URL, buildFixtureIds, buildSeedData, costaRicaDay, createManifest, fixtureId, isOwnedUser, validateTarget } from './seed-demo-original.mjs';

const jwt = role => `header.${Buffer.from(JSON.stringify({ role, ref: 'supabase-demo' })).toString('base64url')}.signature`;

test('calendar dates stay in Costa Rica when the host already passed UTC midnight', () => {
  assert.equal(costaRicaDay(new Date('2026-10-15T00:30:00Z')), '2026-10-14');
  assert.equal(costaRicaDay(new Date('2026-10-15T00:30:00Z'), 25), '2026-11-08');
});

test('the target guard rejects production, hosted, expanded local and production credentials', () => {
  const status = { API_URL, SERVICE_ROLE_KEY: jwt('service_role'), ANON_KEY: jwt('anon') };
  assert.equal(validateTarget(status), status);
  for (const url of ['https://bzhqprxolseyxuuwodqs.supabase.co', 'https://iyueiuonwvodksxlykyv.supabase.co', 'http://127.0.0.1:54321', `${API_URL}/`]) {
    assert.throws(() => validateTarget({ ...status, API_URL: url }));
  }
  const production = `header.${Buffer.from(JSON.stringify({ role: 'service_role', ref: 'bzhqprxolseyxuuwodqs' })).toString('base64url')}.signature`;
  assert.throws(() => validateTarget({ ...status, SERVICE_ROLE_KEY: production }));
});

test('identifiers and ownership stay in their namespace while passwords are unique', () => {
  const manifest = createManifest();
  assert.equal(Object.keys(manifest.accounts).length, 10);
  assert.equal(new Set(Object.values(manifest.accounts).map(account => account.password)).size, 10);
  assert.deepEqual(manifest.fixtures, buildFixtureIds());
  assert.notEqual(fixtureId('first', 'client'), fixtureId('second', 'client'));
  assert.equal(isOwnedUser({ user_metadata: { synthetic_fixture: true } }, manifest), false);
  assert.equal(isOwnedUser({ app_metadata: { synthetic_fixture: { marker: 'coachfitflow-original-synthetic-v1', namespace: manifest.fixtureNamespace, projectId: manifest.target.projectId } } }, manifest), true);
});

test('realistic fixtures use only original schema columns and retain coherent context and dates', async () => {
  const manifest = createManifest(undefined, new Date('2026-10-14T18:00:00Z'));
  for (const [key] of ACCOUNT_DEFINITIONS) manifest.accounts[key].userId = fixtureId(manifest.fixtureNamespace, `auth-${key}`);
  const rows = buildSeedData(manifest);
  const catalog = JSON.parse(await readFile(new URL('./contracts/original-backend-contract.json', import.meta.url), 'utf8'));
  const columns = new Set(catalog.columns.map(column => `${column.table}.${column.column}`));
  for (const [table, records] of Object.entries(rows)) for (const record of records) {
    for (const column of Object.keys(record)) assert.ok(columns.has(`${table}.${column}`), `Missing original column: ${table}.${column}`);
    for (const field of ['name', 'title', 'notes', 'description', 'program_title']) if (record[field]) assert.doesNotMatch(record[field], /\b(demo|test|prueba|fictici[oa])\b/i);
  }
  assert.equal(rows.clients.length, 25);
  assert.equal(rows.gyms.length, 2);
  assert.equal(rows.measurements.length, 150);
  assert.equal(new Set(rows.clients.map(row => row.birth_date.slice(5))).size, 25);
  for (const client of rows.clients) {
    const asOf = costaRicaDay(new Date(manifest.referenceDate));
    const age = Number(asOf.slice(0, 4)) - Number(client.birth_date.slice(0, 4)) - (client.birth_date.slice(5) > asOf.slice(5) ? 1 : 0);
    assert.equal(age, client.age, `Birthday must match the displayed age for ${client.name}`);
  }
  assert.deepEqual(new Set(rows.routines.map(row => row.duration_weeks)), new Set([4, 8, 12]));
  assert.equal(rows.coaches.find(row => row.id === manifest.accounts.coach_pro_expired.userId).next_plan_payment_date, '2026-09-30');
  assert.equal(rows.coaches.find(row => row.id === manifest.accounts.coach_pro.userId).next_plan_payment_date, '2026-11-08');
  assert.equal(rows.coaches.some(row => row.id === manifest.accounts.independent_client.userId || row.id === manifest.accounts.gym_client.userId), false);
  for (const membership of rows.client_gym_memberships) {
    const invoices = rows.payments.filter(row => row.client_gym_membership_id === membership.id);
    if (membership.subscription_status === 'overdue') assert.ok(invoices.some(row => row.status === 'overdue' && row.due_date < manifest.referenceDate));
    if (membership.subscription_status === 'active') assert.ok(invoices.some(row => row.status === 'pending' && row.due_date === membership.next_payment_due_date));
    if (membership.subscription_status === 'inactive') assert.equal(membership.next_payment_due_date, null);
  }
  for (const session of rows.training_sessions) {
    const routine = rows.routines.find(row => row.id === session.routine_id);
    assert.equal(session.client_gym_membership_id, routine.client_gym_membership_id);
    assert.ok(session.session_date >= routine.start_date && session.session_date <= routine.end_date);
    assert.equal(session.status === 'in_progress', session.completed_at === null);
  }
  const sheet = rows.competitor_sheets[0];
  assert.equal(sheet.workouts.length, 3);
  for (const workout of sheet.workouts) for (const block of workout.blocks) {
    assert.ok(block.name); assert.equal(block.microcycles.length, 3); assert.equal(block.rest.length, 3);
  }
});
