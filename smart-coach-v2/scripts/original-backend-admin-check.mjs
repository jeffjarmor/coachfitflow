import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createClient } from '@supabase/supabase-js';

// Use a fresh local stack with the 60 migrations recorded in the original backend.
// Never accept a production/staging URL or copy customer data.
const status = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(status.API_URL, 'http://127.0.0.1:55321');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(6).toString('hex');
const password = randomBytes(20).toString('base64url') + 'Aa1!';
const users = [], clients = [], gyms = [], exercises = [];
const checks = [];
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
const root = new URL('..', import.meta.url).pathname;
const bundle = `${root}/node_modules/.cache/original-admin-${suffix}.mjs`;
let injector;

async function user(name, role = 'coach') {
  const email = `original-admin-${name}-${suffix}@example.invalid`;
  const account = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }), 'Create local Auth fixture').user;
  users.push(account.id);
  checked(await db.from('coaches').upsert({ id: account.id, email, name, role, account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: '2099-01-01' }), 'Create local coach fixture');
  const api = createClient(status.API_URL, status.ANON_KEY, options);
  checked(await api.auth.signInWithPassword({ email, password }), 'Sign in local fixture');
  return { id: account.id, api };
}
async function client(coachId, name) {
  const row = checked(await db.from('clients').insert({ id: randomUUID(), primary_coach_id: coachId, name, email: `${suffix}@example.invalid`, goal: 'Fixture', age: 30 }).select().single(), 'Create local client fixture');
  clients.push(row.id);
  return row;
}

