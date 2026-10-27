import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Fixtures and every browser Supabase request stay on the isolated CLI stack
// containing the 60 migrations recorded by the original production backend.
// No customer data, hosted credentials, or migrations are applied by this test.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'This check only runs locally.');
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:55321');
const base = 'http://127.0.0.1:4360';
const authKey = 'zummith-auth';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const anonymous = () => createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(6).toString('hex');
const password = `${randomBytes(20).toString('base64url')}Aa1!`;
const users = [], clients = [], gyms = [], exercises = [], checks = [], rpcAttempts = [], browserErrors = [];
const recoveries = [];
let browser, server;
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
const env = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
const productionOrigin = env.match(/url:\s*'([^']+)'/)[1];
assert.ok(new URL(productionOrigin).hostname.endsWith('.supabase.co'));

async function start() {
  try { if ((await fetch(`${base}/login`)).ok) return; } catch { /* Start below. */ }
  server = spawn('./node_modules/.bin/ng', ['serve', '--configuration', 'development', '--host', '127.0.0.1', '--port', '4360'],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/login`)).ok) return; } catch { /* Wait for compilation. */ }
    if (server.exitCode !== null) throw new Error('Angular exited before becoming ready.');
    await delay(500);
  }
  throw new Error('Angular did not start on the dedicated compatibility port.');
}

async function account(name, coach = false, accountType = 'independent') {
  const email = `original-portal-${name}-${suffix}@example.invalid`.toLowerCase();
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { name, role: coach ? 'coach' : 'independent_client', account_type: accountType } }), 'Create local Auth fixture').user;
  users.push(user.id);
  if (coach) checked(await db.from('coaches').upsert({ id: user.id, name, email, role: 'coach', account_type: accountType,
    coach_plan: 'paid', next_plan_payment_date: '2099-01-01' }), 'Create local coach fixture');
  return { id: user.id, email };
}

async function context() {
  const result = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // Register before creating a page. A hosted Supabase request can never escape
  // this interceptor, including password recovery and Auth callbacks.
  await result.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.hostname.endsWith('.supabase.co')) return route.continue();
    if (url.origin !== productionOrigin) return route.abort('blockedbyclient');
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      rpcAttempts.push(url.pathname.split('/').at(-1));
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"RPC forbidden by compatibility check"}' });
    }
    const headers = { ...request.headers(), apikey: target.ANON_KEY };
    const bearer = headers.authorization?.replace(/^Bearer /, '');
    let anonBearer = bearer?.startsWith('sb_publishable_');
    try { anonBearer ||= JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* User access token or no token. */ }
    if (anonBearer) headers.authorization = `Bearer ${target.ANON_KEY}`;
    if (url.pathname === '/auth/v1/recover' && request.method() === 'POST') recoveries.push(request.postDataJSON().email);
    const response = await route.fetch({ url: request.url().replace(productionOrigin, target.API_URL), headers });
    await route.fulfill({ response });
  });
  result.on('page', page => page.on('pageerror', error => browserErrors.push({ name: error.name,
    message: error.message.replace(/https?:\/\/\S+/g, '[URL]').replace(/[A-Za-z0-9_-]{80,}/g, '[redacted]') })));
  return result;
}

async function routine(clientId, coachId, exerciseId, membershipId, label) {
  const row = checked(await db.from('routines').insert({ client_id: clientId, coach_id: coachId,
    client_gym_membership_id: membershipId, name: label, objective: 'Compatibilidad original', training_days_count: 1,
    duration_weeks: 4 }).select('id').single(), 'Create routine');
  const day = checked(await db.from('routine_days').insert({ routine_id: row.id, day_number: 1, day_name: 'Día 1',
    muscle_groups: ['Pecho'] }).select('id').single(), 'Create day');
  checked(await db.from('routine_day_exercises').insert({ routine_day_id: day.id, exercise_id: exerciseId,
    sets: 3, reps: '8-10', rest: '90', order_index: 0, block_type: 'single' }), 'Create assignment');
  return { id: row.id, dayId: day.id };
}

async function poll(getValue, accept, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const value = await getValue();
    if (accept(value)) return value;
    await delay(200);
  }
  throw new Error(label);
}

async function record(page, routineId, exerciseName, values) {
  await page.goto(`${base}/client/routines/${routineId}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Registrar series/ }).click();
  for (const [label, value] of values) {
    const input = page.getByLabel(`${label}, serie 1 de ${exerciseName}`, { exact: true });
    await input.fill(String(value));
    await input.press('Tab');
    await page.waitForLoadState('networkidle');
  }
}

