import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
assert.equal(target.hosted, true, 'Esta prueba solo puede usar el staging alojado aislado.');

const appRoot = new URL('..', import.meta.url).pathname;
const baseUrl = 'http://127.0.0.1:4420';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const accessCode = `G${suffix.slice(0, 5).toUpperCase()}`;
const users = [];
const coachIds = [];
const gymIds = [];
const clientIds = [];
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createCoach(label) {
  const email = `stage-gym-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    `Crear Auth ${label}`).user;
  users.push(user.id);
  coachIds.push(user.id);
  checked(await admin.from('coaches').insert({
    id: user.id,
    email,
    name: `Stage ${label}`,
    role: 'coach',
    account_type: label === 'outsider' ? 'independent' : 'gym',
    coach_plan: 'standard',
    brand_color: '#CCFF00'
  }), `Crear coach ${label}`);
  return { id: user.id, email };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch { /* Angular is still starting. */ }
    await delay(500);
  }
  throw new Error(`V2 hosted staging no arrancó en ${baseUrl}.`);
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

async function assertMetric(page, label, expected) {
  const metric = page.locator('.metrics article').filter({ hasText: label });
  await metric.waitFor();
  assert.match((await metric.textContent()) || '', new RegExp(label, 'i'));
  assert.equal((await metric.locator('strong').textContent())?.trim(), String(expected));
}

async function validateRole(identity, gymId, expectedRole, permissions, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await login(page, identity.email);
  await page.goto(`${baseUrl}/gym/dashboard/${gymId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /Gimnasio RC/, level: 1 }).waitFor();
  await page.getByText(expectedRole, { exact: true }).first().waitFor();
  await assertMetric(page, 'Clientes', 2);
  await assertMetric(page, 'Rutinas', 1);
  await assertMetric(page, 'Personal', 4);
  await assertMetric(page, 'Pagos vencidos', permissions.payments ? 1 : '—');

  for (const [label, enabled] of Object.entries({
    Clientes: permissions.clients,
    Rutinas: permissions.routines,
    Pagos: permissions.payments,
    Personal: permissions.staff
  })) {
    const item = page.locator('.permission-list article').filter({ hasText: label });
    await item.getByText(enabled ? 'Habilitado' : 'Restringido', { exact: true }).waitFor();
  }
  if (permissions.staff) await page.getByText(accessCode, { exact: true }).waitFor();
  else assert.equal(await page.getByText(accessCode, { exact: true }).count(), 0);
  assert.deepEqual(pageErrors, []);
  return { context, page };
}

