import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, stat, mkdir, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Real UI and RLS on the local original-schema copy. No proxy, mocked responses,
// injected browser sessions, production writes or edits to persistent demo data.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted targets are unsupported.');
assert.equal(process.env.ORIGINAL_USER_FLOWS_LOCAL, '1', 'Set ORIGINAL_USER_FLOWS_LOCAL=1 after local seed and suite coordination.');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--focus'), 'Usage: original-user-flows-check.mjs [--focus auth|clients|competitor|gym|portal]');
const focus = args[1] || 'full';
assert.ok(['full', 'auth', 'clients', 'competitor', 'gym', 'portal'].includes(focus), 'Unknown focused flow.');
const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4350';
assert.equal(base, 'http://127.0.0.1:4350', 'Use the dedicated local-testing frontend.');
const manifestPath = process.env.ORIGINAL_DEMO_CREDENTIALS_FILE || `${homedir()}/.local/share/coachfitflow-testing/original-demo-credentials.json`;
assert.equal((await stat(manifestPath)).mode & 0o077, 0, 'The demo credentials file must be private (0600).');
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.formatVersion, 1);
assert.equal(manifest.fixtureNamespace, 'coachfitflow-original-demo-v1');
assert.equal(manifest.state, 'ready', 'Complete the persistent local seed before running UI flows.');
assert.equal(manifest.target.apiUrl, 'http://127.0.0.1:55321');
assert.equal(manifest.target.projectId, 'coachfitflow-original-compat');
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, manifest.target.apiUrl);
for (const [key, role] of [[target.ANON_KEY, 'anon'], [target.SERVICE_ROLE_KEY, 'service_role']]) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  assert.ok(claims.role === role && claims.ref !== 'bzhqprxolseyxuuwodqs', 'Only locally issued credentials are supported.');
}
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const environment = await readFile(`${appRoot}/src/environments/environment.local-testing.ts`, 'utf8');
assert.ok(environment.includes(target.API_URL), 'The local-testing build must directly target port 55321.');
assert.ok(environment.includes(base), 'Auth redirect origin must be the dedicated local-testing frontend.');
assert.ok(environment.includes(target.ANON_KEY) && environment.includes('zummith-v2-testing-auth'), 'The browser must use the public local key and isolated testing session.');
assert.ok(!environment.includes(target.SERVICE_ROLE_KEY), 'Privileged credentials must never enter the frontend.');
const requiredRoles = ['admin', 'coach_standard', 'coach_pro', 'owner', 'trainer', 'receptionist', 'independent_client', 'gym_client'];
for (const role of requiredRoles) {
  const account = manifest.accounts[role];
  assert.ok(account?.email && account.password?.length >= 8 && account.userId, `Missing demo role ${role}.`);
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => {
    assert.equal(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).origin, target.API_URL, 'SDK traffic must remain local.');
    return fetch(input, init);
  } }
};
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(6).toString('hex');
const prefix = `original-user-flows-${suffix}`;
const nameSuffix = suffix.replace(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit)));
const artifacts = process.env.ORIGINAL_USER_FLOWS_ARTIFACTS || `/tmp/coachfitflow-${prefix}`;
assert.ok(artifacts.startsWith('/tmp/'), 'Test artifacts must stay outside the repository.');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);
const own = { clients: new Set(), gyms: new Set(), routines: new Set(), users: new Set(), sheets: new Set() };
const demoUserIds = new Set(Object.values(manifest.accounts).map(account => account.userId));
const checks = [], browserErrors = [], escapedRequests = [], cleanupErrors = [];
let browser, activePage, phase = 'preflight', failure;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'no-code'})`);
  return result.data;
}
function check(condition, label) { assert.ok(condition, label); checks.push(label); }
function begin(label) { phase = label; console.log(`UI phase: ${label}`); }
function dateOnly(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
async function eventually(read, predicate, label) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(label);
}
async function snapshotDemo() {
  const fixtures = manifest.fixtures;
  const ids = value => [...new Set(Object.values(value || {}).flatMap(item => typeof item === 'string' ? [item] : ids(item)))];
  const clientIds = ids(fixtures.clients);
  const routineIds = ids(fixtures.routines);
  const membershipIds = ids(fixtures.memberships);
  const gymIds = [...new Set([fixtures.gymId, fixtures.secondGymId, ...ids(fixtures.gyms)].filter(Boolean))];
  const reads = [
    ['clients', 'id,user_id,primary_coach_id,name,email,phone,birth_date,weight,height,goal,notes,portal_status', 'id', clientIds],
    ['client_gym_memberships', 'id,client_id,gym_id,assigned_coach_id,membership_plan_id,subscription_status,next_payment_due_date,portal_status', 'id', membershipIds],
    ['routines', 'id,client_id,coach_id,client_gym_membership_id,name,objective,training_days_count,duration_weeks,start_date,end_date,notes', 'id', routineIds],
    ['training_sessions', '*', 'routine_id', routineIds],
    ['measurements', '*', 'client_id', clientIds],
    ['payments', '*', 'client_gym_membership_id', membershipIds],
    ['membership_plans', '*', 'gym_id', gymIds],
    ['gyms', 'id,name,owner_id,email,phone,address,access_code', 'id', gymIds],
    ['coaches', 'id,name,email,role,account_type,coach_plan,next_plan_payment_date', 'id', [...demoUserIds]]
  ];
  const result = {};
  async function rows(table, columns, filter, values) {
    const all = [];
    if (!values.length) return all;
    for (let offset = 0; ; offset += 1000) {
      const page = checked(await db.from(table).select(columns).in(filter, values).order('id').range(offset, offset + 999), `Snapshot ${table}`);
      all.push(...page);
      if (page.length < 1000) return all;
    }
  }
  for (const [table, columns, filter, values] of reads) result[table] = await rows(table, columns, filter, values);
  const sessionIds = result.training_sessions.map(row => row.id);
  result.training_session_sets = await rows('training_session_sets', '*', 'training_session_id', sessionIds);
  return result;
}
async function newPage(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, timezoneId: 'America/Costa_Rica', reducedMotion: 'reduce', acceptDownloads: true });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.origin === target.API_URL || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (url.hostname.endsWith('.supabase.co')) escapedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror', error => browserErrors.push(error.message));
  activePage = page;
  return { context, page };
}
async function login(page, account, label) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.locator('#password').fill(account.password);
  const authRequest = page.waitForRequest(request => request.url().startsWith(`${target.API_URL}/auth/v1/token`) && request.method() === 'POST');
  await Promise.all([authRequest, page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()]);
  await page.waitForURL(url => url.pathname !== '/login', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
  check(new URL(page.url()).pathname.startsWith('/client/') === label.endsWith('_client'), `${label}: correct coach/portal destination after real login`);
}
async function logout(page, label) {
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/login');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  check(new URL(page.url()).pathname === '/login', `${label}: logout remains effective after reload`);
}
async function screenshot(page, label) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
  const path = `${artifacts}/${label}.png`;
  await page.screenshot({ path, fullPage: true });
  await chmod(path, 0o600);
}
async function choose(page, accessibleName, optionName) {
  const trigger = page.getByRole('combobox', { name: accessibleName, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await trigger.click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}
async function pdf(page, label) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByRole('button', { name: 'Descargar PDF', exact: true }).click()
  ]);
  assert.equal(await download.failure(), null, `${label}: download failed`);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  check(bytes.subarray(0, 5).toString() === '%PDF-' && bytes.length > 1000, `${label}: actual nonempty PDF download`);
}
async function createClientUI(page, coachId, gymId = '') {
  const label = gymId ? 'Gimnasio' : 'Independiente';
  const name = `Atleta ${label} ${nameSuffix}`;
  const email = `${prefix}-${gymId ? 'gym' : 'independent'}@example.invalid`;
  const route = gymId ? `/gym/${gymId}/clients` : '/clients';
  await page.goto(`${base}${route}/new`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Agregar cliente', exact: true }).waitFor();
  for (const [id, value] of [['client-name', name], ['client-email', email], ['client-phone', '88887777'], ['client-birth', '1992-06-15'], ['client-height', '176'], ['client-weight', '78'], ['client-goal', 'Mejorar la fuerza con técnica y progresión'], ['client-notes', 'Fixture efímero creado desde la interfaz local.']]) await page.locator(`#${id}`).fill(value);
  await page.getByRole('button', { name: 'Crear cliente', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith(`${route}/`) && !url.pathname.endsWith('/new'), { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split('/').at(-1);
  own.clients.add(id);
  const row = checked(await db.from('clients').select('id,name,primary_coach_id').eq('id', id).single(), 'Read UI-created client');
  check(row.name === name && row.primary_coach_id === coachId, `${label}: UI creates the original base client`);
  if (gymId) {
    const member = checked(await db.from('client_gym_memberships').select('id,assigned_coach_id').eq('gym_id', gymId).eq('client_id', id).single(), 'Read gym membership');
    check(member.assigned_coach_id === coachId, 'Gym UI creation links the original membership');
    return { id, name, route, membershipId: member.id };
  }
  return { id, name, route };
}
async function editClientUI(page, client, label) {
  for (const mode of ['inline', 'legacy']) {
    await page.goto(`${base}${client.route}/${client.id}${mode === 'legacy' ? '/edit' : ''}`, { waitUntil: 'networkidle' });
    if (mode === 'inline') await page.locator('.client-utilities').getByRole('button', { name: 'Editar', exact: true }).click();
    const notes = `Seguimiento ajustado por ${label} desde el editor ${mode}.`;
    await page.locator('#client-notes').fill(notes);
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    if (mode === 'legacy') await page.waitForURL(url => url.pathname === `${client.route}/${client.id}` && url.searchParams.get('result') === 'updated' && url.searchParams.get('tab') === 'profile');
    await page.getByText('Los cambios del cliente se guardaron.', { exact: true }).waitFor();
    await page.locator('.profile-overview').waitFor();
    await page.getByRole('heading', { name: client.name, level: 1 }).waitFor();
    check(checked(await db.from('clients').select('notes').eq('id', client.id).single(), 'Read edited client').notes === notes
      && await page.getByRole('tab', { name: 'Perfil', exact: true }).getAttribute('aria-selected') === 'true', `${label}: ${mode} client edit persists with stable feedback and profile view`);
  }
}
async function measurementUI(page, client) {
  await page.goto(`${base}${client.route}/${client.id}?tab=measurements`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Nueva medición', exact: true }).click();
  await page.locator('[formcontrolname="weight"]').fill('79');
  await page.locator('[formcontrolname="height"]').fill('176');
  await page.getByRole('button', { name: 'Guardar medición', exact: true }).click();
  await page.getByText('La medición quedó guardada.', { exact: true }).waitFor();
  let row = checked(await db.from('measurements').select('id,weight').eq('client_id', client.id).single(), 'Read UI measurement');
  check(Number(row.weight) === 79, 'Measurement creation persists');
  await page.locator('.measurement-row').getByRole('button', { name: 'Editar', exact: true }).click();
  await page.locator('[formcontrolname="weight"]').fill('80');
  await page.getByRole('button', { name: 'Guardar medición', exact: true }).click();
  await eventually(async () => checked(await db.from('measurements').select('weight').eq('id', row.id).single(), 'Read edited measurement'), value => Number(value.weight) === 80, 'Measurement edit did not persist');
  check(true, 'Measurement editing persists');
  await page.locator('.measurement-row').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.locator('.measurement-row').waitFor({ state: 'detached' });
  check(checked(await db.from('measurements').select('id').eq('id', row.id), 'Read deleted measurement').length === 0, 'Confirmed measurement deletion persists');
}
async function routineUI(page, client, coachId, gymId = '') {
  const route = gymId ? `/gym/${gymId}/routines` : '/routines';
  const name = `Rutina de fuerza ${suffix}`;
  await page.goto(`${base}${route}/new?clientId=${client.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '¿Para quién es esta rutina?', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.locator('#routine-name').fill(name);
  await page.locator('#routine-objective').fill('Fuerza general y adherencia');
  await choose(page, 'Días por semana', '1 día');
  await page.locator('#routine-weeks').fill('4');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.locator('.day-setup').getByRole('button', { name: 'Full Body', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  const exercise = page.locator('.catalog-list article').first();
  await exercise.waitFor();
  await exercise.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar rutina', exact: true }).click();
  await page.waitForURL(url => new RegExp(`^${route}/[0-9a-f-]+$`).test(url.pathname), { timeout: 30_000 });
  const id = new URL(page.url()).pathname.split('/').at(-1); own.routines.add(id);
  const saved = checked(await db.from('routines').select('coach_id,client_id,client_gym_membership_id,name').eq('id', id).single(), 'Read UI routine');
  check(saved.coach_id === coachId && saved.client_id === client.id && saved.client_gym_membership_id === (client.membershipId || null), `${gymId ? 'Gym' : 'Independent'} routine saves the intended original scope and author`);
  await pdf(page, gymId ? 'gym-routine' : 'independent-routine');
  await page.getByRole('button', { name: 'Editar rutina', exact: true }).click();
  await page.locator('.builder-progress button').filter({ hasText: 'Datos' }).click();
  await page.locator('#routine-objective').fill('Objetivo ajustado sin perder la estructura');
  await page.locator('.builder-progress button').filter({ hasText: 'Revisión' }).click();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('Los cambios de la rutina se guardaron correctamente.', { exact: true }).waitFor();
  check(checked(await db.from('routines').select('objective').eq('id', id).single(), 'Read updated UI routine').objective.includes('Objetivo ajustado'), 'Routine editing persists');
  return { id, route };
}
async function deleteRoutineUI(page, routine) {
  await page.goto(`${base}${routine.route}/${routine.id}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar rutina', exact: true }).click();
  await page.waitForURL(url => url.pathname === routine.route);
  check(checked(await db.from('routines').select('id').eq('id', routine.id), 'Read deleted routine').length === 0, 'Confirmed routine deletion persists');
}
async function competitorUI(page, client) {
  async function review() {
    // This wizard deliberately accepts only one forward step at a time.
    await page.locator('.editor-footer').getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('heading', { name: 'Entrenamiento A', exact: true }).waitFor();
    await page.locator('.editor-footer').getByRole('button', { name: 'Continuar', exact: true }).click();
    await page.getByRole('heading', { name: 'Lista para guardar y exportar', exact: true }).waitFor();
  }
  await page.goto(`${base}/competitor/new?clientId=${client.id}`, { waitUntil: 'networkidle' });
  await page.locator('#program-title').fill(`Preparación ${suffix}`);
  await page.locator('#mesocycle-title').fill('Acumulación de fuerza');
  await page.locator('#macrocycle-title').fill('Temporada de competencia');
  await page.locator('#frequency-text').fill('Tres veces por semana');
  await page.locator('#split-text').fill('Cuerpo completo');
  await page.locator('#training-days-text').fill('Lunes, miércoles y viernes');
  await page.locator('.editor-footer').getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.locator('.exercise-block').first().getByLabel('Ejercicio', { exact: true }).fill('Sentadilla frontal');
  await page.locator('.editor-footer').getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('heading', { name: 'Lista para guardar y exportar', exact: true }).waitFor();
  await page.locator('.editor-footer').getByRole('button', { name: 'Guardar hoja', exact: true }).click();
  await page.waitForURL(url => /^\/competitor\/[0-9a-f-]+\/edit$/.test(url.pathname));
  await page.getByText('La hoja de competidor quedó guardada.', { exact: true }).waitFor();
  const id = new URL(page.url()).pathname.split('/')[2]; own.sheets.add(id);
  check(checked(await db.from('competitor_sheets').select('client_id,workouts').eq('id', id).single(), 'Read UI competitor').workouts[0].blocks[0].name === 'Sentadilla frontal', 'Competitor sheet preserves the configured exercise');
  await review();
  await pdf(page, 'competitor');
  await page.locator('.sheet-progress button').first().click();
  await page.locator('#macrocycle-title').fill('Temporada ajustada desde la interfaz');
  await review();
  await page.locator('.editor-footer').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByText('Los cambios de la hoja se guardaron correctamente.', { exact: true }).waitFor();
  check(checked(await db.from('competitor_sheets').select('macrocycle_title').eq('id', id).single(), 'Read edited competitor').macrocycle_title.includes('ajustada'), 'Competitor editing persists');
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('button', { name: 'Eliminar hoja', exact: true }).click();
  await page.waitForURL(url => url.pathname === `/clients/${client.id}`);
  check(checked(await db.from('competitor_sheets').select('id').eq('id', id), 'Read deleted competitor').length === 0, 'Confirmed competitor deletion persists');
}
async function fixtureGym() {
  const gymId = randomUUID(); own.gyms.add(gymId);
  checked(await db.from('gyms').insert({ id: gymId, name: `Gimnasio de flujos ${suffix}`, owner_id: manifest.accounts.owner.userId, access_code: suffix.slice(0, 6).toUpperCase() }), 'Create ephemeral UI gym');
  checked(await db.from('gym_staff').insert([
    { gym_id: gymId, coach_id: manifest.accounts.trainer.userId, role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false },
    { gym_id: gymId, coach_id: manifest.accounts.receptionist.userId, role: 'receptionist', can_edit_clients: false, can_create_routines: false, can_view_payments: true, can_manage_staff: false }
  ]), 'Create ephemeral staff affiliations');
  return gymId;
}
async function gymUI(gymId) {
  const owner = await newPage();
  await login(owner.page, manifest.accounts.owner, 'owner');
  const client = await createClientUI(owner.page, manifest.accounts.owner.userId, gymId);
  await editClientUI(owner.page, client, 'Owner');
  await owner.page.goto(`${base}/gym/payments/${gymId}`, { waitUntil: 'networkidle' });
  await owner.page.getByRole('button', { name: 'Crear plan', exact: true }).click();
  await owner.page.locator('#plan-name').fill(`Mensual de prueba ${suffix}`);
  await owner.page.locator('#plan-price').fill('28000');
  await owner.page.getByRole('button', { name: 'Guardar plan', exact: true }).click();
  await owner.page.getByRole('status').filter({ hasText: 'El plan quedó disponible' }).waitFor();
  const plan = checked(await db.from('membership_plans').select('id,name').eq('gym_id', gymId).single(), 'Read UI-created membership plan');
  check(!!plan.id, 'Owner creates original membership plan');
  const billing = owner.page.locator('.billing-row').filter({ hasText: client.name });
  await billing.getByRole('button', { name: 'Configurar', exact: true }).click();
  await choose(owner.page, 'Plan', new RegExp(`^${plan.name} ·`));
  await owner.page.locator('#membership-due-date').fill(dateOnly());
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await owner.page.getByRole('status').filter({ hasText: 'Membresía de' }).waitFor();
  const before = checked(await db.from('client_gym_memberships').select('membership_plan_id,next_payment_due_date').eq('id', client.membershipId).single(), 'Read configured membership');
  check(before.membership_plan_id === plan.id, 'Owner assigns plan through original membership update');
  await billing.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await owner.page.locator('#payment-amount').fill('28000');
  await owner.page.locator('#payment-notes').fill(prefix);
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await owner.page.getByRole('status').filter({ hasText: 'registrado. El próximo vencimiento' }).waitFor();
  const payment = checked(await db.from('payments').select('id,status,created_by').eq('client_gym_membership_id', client.membershipId).single(), 'Read UI receipt');
  const after = checked(await db.from('client_gym_memberships').select('next_payment_due_date').eq('id', client.membershipId).single(), 'Read paid membership');
  check(payment.status === 'paid' && payment.created_by === manifest.accounts.owner.userId && after.next_payment_due_date > before.next_payment_due_date, 'Owner payment persists receipt and advances monthly due date');
  await screenshot(owner.page, 'gym-payments-desktop');
  await owner.page.goto(`${base}/gym/settings/${gymId}`, { waitUntil: 'networkidle' });
  await owner.page.locator('#gym-address').fill('San José, frente al parque. Actualizado desde la interfaz.');
  await owner.page.getByRole('button', { name: 'Guardar cambios', exact: true }).first().click();
  await owner.page.getByText('La información del gimnasio quedó actualizada.', { exact: true }).waitFor();
  await eventually(async () => checked(await db.from('gyms').select('address').eq('id', gymId).single(), 'Read settings'), row => row.address?.includes('Actualizado'), 'Owner settings did not persist');
  check(true, 'Owner settings persist on the original gym');
  await owner.context.close();

  const trainer = await newPage({ width: 390, height: 844 });
  await login(trainer.page, manifest.accounts.trainer, 'trainer');
  await editClientUI(trainer.page, client, 'Trainer');
  const routine = await routineUI(trainer.page, client, manifest.accounts.trainer.userId, gymId);
  await screenshot(trainer.page, 'gym-routine-mobile');
  for (const path of [`/gym/settings/${gymId}`, `/gym/payments/${gymId}`]) {
    await trainer.page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    check(new URL(trainer.page.url()).pathname === `/gym/${gymId}/clients`, `Trainer is denied ${path.startsWith('/gym/settings') ? 'settings' : 'payments'} before editing`);
  }
  await trainer.context.close();

  const reception = await newPage({ width: 390, height: 844 });
  await login(reception.page, manifest.accounts.receptionist, 'receptionist');
  await reception.page.goto(`${base}/gym/${gymId}/clients/${client.id}`, { waitUntil: 'networkidle' });
  await reception.page.getByRole('heading', { name: client.name, level: 1 }).waitFor();
  check(await reception.page.locator('.client-utilities').getByRole('button', { name: 'Editar', exact: true }).count() === 0, 'Reception can view clients without edit controls');
  await reception.page.goto(`${base}${routine.route}/${routine.id}`, { waitUntil: 'networkidle' });
  await reception.page.locator('.routine-days .day-plan').first().waitFor();
  check(await reception.page.getByRole('button', { name: 'Editar rutina', exact: true }).count() === 0, 'Reception views gym routine without author controls');
  await reception.page.goto(`${base}/gym/payments/${gymId}`, { waitUntil: 'networkidle' });
  await reception.page.getByRole('heading', { name: 'Cobros y membresías', exact: true }).waitFor();
  check(await reception.page.getByRole('button', { name: 'Crear plan', exact: true }).count() === 0, 'Reception sees payment history without owner plan controls');
  await reception.page.locator('.billing-row').filter({ hasText: client.name }).getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await reception.page.locator('#payment-amount').fill('28000');
  await reception.page.getByRole('dialog').getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await reception.page.getByRole('alert').filter({ hasText: 'Tu acceso permite consultar pagos' }).waitFor();
  check(checked(await db.from('payments').select('id').eq('client_gym_membership_id', client.membershipId), 'Read denied reception payment').length === 1, 'Reception cannot create a partial receipt under original permissions');
  await reception.page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await screenshot(reception.page, 'gym-reception-mobile');
  for (const path of [`/gym/settings/${gymId}`, `/gym/${gymId}/clients/${client.id}/edit`, `/gym/${gymId}/routines/new?clientId=${client.id}`]) {
    await reception.page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    check(new URL(reception.page.url()).pathname === `/gym/${gymId}/clients`, 'Reception direct restricted route is denied');
  }
  await reception.context.close();
}
async function portalFixture(scope, gymId) {
  const portal = manifest.accounts[scope === 'gym' ? 'gym_client' : 'independent_client'];
  const coach = manifest.accounts[scope === 'gym' ? 'owner' : 'coach_pro'];
  const clientId = randomUUID(); own.clients.add(clientId);
  checked(await db.from('clients').insert({ id: clientId, name: `Atleta portal ${scope} ${nameSuffix}`, email: `${prefix}-portal-${scope}@example.invalid`, user_id: portal.userId, primary_coach_id: coach.userId, age: 30, goal: 'Fortalecer técnica y progresión del entrenamiento', portal_status: 'active' }), 'Create ephemeral portal client');
  let membershipId = null;
  if (scope === 'gym') {
    const member = checked(await db.from('client_gym_memberships').insert({ client_id: clientId, gym_id: gymId, assigned_coach_id: coach.userId, portal_status: 'active', subscription_status: 'active' }).select('id').single(), 'Create ephemeral portal membership');
    membershipId = member.id;
    checked(await db.from('client_portal_access').insert({ user_id: portal.userId, client_gym_membership_id: membershipId }), 'Link ephemeral gym portal');
  } else checked(await db.from('independent_client_portal_access').insert({ user_id: portal.userId, client_id: clientId, coach_id: coach.userId }), 'Link ephemeral independent portal');
  const routineId = randomUUID(); own.routines.add(routineId);
  checked(await db.from('routines').insert({ id: routineId, client_id: clientId, coach_id: coach.userId, client_gym_membership_id: membershipId, name: `Rutina portal de flujos ${scope} ${suffix}`, objective: 'Comprobar registro RIR aislado', training_days_count: 1, duration_weeks: 4 }), 'Create ephemeral portal routine');
  const day = checked(await db.from('routine_days').insert({ routine_id: routineId, day_number: 1, day_name: 'Fuerza completa', muscle_groups: ['Piernas'] }).select('id').single(), 'Create ephemeral portal day');
  const exerciseId = manifest.fixtures.exercises.squat;
  const exercise = checked(await db.from('exercises').select('name').eq('id', exerciseId).single(), 'Read demo exercise for isolated plan');
  checked(await db.from('routine_day_exercises').insert({ routine_day_id: day.id, exercise_id: exerciseId, sets: 3, reps: '8-10', rest: '90 s', order_index: 0, block_type: 'single' }), 'Assign ephemeral portal exercise');
  return { scope, portal, coach, clientId, membershipId, routineId, dayId: day.id, exerciseName: exercise.name };
}
async function portalUI(fixture) {
  const state = await newPage({ width: 390, height: 844 });
  const label = fixture.scope === 'gym' ? 'gym_client' : 'independent_client';
  await login(state.page, fixture.portal, label);
  // Context selection is a normal UI interaction. An independent identity can
  // legitimately have two clients under the same coach; choose the last matching
  // option, created after the persistent fixture and ordered by access creation.
  {
    const name = fixture.scope === 'gym' ? `Gimnasio de flujos ${suffix}` : fixture.coach.name;
    const trigger = state.page.getByRole('combobox', { name: 'Entrenador o gimnasio', exact: true });
    await trigger.waitFor();
    await state.page.evaluate(async () => { await document.fonts.ready; });
    await trigger.scrollIntoViewIfNeeded();
    await trigger.focus();
    await state.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await state.page.evaluate(() => {
      window.__contextPickerEvents = [];
      const trigger = document.getElementById('portal-context');
      const record = (kind, target) => window.__contextPickerEvents.push({ kind, time: performance.now(), target: target?.id || target?.nodeName,
        expanded: trigger?.getAttribute('aria-expanded'), connected: trigger?.isConnected, y: scrollY });
      for (const kind of ['pointerdown', 'pointerup', 'click', 'scroll', 'resize']) document.addEventListener(kind, event => record(kind, event.target), true);
      new MutationObserver(() => record('expanded-change', trigger)).observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });
      record('before-tap', trigger);
    });
    await trigger.tap();
    await state.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await writeFile(`${artifacts}/context-picker-${fixture.scope}.json`, JSON.stringify(await state.page.evaluate(() => window.__contextPickerEvents), null, 2), { mode: 0o600 });
    check(await trigger.getAttribute('aria-expanded') === 'true', `${fixture.scope}: context picker opens after focus and layout settle`);
    await state.page.getByRole('option', { name, exact: true }).last().tap();
  }
  // Open the scoped routine directly: the Portal verifies it belongs to the
  // selected context rather than accepting an arbitrary routine ID.
  await state.page.goto(`${base}/client/routines/${fixture.routineId}`, { waitUntil: 'networkidle' });
  await state.page.getByRole('heading', { name: `Rutina portal de flujos ${fixture.scope} ${suffix}`, level: 1 }).waitFor();
  await pdf(state.page, `${fixture.scope}-portal`);
  await state.page.getByRole('button', { name: 'Registrar series', exact: true }).click();
  const tracker = state.page.getByRole('region', { name: `Registro de ${fixture.exerciseName}`, exact: true });
  await tracker.getByLabel(`Repeticiones, serie 1 de ${fixture.exerciseName}`, { exact: true }).fill('9');
  await tracker.getByLabel(`Repeticiones, serie 1 de ${fixture.exerciseName}`, { exact: true }).blur();
  await tracker.getByLabel(`Carga en kg, serie 1 de ${fixture.exerciseName}`, { exact: true }).fill('40');
  await tracker.getByLabel(`Carga en kg, serie 1 de ${fixture.exerciseName}`, { exact: true }).blur();
  await tracker.getByLabel(`RIR, serie 1 de ${fixture.exerciseName}`, { exact: true }).fill('2');
  await tracker.getByLabel(`RIR, serie 1 de ${fixture.exerciseName}`, { exact: true }).blur();
  const saved = await eventually(async () => {
    const sessions = checked(await db.from('training_sessions').select('id,client_id,portal_scope').eq('routine_id', fixture.routineId), 'Read isolated training session');
    if (!sessions.length) return null;
    const sets = checked(await db.from('training_session_sets').select('actual_reps,load,rir').eq('training_session_id', sessions[0].id).eq('set_number', 1), 'Read isolated training set');
    return { session: sessions[0], set: sets[0] };
  }, row => row?.set?.actual_reps === 9 && Number(row.set.load) === 40 && row.set.rir === 2, 'Portal RIR autosave did not persist');
  check(saved.session.client_id === fixture.clientId && saved.session.portal_scope === fixture.scope, `${fixture.scope}: Portal RIR autosave persists only in its own scope`);
  // Multiple field changes share a serial queue. Wait for its final status,
  // rather than only a matching intermediate DB row, before injecting failure.
  await tracker.getByText('Guardado', { exact: true }).waitFor();
  const loadControl = tracker.getByLabel(`Carga en kg, serie 1 de ${fixture.exerciseName}`, { exact: true });
  let rejected = false;
  const matcher = `${target.API_URL}/rest/v1/training_session_sets?*`;
  const rejectOwnSet = async route => {
    const request = route.request();
    if (!rejected && request.method() === 'POST' && request.postDataJSON()?.routine_day_id === fixture.dayId) {
      rejected = true;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'LOCAL_TEST_FAILURE', message: 'Injected local RIR save failure' }) });
    }
    return route.fallback();
  };
  const ownSet = async () => checked(await db.from('training_session_sets').select('id,load')
    .eq('training_session_id', saved.session.id).eq('set_number', 1).eq('exercise_order', 0).single(), 'Read own portal retry set');
  await state.context.route(matcher, rejectOwnSet);
  try {
    await loadControl.fill('32.5'); await loadControl.blur();
    await state.page.getByRole('alert').filter({ hasText: 'Tus valores se conservan' }).waitFor();
    await tracker.getByText('Sin guardar', { exact: true }).waitFor();
    check(rejected && await loadControl.inputValue() === '32.5' && Number((await ownSet()).load) === 40,
      `${fixture.scope}: failed RIR write keeps the draft visible and marks it unsaved`);
    await screenshot(state.page, `${fixture.scope}-portal-save-error-mobile`);
  } finally { await state.context.unroute(matcher, rejectOwnSet); }
  await state.page.getByRole('alert').getByRole('button', { name: 'Reintentar', exact: true }).click();
  await eventually(ownSet, row => Number(row.load) === 32.5, 'Portal retry did not persist the retained draft');
  await tracker.getByText('Guardado', { exact: true }).waitFor();
  check(checked(await db.from('training_session_sets').select('id').eq('training_session_id', saved.session.id), 'Read own set count').length === 1,
    `${fixture.scope}: retry persists the preserved decimal value without duplicating the series`);
  await state.page.reload({ waitUntil: 'networkidle' });
  await state.page.getByRole('button', { name: /Registrar series/ }).click();
  check(await state.page.getByLabel(`RIR, serie 1 de ${fixture.exerciseName}`, { exact: true }).inputValue() === '2', `${fixture.scope}: RIR survives a real page reload`);
  check(await state.page.getByLabel(`Carga en kg, serie 1 de ${fixture.exerciseName}`, { exact: true }).inputValue() === '32.5',
    `${fixture.scope}: the retried decimal load survives a real reload`);
  await screenshot(state.page, `${fixture.scope}-portal-training-mobile`);
  await logout(state.page, label);
  await state.context.close();
}
async function cleanup() {
  const rows = checked(await db.from('clients').select('id,user_id,email').like('email', `${prefix}%`), 'Discover only run-owned clients');
  for (const row of rows) {
    own.clients.add(row.id);
    if (row.user_id && !demoUserIds.has(row.user_id)) {
      const user = checked(await db.auth.admin.getUserById(row.user_id), 'Verify ephemeral invited identity').user;
      if (user?.email?.startsWith(prefix)) own.users.add(user.id);
    }
  }
  const clientIds = [...own.clients];
  if (clientIds.length) {
    const members = checked(await db.from('client_gym_memberships').select('id').in('client_id', clientIds), 'Discover run memberships');
    if (members.length) {
      checked(await db.from('payments').delete().in('client_gym_membership_id', members.map(row => row.id)), 'Clean own receipts');
      const access = checked(await db.from('client_portal_access').select('user_id').in('client_gym_membership_id', members.map(row => row.id)), 'Discover invited identities');
      for (const row of access) if (!demoUserIds.has(row.user_id)) {
        const user = checked(await db.auth.admin.getUserById(row.user_id), 'Verify own invitation').user;
        if (user?.email?.startsWith(prefix)) own.users.add(row.user_id);
      }
    }
    for (const table of ['training_sessions', 'measurements', 'routines', 'competitor_sheets', 'independent_client_portal_access', 'client_gym_memberships']) checked(await db.from(table).delete().in('client_id', clientIds), `Clean own ${table}`);
    checked(await db.from('clients').delete().in('id', clientIds), 'Clean own clients');
  }
  for (const gymId of own.gyms) {
    checked(await db.from('membership_plans').delete().eq('gym_id', gymId), 'Clean own plans');
    checked(await db.from('gym_staff').delete().eq('gym_id', gymId), 'Clean own staff affiliations');
    checked(await db.from('gyms').delete().eq('id', gymId), 'Clean own gym');
  }
  for (const userId of own.users) {
    assert.ok(!demoUserIds.has(userId), 'Never remove a persistent demo identity.');
    checked(await db.from('coaches').delete().eq('id', userId), 'Clean ephemeral invited profile');
    const result = await db.auth.admin.deleteUser(userId);
    if (result.error && result.error.status !== 404) throw result.error;
  }
  check(checked(await db.from('clients').select('id').like('email', `${prefix}%`), 'Verify client cleanup').length === 0, 'All run-owned clients are removed');
  if (own.gyms.size) check(checked(await db.from('gyms').select('id').in('id', [...own.gyms]), 'Verify gym cleanup').length === 0, 'All run-owned gyms are removed');
}

