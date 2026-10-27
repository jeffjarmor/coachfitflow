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
const ownerApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const ownerEmail = `stage-gym-ui-owner-${suffix}@example.invalid`;
const clientEmail = `stage-gym-ui-client-${suffix}@example.invalid`;
const clientName = 'Atleta Interfaz Stage';
const routineName = `Rutina interfaz ${suffix}`;
const baseUrl = 'http://127.0.0.1:4423';
const appRoot = new URL('..', import.meta.url).pathname;
let ownerId;
let invitedUserId;
let gymId;
let clientId;
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch { /* Angular is starting. */ }
    await delay(500);
  }
  throw new Error('El frontend contextual de gimnasio no arrancó.');
}

async function login(page) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(ownerEmail);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

try {
  const owner = checked(await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true }), 'Crear Auth propietario').user;
  ownerId = owner.id;
  checked(await admin.from('coaches').insert({
    id: ownerId, email: ownerEmail, name: 'Stage UI owner', role: 'coach', account_type: 'gym', coach_plan: 'standard'
  }), 'Crear propietario');
  const gym = checked(await admin.from('gyms').insert({
    name: `Gym interfaz ${suffix}`, access_code: `UI${suffix.slice(0, 6).toUpperCase()}`, owner_id: ownerId
  }).select('id').single(), 'Crear gimnasio');
  gymId = gym.id;

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4423'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 950 } });
  const page = await context.newPage();
  const pageErrors = [];
  const apiFailures = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', async (response) => {
    if (!response.ok() && response.url().startsWith(target.API_URL)) {
      apiFailures.push(`${response.status()} ${response.url()} ${(await response.text()).slice(0, 500)}`);
    }
  });
  await login(page);

  await page.goto(`${baseUrl}/gym/${gymId}/clients/new`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Agregar cliente' }).waitFor();
  await page.locator('#client-name').fill(clientName);
  await page.locator('#client-email').fill(clientEmail);
  await page.locator('#client-phone').fill('88887777');
  await page.locator('#client-birth').fill('1994-06-15');
  await page.locator('#client-address').fill('San José, Costa Rica');
  await page.locator('#client-height').fill('176');
  await page.locator('#client-weight').fill('78');
  await page.locator('#client-goal').fill('Validar operación contextual');
  await page.locator('#client-notes').fill('Creado desde la UI alojada.');
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  try {
    await page.waitForURL((url) => url.pathname.startsWith(`/gym/${gymId}/clients/`) && !url.pathname.endsWith('/new'), { timeout: 30_000 });
  } catch (error) {
    await page.screenshot({ path: `${appRoot}/docs/qa/gym-client-create-failure.png`, fullPage: true });
    throw new Error(`La alta UI no navegó. API: ${apiFailures.join(' | ')}. Estado visible: ${(await page.locator('body').innerText()).slice(0, 1200)}`, { cause: error });
  }
  clientId = page.url().split('/').at(-1).split('?')[0];
  await page.getByRole('heading', { name: clientName, level: 1 }).waitFor();
  await page.screenshot({ path: `${appRoot}/docs/qa/gym-client-created-ui-desktop.png`, fullPage: true });

  const membership = checked(await admin.from('client_gym_memberships')
    .select('id,portal_status,portal_invited_at').eq('gym_id', gymId).eq('client_id', clientId).single(), 'Leer membresía creada desde UI');
  assert.ok(membership.id);
  assert.ok(membership.portal_invited_at, 'La alta debe preparar la invitación al Portal.');
  const createdClient = checked(await admin.from('clients').select('primary_coach_id').eq('id', clientId).single(), 'Leer cliente creado');
  assert.equal(createdClient.primary_coach_id, null);
  const portalAccess = checked(await admin.from('client_portal_access')
    .select('user_id').eq('client_gym_membership_id', membership.id).single(), 'Leer acceso Portal creado');
  invitedUserId = portalAccess.user_id;
  assert.ok(invitedUserId, 'La invitación debe enlazar una identidad Auth.');

  await page.goto(`${baseUrl}/gym/${gymId}/routines/new?clientId=${clientId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Construye un plan listo para entrenar.' }).waitFor();
  await page.locator('.client-options label.selected').filter({ hasText: clientName }).waitFor();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('#routine-name').fill(routineName);
  await page.locator('#routine-objective').fill('Fuerza general y adherencia');
  await page.locator('#routine-days').selectOption('1');
  await page.locator('#routine-weeks').fill('4');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.day-setup').getByRole('button', { name: 'Full Body', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  const firstExercise = page.locator('.catalog-list article').first();
  const exerciseName = (await firstExercise.locator('strong').textContent())?.trim();
  assert.ok(exerciseName);
  await firstExercise.getByRole('button', { name: 'Agregar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('heading', { name: 'Rutina lista para guardar' }).waitFor();
  await page.getByRole('button', { name: 'Guardar rutina' }).click();
  await page.waitForURL((url) => new RegExp(`^/gym/${gymId}/routines/[0-9a-f-]+$`).test(url.pathname), { timeout: 30_000 });
  const routineId = new URL(page.url()).pathname.split('/').at(-1);
  await page.getByRole('heading', { name: routineName, level: 1 }).waitFor();
  await page.getByText(exerciseName, { exact: true }).waitFor();
  await page.screenshot({ path: `${appRoot}/docs/qa/gym-routine-created-ui-desktop.png`, fullPage: true });

  const routine = checked(await admin.from('routines')
    .select('client_id,client_gym_membership_id').eq('id', routineId).single(), 'Leer rutina creada desde UI');
  assert.equal(routine.client_id, clientId);
  assert.equal(routine.client_gym_membership_id, membership.id);
  const independentLeak = await admin.from('routines')
    .select('id', { count: 'exact', head: true }).eq('id', routineId).is('client_gym_membership_id', null);
  if (independentLeak.error) throw independentLeak.error;
  assert.equal(independentLeak.count, 0);
  assert.deepEqual(pageErrors, []);
  await context.close();

  checked(await ownerApi.auth.signInWithPassword({ email: ownerEmail, password }), 'Login API propietario');
  checked(await ownerApi.rpc('remove_gym_client', { p_gym_id: gymId, p_client_id: clientId }), 'Retirar cliente UI');
  clientId = undefined;
  console.log('Alta con invitación y rutina contextual creadas desde la UI; membresía y aislamiento verificados.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (clientId) await admin.from('clients').delete().eq('id', clientId);
  if (gymId) await admin.from('gyms').delete().eq('id', gymId);
  if (invitedUserId) await admin.auth.admin.deleteUser(invitedUserId);
  if (ownerId) {
    await admin.from('coaches').delete().eq('id', ownerId);
    await admin.auth.admin.deleteUser(ownerId);
  }
}