try {
  await start();
  browser = await chromium.launch({ headless: true });
  const coach = await account('Entrenador', true);
  const owner = await account('Gimnasio', true, 'gym');
  const portal = await account('Cliente');
  const client = checked(await db.from('clients').insert({ primary_coach_id: coach.id, user_id: portal.id,
    name: 'Cliente original', email: `profile-${suffix}@example.invalid`, age: 30, goal: 'Fuerza',
    address: 'Dirección original', portal_status: 'pending' }).select('id').single(), 'Create linked client');
  clients.push(client.id);
  checked(await db.from('independent_client_portal_access').insert({ user_id: portal.id, coach_id: coach.id,
    client_id: client.id }), 'Create existing independent link');
  // Production retains one historical ICPA link with another clients.user_id.
  // Preserve the existing database link and RLS behavior instead of repairing it.
  const legacyClient = checked(await db.from('clients').insert({ primary_coach_id: coach.id, user_id: owner.id,
    name: 'Cliente vinculado heredado', email: `legacy-${suffix}@example.invalid`, age: 30, goal: 'Fuerza',
    portal_status: 'pending' }).select('id').single(), 'Create historical client link fixture');
  clients.push(legacyClient.id);
  checked(await db.from('independent_client_portal_access').insert({ user_id: portal.id, coach_id: coach.id,
    client_id: legacyClient.id }), 'Create historical independent link');
  const gymName = `Gimnasio original ${suffix}`;
  const gym = checked(await db.from('gyms').insert({ name: gymName, access_code: suffix.slice(0, 8).toUpperCase(),
    owner_id: owner.id }).select('id').single(), 'Create gym');
  gyms.push(gym.id);
  const membership = checked(await db.from('client_gym_memberships').insert({ client_id: client.id, gym_id: gym.id,
    assigned_coach_id: owner.id, subscription_status: 'active', portal_status: 'pending' }).select('id').single(), 'Create membership');
  checked(await db.from('client_portal_access').insert({ user_id: portal.id, client_gym_membership_id: membership.id }), 'Create existing gym link');
  const exerciseName = `Press original ${suffix}`;
  const exercise = checked(await db.from('exercises').insert({ name: exerciseName, muscle_group: 'Pecho', source: 'global' })
    .select('id').single(), 'Create exercise');
  exercises.push(exercise.id);
  const independentRoutine = await routine(client.id, coach.id, exercise.id, null, 'Rutina independiente original');
  const gymRoutine = await routine(client.id, owner.id, exercise.id, membership.id, 'Rutina gimnasio original');
  checked(await db.from('measurements').insert([
    { client_id: client.id, client_gym_membership_id: null, date: '2026-10-01', weight: 70, height: 170, bmi: 24.22, notes: 'Medición independiente original' },
    { client_id: client.id, client_gym_membership_id: membership.id, date: '2026-10-02', weight: 72, height: 170, bmi: 24.91, notes: 'Medición gimnasio original' }
  ]), 'Create scoped measurements');

  const signedIn = await context();
  const independentKey = `independent:${coach.id}:${client.id}`;
  const gymKey = `gym:${gym.id}:${client.id}`;
  const contextKey = `zummith-v2-portal-context:${portal.id}`;
  await signedIn.addInitScript(({ key, value, origin }) => {
    if (window.location.origin !== origin) return;
    if (!sessionStorage.getItem('original-context-initialized')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('original-context-initialized', '1');
    }
  }, { key: contextKey, value: independentKey, origin: base });
  const page = await signedIn.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.locator('#email').fill(portal.email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/client/portal', { timeout: 25_000 });
  await page.getByRole('heading', { name: 'Rutina independiente original', exact: true }).first().waitFor();
  check(JSON.parse(await page.evaluate(key => localStorage.getItem(key), authKey)).user.id === portal.id,
    'Portal login uses the original persisted session key');
  check(checked(await db.from('coaches').select('id').eq('id', portal.id), 'Read portal identity').length === 0,
    'Existing portal clients are not provisioned as coaches');
  const activated = await poll(async () => checked(await db.from('clients').select('portal_status').eq('id', client.id).single(), 'Read activation'),
    value => value.portal_status === 'active', 'Original authorized activation did not complete');
  check(activated.portal_status === 'active', 'Existing independent access activates through original REST permissions');
  check(checked(await db.from('client_gym_memberships').select('portal_status').eq('id', membership.id).single(), 'Read gym status').portal_status === 'pending',
    'A manager-only gym status update does not block the existing portal access');

  await page.goto(`${base}/client/profile`, { waitUntil: 'networkidle' });
  await page.locator('[formcontrolname="name"]').fill('Cliente actualizado');
  await page.locator('[formcontrolname="phone"]').fill('+506 8888 7777');
  await page.locator('[formcontrolname="birthDate"]').fill('1995-03-12');
  await page.locator('[formcontrolname="notes"]').fill('Notas personales originales');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('Tus datos personales se guardaron correctamente.', { exact: true }).waitFor();
  const updated = checked(await db.from('clients').select('name,phone,birth_date,notes,address,user_id,primary_coach_id')
    .eq('id', client.id).single(), 'Read profile update');
  check(updated.name === 'Cliente actualizado' && updated.phone === '+506 8888 7777' && updated.birth_date === '1995-03-12'
    && updated.notes === 'Notas personales originales', 'Personal profile fields save using the original clients table');
  check(updated.address === 'Dirección original' && updated.user_id === portal.id && updated.primary_coach_id === coach.id,
    'Profile updates preserve address, Auth identity and coach ownership');
  const sessionBefore = await page.evaluate(key => localStorage.getItem(key), authKey);
  await page.getByRole('link', { name: 'Cambiar contraseña', exact: true }).click();
  await page.getByText('Revisa tu correo. Te enviamos un enlace para cambiar tu contraseña.', { exact: true }).waitFor();
  check(recoveries.at(-1) === portal.email && new URL(page.url()).pathname === '/client/profile',
    'The existing password control emails the authenticated identity without navigating to an invalid action');
  check(await page.evaluate(key => localStorage.getItem(key), authKey) === sessionBefore,
    'Requesting a password link preserves the current session');

  await record(page, independentRoutine.id, exerciseName, [['Repeticiones', 10], ['Carga en kg', 25], ['RIR', 2]]);
  const independentSessions = await poll(async () => checked(await db.from('training_sessions').select('id,client_id,coach_id,client_gym_membership_id,session_date')
    .eq('routine_id', independentRoutine.id), 'Read independent training session'), value => value.length === 1, 'Independent training session was not saved');
  const independentSession = independentSessions[0];
  const savedSets = await poll(async () => checked(await db.from('training_session_sets').select('actual_reps,rir,load').eq('training_session_id', independentSession.id), 'Read saved sets'),
    rows => rows.length === 1 && rows[0].actual_reps === 10 && rows[0].rir === 2 && Number(rows[0].load) === 25, 'Training values were not saved');
  check(savedSets.length === 1 && independentSession.client_gym_membership_id === null && independentSession.coach_id === coach.id
    && independentSession.client_id === client.id && independentSession.session_date === new Date().toISOString().slice(0, 10),
    'Independent series use original training tables, UTC date and exact client context');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^Registrar series/ }).click();
  check(await page.getByLabel(`Repeticiones, serie 1 de ${exerciseName}`, { exact: true }).inputValue() === '10',
    'Saved series survive a hard reload');
  const reps = page.getByLabel(`Repeticiones, serie 1 de ${exerciseName}`, { exact: true });
  await reps.fill('11'); await reps.press('Tab'); await page.waitForLoadState('networkidle');
  await poll(async () => checked(await db.from('training_session_sets').select('actual_reps').eq('training_session_id', independentSession.id), 'Read edited set'),
    rows => rows.length === 1 && rows[0].actual_reps === 11, 'Repeated edit did not finish saving');
  check(checked(await db.from('training_sessions').select('id').eq('routine_id', independentRoutine.id), 'Read reused session').length === 1
    && checked(await db.from('training_session_sets').select('actual_reps').eq('training_session_id', independentSession.id), 'Read reused set').length === 1,
    'Repeated edits reuse the original daily session and unique series');

  await page.goto(`${base}/client/portal`, { waitUntil: 'networkidle' });
  await page.getByRole('combobox', { name: 'Entrenador o gimnasio', exact: true }).click();
  await page.getByRole('option', { name: gymName, exact: true }).click();
  await page.getByRole('heading', { name: 'Rutina gimnasio original', exact: true }).first().waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  check(await page.evaluate(key => localStorage.getItem(key), contextKey) === gymKey,
    'The existing gym context survives reload without replacing the shared client');
  await page.goto(`${base}/client/measurements`, { waitUntil: 'networkidle' });
  await page.getByText('Medición gimnasio original', { exact: true }).first().waitFor();
  check(await page.getByText('Medición independiente original', { exact: true }).count() === 0,
    'Measurements retain the selected gym context using original table filters');
  await record(page, gymRoutine.id, exerciseName, [['Repeticiones', 8], ['RIR', 3]]);
  const gymSessions = await poll(async () => checked(await db.from('training_sessions').select('id,client_gym_membership_id,coach_id,portal_scope')
    .eq('routine_id', gymRoutine.id), 'Read gym training session'), rows => rows.length === 1, 'Gym series were not saved');
  await poll(async () => checked(await db.from('training_session_sets').select('actual_reps,rir').eq('training_session_id', gymSessions[0].id), 'Read gym set'),
    rows => rows.length === 1 && rows[0].actual_reps === 8 && rows[0].rir === 3, 'Gym training values did not finish saving');
  check(gymSessions[0].client_gym_membership_id === membership.id && gymSessions[0].coach_id === owner.id && gymSessions[0].portal_scope === 'gym',
    'Gym series retain the original membership and coach context');
  check(checked(await db.from('training_session_sets').select('actual_reps,rir').eq('training_session_id', independentSession.id), 'Read independent set after gym edit')[0].actual_reps === 11,
    'Gym edits preserve the existing independent training record');
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: contextKey, value: `independent:${coach.id}:${legacyClient.id}`
  });
  await page.goto(`${base}/client/profile`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Cliente vinculado heredado', exact: true }).waitFor();
  check(await page.locator('[formcontrolname="name"]').inputValue() === 'Cliente vinculado heredado',
    'Historical ICPA links remain readable when clients.user_id differs');
  await page.locator('[formcontrolname="phone"]').fill('+506 8888 6666');
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('Tus datos personales se guardaron correctamente.', { exact: true }).waitFor();
  const legacy = checked(await db.from('clients').select('phone,user_id,portal_status').eq('id', legacyClient.id).single(), 'Read historical profile');
  check(legacy.phone === '+506 8888 6666' && legacy.user_id === owner.id && legacy.portal_status === 'pending',
    'Historical profile edits follow original RLS without changing identity or activation state');
  const protectedSession = await page.evaluate(key => localStorage.getItem(key), authKey);
  await page.goto(`${base}/set-password`, { waitUntil: 'networkidle' });
  await page.getByRole('alert').filter({ hasText: 'El enlace no es válido o expiró' }).waitFor();
  await page.locator('#new-password').fill(`${password}Invalid1!`);
  await page.locator('#password-confirmation').fill(`${password}Invalid1!`);
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'El enlace no es válido o expiró' }).waitFor();
  check((await anonymous().auth.signInWithPassword({ email: portal.email, password })).error === null
    && await page.evaluate(key => localStorage.getItem(key), authKey) === protectedSession,
    'Opening password actions without a validated link preserves the current account and password');
  const otherAction = checked(await db.auth.admin.generateLink({ type: 'recovery', email: owner.email }), 'Create another identity recovery link');
  await page.goto(`${base}/set-password?type=recovery&token_hash=${encodeURIComponent(otherAction.properties.hashed_token)}`, { waitUntil: 'networkidle' });
  const otherPassword = `${randomBytes(20).toString('base64url')}Cc3!`;
  await page.locator('#new-password').fill(otherPassword);
  await page.locator('#password-confirmation').fill(otherPassword);
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/client/portal');
  check((await anonymous().auth.signInWithPassword({ email: owner.email, password: otherPassword })).error === null,
    'A validated recovery link updates its intended identity');
  check(await page.evaluate(key => localStorage.getItem(key), authKey) === protectedSession
    && (await anonymous().auth.signInWithPassword({ email: portal.email, password })).error === null,
    'Recovering another identity preserves the original Portal session and password');
  await signedIn.close();

  const action = checked(await db.auth.admin.generateLink({ type: 'recovery', email: portal.email }), 'Create local recovery link');
  const recovering = await context();
  const recoveryPage = await recovering.newPage();
  await recoveryPage.goto(`${base}/set-password?type=recovery&token_hash=${encodeURIComponent(action.properties.hashed_token)}`, { waitUntil: 'networkidle' });
  check(new URL(recoveryPage.url()).search === '', 'Recovery credentials are removed from browser history');
  const nextPassword = `${randomBytes(20).toString('base64url')}Bb2!`;
  await recoveryPage.locator('#new-password').fill(nextPassword);
  await recoveryPage.locator('#password-confirmation').fill(nextPassword);
  await recoveryPage.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
  await recoveryPage.waitForURL(url => url.pathname === '/login' && url.searchParams.get('passwordUpdated') === '1');
  check((await anonymous().auth.signInWithPassword({ email: portal.email, password: nextPassword })).error === null,
    'Original Auth recovery updates the intended account through an isolated action session');
  check(await recoveryPage.evaluate(key => localStorage.getItem(key), authKey) === null,
    'Recovery does not persist a normal application session');
  await recovering.close();
  check(rpcAttempts.length === 0, 'All Portal and password journeys complete without any RPC request');
  assert.deepEqual(browserErrors, [], 'Uncaught browser errors in the original-backend journeys');
  check(true, 'No uncaught browser errors occur in the original-backend journeys');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGINT');
  if (clients.length) checked(await db.from('clients').delete().in('id', clients), 'Clean client fixtures');
  if (gyms.length) checked(await db.from('gyms').delete().in('id', gyms), 'Clean gym fixtures');
  if (exercises.length) checked(await db.from('exercises').delete().in('id', exercises), 'Clean exercise fixtures');
  if (users.length) checked(await db.from('coaches').delete().in('id', users), 'Clean coach fixtures');
  for (const id of users) checked(await db.auth.admin.deleteUser(id), 'Clean Auth fixture');
}
console.log(`Original backend Portal/Auth: ${checks.length} checks passed; local fixtures removed.`);
for (const label of checks) console.log(`PASS ${label}`);