let baseline;
try {
  assert.ok((await fetch(`${base}/login`)).ok, 'Root must start the local-testing frontend before this suite.');
  baseline = await snapshotDemo();
  await writeFile(`${artifacts}/baseline.json`, JSON.stringify(baseline), { mode: 0o600 });
  browser = await chromium.launch();
  if (focus === 'full' || focus === 'auth') {
  begin('all-role-authentication');
  for (const [role, account] of Object.entries(manifest.accounts)) {
    const state = await newPage();
    await login(state.page, account, role);
    await state.page.reload({ waitUntil: 'networkidle' });
    await state.page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
    check(new URL(state.page.url()).pathname !== '/login', `${role}: real session survives reload`);
    if (role.endsWith('_client')) {
      const scope = role === 'gym_client' ? 'gym' : 'independent';
      const routineId = manifest.fixtures.routines[scope];
      await state.page.goto(`${base}/client/routines/${routineId}`, { waitUntil: 'networkidle' });
      await state.page.locator('.days-section').waitFor();
      check(await state.page.locator('.exercise-item').count() > 0, `${role}: reads its assigned existing routine`);
      for (const route of ['/client/measurements', '/client/payments', '/client/profile']) {
        await state.page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
        check(await state.page.getByRole('alert').count() === 0, `${role}: ${route.split('/').at(-1)} loads without a backend error`);
        if (route === '/client/measurements') check(await state.page.locator('.measurement-row').count() >= 6, `${role}: six existing controls populate the measurements history`);
        if (route === '/client/profile') check(await state.page.locator('#identity-title').textContent(), `${role}: existing client identity appears in profile`);
        if (route === '/client/payments' && role === 'gym_client') check(await state.page.locator('.payment-list article').count() > 0, 'Gym Portal reads its existing payment history');
      }
    } else if (role === 'coach_pro' || role === 'coach_pro_expired') {
      if (role === 'coach_pro_expired') {
        await state.page.getByRole('heading', { name: 'Las funciones Pro están pausadas', exact: true }).waitFor();
        check(true, 'Expired Pro is displayed as paused after real login');
      }
      const client = checked(await db.from('clients').select('id').eq('primary_coach_id', account.userId).order('created_at').limit(1).single(), 'Read owning coach demo client');
      await state.page.goto(`${base}/clients/${client.id}?tab=rir`, { waitUntil: 'networkidle' });
      if (role === 'coach_pro') {
        await state.page.locator('.rir-session').first().waitFor();
        check(await state.page.locator('.rir-exercise-card').count() > 0, 'Active Pro reads historical RIR without changing existing sessions');
      } else {
        await state.page.locator('#pro-title').waitFor();
        check(await state.page.locator('.rir-session').count() === 0, 'Expired Pro keeps client access while RIR remains gated');
        await state.page.getByRole('button', { name: 'Cerrar', exact: true }).click();
      }
    } else if (role === 'admin') {
      for (const route of ['/admin/coaches', '/admin/activity', '/admin/announcements', '/admin/maintenance']) {
        await state.page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
        check(new URL(state.page.url()).pathname === route && await state.page.getByRole('alert').count() === 0, `Admin reads ${route} on the original schema`);
      }
    }
    await screenshot(state.page, `role-${role}`);
    await logout(state.page, role);
    await state.context.close();
  }
  }
  if (focus === 'full' || focus === 'competitor' || focus === 'clients') {
  begin(focus === 'full' ? 'independent-crud' : focus === 'clients' ? 'independent-client-edit' : 'competitor-crud');
  const independent = await newPage();
  await login(independent.page, manifest.accounts.coach_standard, 'coach_standard');
  const client = await createClientUI(independent.page, manifest.accounts.coach_standard.userId);
  if (focus !== 'competitor') await editClientUI(independent.page, client, 'Independent');
  if (focus === 'full') {
  await measurementUI(independent.page, client);
  const routine = await routineUI(independent.page, client, manifest.accounts.coach_standard.userId);
  await screenshot(independent.page, 'independent-routine-desktop');
  await deleteRoutineUI(independent.page, routine);
  }
  if (focus !== 'clients') await competitorUI(independent.page, client);
  await independent.page.goto(`${base}/clients/${client.id}`, { waitUntil: 'networkidle' });
  await independent.page.locator('.client-utilities').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await independent.page.locator('.confirm-dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await independent.page.waitForURL(url => url.pathname === '/clients');
  check(checked(await db.from('clients').select('id').eq('id', client.id), 'Read deleted UI client').length === 0, 'Confirmed independent client deletion persists');
  await independent.context.close();
  }
  if (focus === 'full' || focus === 'gym' || focus === 'portal') {
  const gymId = await fixtureGym();
  if (focus === 'full' || focus === 'gym') {
  begin('gym-permissions-and-operations');
  await gymUI(gymId);
  }
  if (focus === 'full' || focus === 'portal') {
  begin('portal-independent-rir');
  await portalUI(await portalFixture('independent', gymId));
  begin('portal-gym-rir');
  await portalUI(await portalFixture('gym', gymId));
  }
  }
  check(browserErrors.length === 0, 'No uncaught browser exceptions');
  check(escapedRequests.length === 0, 'No attempted Supabase request escaped the local backend');
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) {
    const path = `${artifacts}/failure.png`;
    await activePage.screenshot({ path, fullPage: true, timeout: 5000 }).then(() => chmod(path, 0o600)).catch(() => {});
  }
} finally {
  try { await browser?.close(); }
  catch (error) { cleanupErrors.push(`Browser shutdown: ${error.message}`); failure ||= error; }
  try {
    await cleanup();
  } catch (error) { cleanupErrors.push(`Fixture cleanup: ${error.message}`); failure ||= error; }
  try {
    if (baseline) check(JSON.stringify(await snapshotDemo()) === JSON.stringify(baseline), 'Persistent demo clients, memberships, routines, historical RIR and roles are preserved');
    check(createHash('sha256').update(await readFile(manifestPath)).digest('hex') === createHash('sha256').update(manifestBytes).digest('hex'), 'Persistent demo credentials remain unchanged');
  } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ ok: !failure, focus, phase, checks, browserErrors, escapedRequests, cleanupErrors, failure: failure?.message }, null, 2), { mode: 0o600 });
}
if (failure) throw new Error(`Local user flows failed during ${phase}: ${failure.message}.${cleanupErrors.length ? ` Cleanup/preservation: ${cleanupErrors.join('; ')}.` : ''} Private artifacts: ${artifacts}`);
console.log(`Original local user flows (${focus}): ${checks.length} checks passed${focus === 'full' || focus === 'auth' ? ` across ${Object.keys(manifest.accounts).length} roles` : ''}; ephemeral fixtures removed and persistent demos preserved. Artifacts: ${artifacts}`);
