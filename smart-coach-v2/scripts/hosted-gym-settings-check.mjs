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
const coownerApi = createClient(target.API_URL, target.ANON_KEY, options);
const trainerApi = createClient(target.API_URL, target.ANON_KEY, options);
const outsiderApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4425';
const appRoot = new URL('..', import.meta.url).pathname;
const users = [];
const gymIds = [];
const logoPaths = [];
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createCoach(label) {
  const email = `stage-gym-settings-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  users.push(user.id);
  checked(await admin.from('coaches').insert({
    id: user.id, email, name: `Stage ${label}`, role: 'coach', account_type: 'gym', coach_plan: 'standard'
  }), `Crear coach ${label}`);
  return { id: user.id, email };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/login`)).ok) return; } catch { /* Angular is starting. */ }
    await delay(500);
  }
  throw new Error('El frontend de Configuración no arrancó.');
}

async function login(page, identity) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(identity.email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

async function openSettings(identity, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await login(page, identity);
  await page.goto(`${baseUrl}/gym/settings/${gymIds[0]}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Configuración del gimnasio' }).waitFor();
  return { context, page, pageErrors };
}

try {
  const owner = await createCoach('owner');
  const coowner = await createCoach('coowner');
  const trainer = await createCoach('trainer');
  const reception = await createCoach('reception');
  const outsider = await createCoach('outsider');
  const oldCode = `OLD${suffix.slice(0, 5).toUpperCase()}`;
  const gym = checked(await admin.from('gyms').insert({
    name: `Gym ajustes ${suffix}`, access_code: oldCode, owner_id: owner.id, brand_color: '#CCFF00'
  }).select('id').single(), 'Crear gimnasio');
  gymIds.push(gym.id);
  const otherGym = checked(await admin.from('gyms').insert({
    name: `Gym ajeno ${suffix}`, access_code: `OTH${suffix.slice(0, 5).toUpperCase()}`, owner_id: outsider.id
  }).select('id').single(), 'Crear gimnasio ajeno');
  gymIds.push(otherGym.id);
  checked(await admin.from('gym_staff').insert([
    { gym_id: gym.id, coach_id: owner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
    { gym_id: gym.id, coach_id: coowner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
    { gym_id: gym.id, coach_id: trainer.id, role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false },
    { gym_id: gym.id, coach_id: reception.id, role: 'receptionist', can_edit_clients: true, can_create_routines: false, can_view_payments: true, can_manage_staff: false }
  ]), 'Crear matriz de permisos');
  checked(await ownerApi.auth.signInWithPassword({ email: owner.email, password }), 'Login API dueño');
  checked(await coownerApi.auth.signInWithPassword({ email: coowner.email, password }), 'Login API copropietario');
  checked(await trainerApi.auth.signInWithPassword({ email: trainer.email, password }), 'Login API entrenador');
  checked(await outsiderApi.auth.signInWithPassword({ email: outsider.email, password }), 'Login API externo');

  const forbiddenUpdate = await trainerApi.rpc('update_gym_settings', {
    p_gym_id: gym.id, p_name: 'Cambio indebido', p_email: null, p_phone: null,
    p_address: null, p_logo_url: null, p_brand_color: '#CCFF00'
  });
  assert.ok(forbiddenUpdate.error, 'Un entrenador no puede cambiar la configuración por RPC.');
  const forbiddenRotation = await trainerApi.rpc('rotate_gym_access_code', { p_gym_id: gym.id });
  assert.ok(forbiddenRotation.error, 'Un entrenador no puede renovar el código por RPC.');
  const forbiddenUpload = await ownerApi.storage.from('gym-logos').upload(
    `${otherGym.id}/forbidden.png`, Buffer.from('not-an-image'), { contentType: 'image/png' }
  );
  assert.ok(forbiddenUpload.error, 'Un dueño no puede escribir logos en otro gimnasio.');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4425'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const ownerResult = await openSettings(owner, { width: 1440, height: 1000 });
  const ownerPage = ownerResult.page;
  await ownerPage.getByLabel('Nombre del gimnasio').fill(`Zummith Stage ${suffix}`);
  await ownerPage.getByLabel('Correo').fill(`gym-${suffix}@example.invalid`);
  await ownerPage.getByLabel('Teléfono').fill('+506 2222 3333');
  await ownerPage.getByLabel('Dirección').fill('San José, Costa Rica');
  await ownerPage.locator('#gym-color-text').fill('#14532D');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await ownerPage.locator('#gym-logo').setInputFiles({ name: 'logo-stage.png', mimeType: 'image/png', buffer: png });
  await ownerPage.locator('.save-state').getByRole('button', { name: 'Guardar cambios' }).click();
  await ownerPage.locator('.feedback-notice, .feedback-error').waitFor();
  if (await ownerPage.locator('.feedback-error').count()) {
    throw new Error(`El dueño no pudo guardar: ${await ownerPage.locator('.feedback-error').innerText()}`);
  }
  await ownerPage.getByText('La información del gimnasio quedó actualizada.').waitFor();

  const saved = checked(await admin.from('gyms')
    .select('name,email,phone,address,logo_url,brand_color,access_code')
    .eq('id', gym.id).single(), 'Leer configuración guardada');
  assert.equal(saved.name, `Zummith Stage ${suffix}`);
  assert.equal(saved.email, `gym-${suffix}@example.invalid`);
  assert.equal(saved.phone, '+506 2222 3333');
  assert.equal(saved.address, 'San José, Costa Rica');
  assert.equal(saved.brand_color, '#14532D');
  assert.match(saved.logo_url, new RegExp(`/gym-logos/${gym.id}/`));
  logoPaths.push(`${gym.id}/${saved.logo_url.split(`/gym-logos/${gym.id}/`)[1]}`);

  await ownerPage.getByRole('button', { name: 'Generar un código nuevo' }).click();
  await ownerPage.getByRole('alertdialog').getByRole('button', { name: 'Generar nuevo código' }).click();
  await ownerPage.getByText(/Código renovado:/).waitFor();
  const rotated = checked(await admin.from('gyms').select('access_code').eq('id', gym.id).single(), 'Leer código renovado').access_code;
  assert.notEqual(rotated, oldCode);
  assert.match(rotated, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.ok((await outsiderApi.rpc('join_gym_by_access_code', { p_access_code: oldCode })).error,
    'El código anterior debe dejar de funcionar.');
  checked(await outsiderApi.rpc('join_gym_by_access_code', { p_access_code: rotated }), 'Ingresar con código nuevo');
  await ownerPage.evaluate(() => window.scrollTo(0, 0));
  await ownerPage.screenshot({ path: `${appRoot}/docs/qa/gym-settings-owner-desktop.png`, fullPage: true });
  assert.deepEqual(ownerResult.pageErrors, []);
  await ownerResult.context.close();

  const coownerResult = await openSettings(coowner, { width: 390, height: 844 });
  await coownerResult.page.getByLabel('Teléfono').fill('+506 8777 6655');
  await coownerResult.page.locator('.save-state').getByRole('button', { name: 'Guardar cambios' }).click();
  await coownerResult.page.locator('.feedback-notice, .feedback-error').waitFor();
  if (await coownerResult.page.locator('.feedback-error').count()) {
    throw new Error(`El copropietario no pudo guardar: ${await coownerResult.page.locator('.feedback-error').innerText()}`);
  }
  await coownerResult.page.getByText('La información del gimnasio quedó actualizada.').waitFor();
  assert.equal(checked(await admin.from('gyms').select('phone').eq('id', gym.id).single(), 'Leer cambio de copropietario').phone, '+506 8777 6655');
  await coownerResult.page.evaluate(() => window.scrollTo(0, 0));
  await coownerResult.page.screenshot({ path: `${appRoot}/docs/qa/gym-settings-coowner-mobile.png`, fullPage: true });
  assert.deepEqual(coownerResult.pageErrors, []);

  await coownerResult.page.locator('.feedback-notice').getByRole('button', { name: 'Cerrar mensaje' }).click();
  await coownerResult.page.getByRole('button', { name: 'Retirar' }).click();
  await coownerResult.page.locator('.save-state').getByRole('button', { name: 'Guardar cambios' }).click();
  await coownerResult.page.getByText('La información del gimnasio quedó actualizada.').waitFor();
  assert.equal(checked(await admin.from('gyms').select('logo_url').eq('id', gym.id).single(), 'Leer retiro del logo').logo_url, null);
  const remainingLogos = checked(await admin.storage.from('gym-logos').list(gym.id), 'Comprobar limpieza del logo');
  assert.equal(remainingLogos.filter((item) => item.id).length, 0);
  logoPaths.length = 0;
  await coownerResult.context.close();

  for (const identity of [trainer, reception]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, identity);
    await page.goto(`${baseUrl}/gym/settings/${gym.id}`);
    await page.waitForURL((url) => url.pathname === `/gym/dashboard/${gym.id}` && url.searchParams.get('access') === 'permission-required');
    await context.close();
  }

  console.log('Configuración validada con dueño, copropietario, entrenador y recepción; datos, logo, código e aislamiento seguros.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (logoPaths.length) await admin.storage.from('gym-logos').remove(logoPaths);
  for (const gymId of gymIds.reverse()) await admin.from('gyms').delete().eq('id', gymId);
  for (const userId of users) {
    await admin.from('coaches').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
}