try {
  const owner = await createCoach('owner');
  const coowner = await createCoach('coowner');
  const trainer = await createCoach('trainer');
  const receptionist = await createCoach('receptionist');
  const outsider = await createCoach('outsider');

  const gym = checked(await admin.from('gyms').insert({
    name: `Gimnasio RC ${suffix}`,
    email: 'gym-rc@example.invalid',
    phone: '22223333',
    address: 'San José, Costa Rica',
    brand_color: '#CCFF00',
    access_code: accessCode,
    owner_id: owner.id
  }).select('id').single(), 'Crear gimnasio principal');
  gymIds.push(gym.id);
  const secondGym = checked(await admin.from('gyms').insert({
    name: `Segundo gimnasio ${suffix}`,
    access_code: `S${suffix.slice(0, 5).toUpperCase()}`,
    owner_id: owner.id
  }).select('id').single(), 'Crear segundo gimnasio');
  gymIds.push(secondGym.id);

  checked(await admin.from('gym_staff').insert([
    { gym_id: gym.id, coach_id: owner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
    { gym_id: gym.id, coach_id: coowner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
    { gym_id: gym.id, coach_id: trainer.id, role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false },
    { gym_id: gym.id, coach_id: receptionist.id, role: 'receptionist', can_edit_clients: true, can_create_routines: false, can_view_payments: true, can_manage_staff: false },
    { gym_id: secondGym.id, coach_id: owner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true }
  ]), 'Crear matriz de personal');

  const clientRows = checked(await admin.from('clients').insert([
    { primary_coach_id: owner.id, name: `Cliente gym A ${suffix}`, email: `stage-gym-client-a-${suffix}@zummith.com`, birth_date: '1991-05-20', age: 35, goal: 'Fuerza' },
    { primary_coach_id: owner.id, name: `Cliente gym B ${suffix}`, email: `stage-gym-client-b-${suffix}@zummith.com`, birth_date: '1994-08-10', age: 32, goal: 'Salud' }
  ]).select('id'), 'Crear clientes del gimnasio');
  clientIds.push(...clientRows.map(row => row.id));
  const today = new Date();
  const overdue = new Date(today.getTime() - 5 * 86_400_000).toISOString();
  const future = new Date(today.getTime() + 20 * 86_400_000).toISOString();
  const memberships = checked(await admin.from('client_gym_memberships').insert([
    { client_id: clientRows[0].id, gym_id: gym.id, assigned_coach_id: trainer.id, next_payment_due_date: overdue, subscription_status: 'overdue' },
    { client_id: clientRows[1].id, gym_id: gym.id, assigned_coach_id: trainer.id, next_payment_due_date: future, subscription_status: 'active' }
  ]).select('id'), 'Crear membresías');
  checked(await admin.from('routines').insert({
    coach_id: trainer.id,
    client_id: clientRows[0].id,
    client_gym_membership_id: memberships[0].id,
    name: 'Rutina gimnasio RC',
    objective: 'Validar dashboard',
    training_days_count: 3,
    duration_weeks: 4,
    start_date: today.toISOString().slice(0, 10)
  }), 'Crear rutina del gimnasio');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4420'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const ownerListContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const ownerListPage = await ownerListContext.newPage();
  await login(ownerListPage, owner.email);
  await ownerListPage.goto(`${baseUrl}/gyms`, { waitUntil: 'networkidle' });
  await ownerListPage.getByRole('heading', { name: 'Mis gimnasios' }).waitFor();
  assert.equal(await ownerListPage.locator('.gym-card').count(), 2);
  await ownerListPage.screenshot({ path: `${appRoot}/docs/qa/gym-list-mobile.png`, fullPage: true });
  await ownerListContext.close();

  const ownerResult = await validateRole(owner, gym.id, 'Propietario',
    { clients: true, routines: true, payments: true, staff: true }, { width: 1440, height: 1000 });
  await ownerResult.page.screenshot({ path: `${appRoot}/docs/qa/gym-dashboard-owner-desktop.png`, fullPage: true });
  await ownerResult.context.close();
  const coownerResult = await validateRole(coowner, gym.id, 'Propietario',
    { clients: true, routines: true, payments: true, staff: true }, { width: 1280, height: 900 });
  await coownerResult.context.close();
  const trainerResult = await validateRole(trainer, gym.id, 'Entrenador',
    { clients: true, routines: true, payments: false, staff: false }, { width: 390, height: 844 });
  await trainerResult.context.close();
  const receptionistResult = await validateRole(receptionist, gym.id, 'Recepción',
    { clients: true, routines: false, payments: true, staff: false }, { width: 390, height: 844 });
  await receptionistResult.context.close();

  const outsiderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const outsiderPage = await outsiderContext.newPage();
  await login(outsiderPage, outsider.email);
  await outsiderPage.goto(`${baseUrl}/gym/dashboard/${gym.id}`, { waitUntil: 'networkidle' });
  await outsiderPage.waitForURL(url => url.pathname === '/gyms' && url.searchParams.get('access') === 'gym-required');
  await outsiderPage.goto(`${baseUrl}/gym/join`, { waitUntil: 'networkidle' });
  await outsiderPage.locator('#gym-access-code').fill(accessCode.toLowerCase());
  await outsiderPage.getByRole('button', { name: 'Unirme al gimnasio' }).click();
  await outsiderPage.waitForURL(url => url.pathname === `/gym/dashboard/${gym.id}` && url.searchParams.get('joined') === '1',
    { timeout: 20_000 });
  await outsiderPage.getByText('Entrenador', { exact: true }).first().waitFor();
  await outsiderContext.close();

  console.log('Selector y contexto activo verificados con un propietario de dos gimnasios.');
  console.log('Dashboard y permisos verificados con propietario, copropietario, entrenador y recepción.');
  console.log('Guard de acceso e ingreso por código verificados con una cuenta externa.');
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill('SIGINT');
  for (const id of gymIds) await admin.from('gyms').delete().eq('id', id);
  for (const id of clientIds) await admin.from('clients').delete().eq('id', id);
  for (const id of coachIds) await admin.from('coaches').delete().eq('id', id);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}