try {
  await mkdir(`${root}/node_modules/.cache`, { recursive: true });
  await build({ stdin: { contents: `import '@angular/compiler';
    import {createEnvironmentInjector,runInInjectionContext} from '@angular/core';
    import {AdminDataService} from './src/app/features/admin/admin-data.service.ts';
    import {SupabaseService} from './src/app/core/auth/supabase.service.ts';
    export function make(client) { const injector=createEnvironmentInjector([{provide:SupabaseService,useValue:{client}}]);
      return { service:runInInjectionContext(injector,()=>new AdminDataService()), injector }; }`,
    resolveDir: root, sourcefile: 'original-admin-check.ts' }, outfile: bundle, bundle: true,
    packages: 'external', platform: 'node', format: 'esm', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } });
  const { make } = await import(pathToFileURL(bundle).href);
  const admin = await user('admin', 'admin');
  const source = await user('source');
  const target = await user('target');
  const removable = await user('removable');
  const made = make(admin.api); injector = made.injector;
  const service = made.service;
  const original = await client(source.id, 'Original compatibility client');
  const exercise = checked(await db.from('exercises').insert({ name: `Original admin exercise ${suffix}`, muscle_group: 'Pecho', source: 'global' }).select('id').single(), 'Create exercise');
  exercises.push(exercise.id);
  const routine = checked(await db.from('routines').insert({ coach_id: source.id, client_id: original.id, name: 'Original routine', objective: 'Fixture', training_days_count: 1, duration_weeks: 4 }).select('id').single(), 'Create routine');
  const day = checked(await db.from('routine_days').insert({ routine_id: routine.id, day_number: 1, day_name: 'Día 1' }).select('id').single(), 'Create day');
  const dayExercise = checked(await db.from('routine_day_exercises').insert({ routine_day_id: day.id, exercise_id: exercise.id, sets: 3, reps: '10', rest: '60', order_index: 0 }).select('id').single(), 'Create day exercise');
  checked(await db.from('routine_week_configs').insert({ routine_day_exercise_id: dayExercise.id, start_week: 1, end_week: 4, sets: 3, reps: '10', rest: '60' }), 'Create progression');
  checked(await db.from('measurements').insert({ client_id: original.id, date: '2026-10-10', weight: 70, height: 170, bmi: 24.22 }), 'Create measurement');

  const rows = await service.listClients(source.id);
  const record = rows.find(row => row.id === original.id && !row.membershipId);
  check(!!record, 'Admin can read the original independent client');
  const denied = make(source.api);
  await assert.rejects(denied.service.cloneClient(record, target.id), /administradora/);
  denied.injector.destroy();
  check(true, 'Non-admin clone is rejected before writes');
  const cloneId = await service.cloneClient(record, target.id); clients.push(cloneId);
  const clone = checked(await db.from('clients').select('primary_coach_id,user_id').eq('id', cloneId).single(), 'Read clone');
  check(clone.primary_coach_id === target.id && clone.user_id === null, 'Clone uses target ownership without copying portal identity');
  check(checked(await db.from('measurements').select('id').eq('client_id', cloneId), 'Read cloned measurements').length === 1, 'Measurements clone against the original table without updated_at');
  const copiedRoutines = checked(await db.from('routines').select('id').eq('client_id', cloneId), 'Read cloned routines');
  check(copiedRoutines.length === 1, 'Routine copied');
  const copiedDays = checked(await db.from('routine_days').select('id').eq('routine_id', copiedRoutines[0].id), 'Read copied days');
  const copiedExercises = checked(await db.from('routine_day_exercises').select('id').eq('routine_day_id', copiedDays[0].id), 'Read copied exercises');
  check(copiedExercises.length === 1, 'Routine day and exercise copied');
  check(checked(await db.from('routine_week_configs').select('id').eq('routine_day_exercise_id', copiedExercises[0].id), 'Read copied progression').length === 1, 'Progression copied');
  check(checked(await db.from('clients').select('primary_coach_id').eq('id', original.id).single(), 'Read source').primary_coach_id === source.id, 'Source client ownership remains unchanged');

  const clonedRecord = (await service.listClients(target.id)).find(row => row.id === cloneId);
  await service.deleteClientContext(clonedRecord);
  check(checked(await db.from('clients').select('id').eq('id', cloneId), 'Read deleted clone').length === 0, 'Existing admin deletion RPC removes clone');
  check(checked(await db.from('clients').select('id').eq('id', original.id), 'Read preserved source').length === 1, 'Deleting clone preserves the original client');

  const gymId = randomUUID(); gyms.push(gymId);
  checked(await db.from('gyms').insert({ id: gymId, name: `Original admin gym ${suffix}`, access_code: suffix.slice(0, 6).toUpperCase() }), 'Create gym');
  await service.deleteGym(gymId);
  check(checked(await db.from('gyms').select('id').eq('id', gymId), 'Read deleted gym').length === 0, 'Gym deletion uses original tables');
  await service.deleteCoach(removable.id);
  check(checked(await db.from('coaches').select('id').eq('id', removable.id), 'Read deleted coach').length === 0, 'Coach deletion uses original workflow');
  const deletedAuth = await db.auth.admin.getUserById(removable.id);
  check(!!deletedAuth.error, 'Existing admin Auth deletion RPC removes the selected identity');

  const contextGyms = [randomUUID(), randomUUID()]; gyms.push(...contextGyms);
  for (const [index, id] of contextGyms.entries()) checked(await db.from('gyms').insert({ id, name: `Original admin context ${index} ${suffix}`, access_code: `${index}${suffix.slice(0, 5)}`.toUpperCase() }), 'Create context gym');
  const contextMemberships = checked(await db.from('client_gym_memberships').insert(contextGyms.map(gym_id => ({ gym_id, client_id: original.id, assigned_coach_id: source.id }))).select('id,gym_id'), 'Create two client contexts');
  const selected = contextMemberships.find(row => row.gym_id === contextGyms[0]);
  const preserved = contextMemberships.find(row => row.gym_id === contextGyms[1]);
  checked(await db.from('measurements').insert(contextMemberships.map(row => ({ client_id: original.id, client_gym_membership_id: row.id, date: '2026-10-10', weight: 70, height: 170, bmi: 24.22 }))), 'Create context measurements');
  await service.deleteClientContext({ ...record, membershipId: selected.id, gymId: selected.gym_id, scope: 'gym' });
  check(checked(await db.from('client_gym_memberships').select('id').eq('id', selected.id), 'Read removed membership').length === 0, 'Only the selected membership is removed');
  check(checked(await db.from('client_gym_memberships').select('id').eq('id', preserved.id), 'Read other membership').length === 1, 'Other gym membership remains');
  check(checked(await db.from('measurements').select('id').eq('client_gym_membership_id', preserved.id), 'Read other context data').length === 1, 'Other gym measurements remain');
  check(checked(await db.from('measurements').select('id').eq('client_id', original.id).is('client_gym_membership_id', null), 'Read independent data').length === 1, 'Context removal preserves independent data without leaking removed measurements');
  check(checked(await db.from('clients').select('id').eq('id', original.id), 'Read shared client').length === 1, 'Shared base client remains');
} finally {
  injector?.destroy();
  if (clients.length) checked(await db.from('clients').delete().in('id', clients), 'Clean client fixtures');
  if (gyms.length) checked(await db.from('gyms').delete().in('id', gyms), 'Clean gym fixtures');
  if (exercises.length) checked(await db.from('exercises').delete().in('id', exercises), 'Clean exercise fixtures');
  if (users.length) checked(await db.from('coaches').delete().in('id', users), 'Clean coach fixtures');
  for (const id of users) { const result = await db.auth.admin.deleteUser(id); if (result.error && result.error.status !== 404) throw result.error; }
  await rm(bundle, { force: true });
}
console.log(`Original backend administration: ${checks.length} checks passed; local fixtures removed.`);
