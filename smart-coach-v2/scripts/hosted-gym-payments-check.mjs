import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
assert.equal(target.hosted, true, 'Esta prueba solo puede usar el staging alojado aislado.');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4422';
const appRoot = new URL('..', import.meta.url).pathname;
const userIds = [];
const clientIds = [];
let gymId;
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createCoach(label) {
  const email = `stage-gym-payments-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  userIds.push(user.id);
  checked(await admin.from('coaches').insert({
    id: user.id, email, name: `Stage pagos ${label}`, role: 'coach', account_type: 'gym', coach_plan: 'standard'
  }), `Crear coach ${label}`);
  return { id: user.id, email };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch { /* Angular is starting. */ }
    await delay(500);
  }
  throw new Error('El frontend de pagos no arrancó.');
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

async function paymentPage(identity, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await login(page, identity.email);
  await page.goto(`${baseUrl}/gym/payments/${gymId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Cobros y membresías' }).waitFor();
  return { context, page, pageErrors };
}

try {
  const owner = await createCoach('owner');
  const reception = await createCoach('reception');
  const trainer = await createCoach('trainer');
  const gym = checked(await admin.from('gyms').insert({
    name: `Gym pagos ${suffix}`, access_code: `PAY${suffix.slice(0, 5).toUpperCase()}`, owner_id: owner.id
  }).select('id').single(), 'Crear gimnasio');
  gymId = gym.id;
  checked(await admin.from('gym_staff').insert([
    { gym_id: gymId, coach_id: reception.id, role: 'receptionist', can_edit_clients: false, can_create_routines: false, can_view_payments: true, can_manage_staff: false },
    { gym_id: gymId, coach_id: trainer.id, role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false }
  ]), 'Crear permisos de pagos');

  const clients = checked(await admin.from('clients').insert([
    { primary_coach_id: null, name: `Cobro vencido ${suffix}`, email: `stage-overdue-${suffix}@example.invalid`, birth_date: '1991-05-20', age: 35, weight: 72, height: 170, goal: 'Salud' },
    { primary_coach_id: null, name: `Cobro recepción ${suffix}`, email: `stage-reception-${suffix}@example.invalid`, birth_date: '1994-08-10', age: 32, weight: 68, height: 168, goal: 'Fuerza' }
  ]).select('id,name'), 'Crear clientes de cobro');
  clientIds.push(...clients.map((client) => client.id));
  const pastDue = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const futureDue = new Date(Date.now() + 18 * 86_400_000).toISOString();
  const memberships = checked(await admin.from('client_gym_memberships').insert([
    { gym_id: gymId, client_id: clients[0].id, assigned_coach_id: trainer.id, next_payment_due_date: pastDue, subscription_status: 'overdue' },
    { gym_id: gymId, client_id: clients[1].id, assigned_coach_id: trainer.id, next_payment_due_date: futureDue, subscription_status: 'active' }
  ]).select('id,client_id'), 'Crear membresías de cobro');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4422'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const ownerResult = await paymentPage(owner, { width: 1440, height: 1000 });
  const ownerPage = ownerResult.page;
  await ownerPage.locator('.metrics article').filter({ hasText: 'Vencidos' }).getByText('1', { exact: true }).waitFor();
  await ownerPage.getByRole('button', { name: 'Crear plan' }).click();
  await ownerPage.locator('#plan-name').fill(`Mensual ${suffix}`);
  await ownerPage.locator('#plan-price').fill('27500');
  await ownerPage.locator('#plan-description').fill('Plan mensual de prueba');
  await ownerPage.getByRole('button', { name: 'Guardar plan' }).click();
  await ownerPage.getByText('El plan quedó disponible para asignarlo.').waitFor();
  const plan = checked(await admin.from('membership_plans').select('id').eq('gym_id', gymId).single(), 'Leer plan creado');

  const overdueRow = ownerPage.locator('.billing-row').filter({ hasText: clients[0].name });
  await overdueRow.getByRole('button', { name: 'Configurar' }).click();
  await ownerPage.locator('#membership-plan').selectOption(plan.id);
  await ownerPage.locator('#membership-status').selectOption('overdue');
  await ownerPage.getByRole('button', { name: 'Guardar cambios' }).click();
  await ownerPage.getByText(new RegExp(`Membresía de ${clients[0].name} actualizada`)).waitFor();

  await ownerPage.locator('.billing-row').filter({ hasText: clients[0].name }).getByRole('button', { name: 'Registrar pago' }).click();
  assert.equal(await ownerPage.locator('#payment-amount').inputValue(), '27500');
  await ownerPage.locator('#payment-method').selectOption('sinpe');
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click();
  await ownerPage.getByText(new RegExp(`Pago de ${clients[0].name} registrado`)).waitFor();
  await ownerPage.locator('.billing-row').filter({ hasText: clients[0].name }).getByText('Al día', { exact: true }).waitFor();
  await ownerPage.getByRole('heading', { name: 'Últimos pagos' }).scrollIntoViewIfNeeded();
  await ownerPage.locator('.payment-history article').filter({ hasText: clients[0].name }).waitFor();
  await ownerPage.screenshot({ path: `${appRoot}/docs/qa/gym-payments-owner-desktop.png`, fullPage: true });
  assert.deepEqual(ownerResult.pageErrors, []);
  await ownerResult.context.close();

  const receptionResult = await paymentPage(reception, { width: 390, height: 844 });
  const receptionPage = receptionResult.page;
  assert.equal(await receptionPage.getByRole('button', { name: 'Crear plan' }).count(), 0);
  assert.equal(await receptionPage.getByRole('button', { name: 'Configurar' }).count(), 0);
  const receptionRow = receptionPage.locator('.billing-row').filter({ hasText: clients[1].name });
  await receptionRow.getByRole('button', { name: 'Registrar pago' }).click();
  await receptionPage.locator('#payment-amount').fill('18000');
  await receptionPage.locator('#payment-method').selectOption('cash');
  await receptionPage.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click();
  await receptionPage.getByText(new RegExp(`Pago de ${clients[1].name} registrado`)).waitFor();
  await receptionPage.screenshot({ path: `${appRoot}/docs/qa/gym-payments-reception-mobile.png`, fullPage: true });
  assert.deepEqual(receptionResult.pageErrors, []);
  await receptionResult.context.close();

  const trainerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const trainerPage = await trainerContext.newPage();
  await login(trainerPage, trainer.email);
  await trainerPage.goto(`${baseUrl}/gym/payments/${gymId}`);
  await trainerPage.waitForURL((url) => url.pathname === `/gym/${gymId}/clients` && url.searchParams.get('access') === 'permission-required');
  await trainerContext.close();

  const paymentRows = checked(await admin.from('payments').select('client_gym_membership_id,amount,status,created_by').in('client_gym_membership_id', memberships.map((membership) => membership.id)), 'Leer pagos');
  assert.equal(paymentRows.length, 2);
  assert.deepEqual(paymentRows.map((row) => Number(row.amount)).sort((a, b) => a - b), [18000, 27500]);
  assert.ok(paymentRows.every((row) => row.status === 'paid'));
  const updatedMemberships = checked(await admin.from('client_gym_memberships').select('id,subscription_status,next_payment_due_date').in('id', memberships.map((membership) => membership.id)), 'Leer vencimientos actualizados');
  assert.ok(updatedMemberships.every((membership) => membership.subscription_status === 'active'));
  assert.ok(updatedMemberships.every((membership) => new Date(membership.next_payment_due_date).getTime() > Date.now()));

  console.log('Pagos de propietario y recepción registrados atómicamente; planes, vencimientos y guard de entrenador verificados.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (gymId) checked(await admin.from('gyms').delete().eq('id', gymId), 'Limpiar gimnasio');
  for (const clientId of clientIds) checked(await admin.from('clients').delete().eq('id', clientId), 'Limpiar cliente');
  for (const userId of userIds) {
    checked(await admin.from('coaches').delete().eq('id', userId), 'Limpiar coach');
    checked(await admin.auth.admin.deleteUser(userId), 'Limpiar Auth');
  }
}
