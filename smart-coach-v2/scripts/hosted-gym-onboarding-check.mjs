import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const anonymousApi = createClient(target.API_URL, target.ANON_KEY, options);
const apiOwner = createClient(target.API_URL, target.ANON_KEY, options);
const joinerApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4426';
const appRoot = new URL('..', import.meta.url).pathname;
const users = [];
const gymIds = [];
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createCoach(label) {
  const email = `stage-gym-onboarding-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  users.push(user.id);
  checked(await admin.from('coaches').insert({
    id: user.id,
    email,
    name: `Stage onboarding ${label}`,
    phone: '+506 8000 0000',
    role: label === 'joiner' ? 'coach' : 'admin',
    account_type: 'independent',
    coach_plan: 'standard',
    brand_color: '#CCFF00'
  }), `Crear coach ${label}`);
  return { id: user.id, email };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/login`)).ok) return; } catch { /* Angular está iniciando. */ }
    await delay(500);
  }
  throw new Error('El frontend de onboarding no arrancó.');
}

async function login(page, identity) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(identity.email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

async function createGymThroughUi(identity, viewport, label) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await login(page, identity);
  await page.goto(`${baseUrl}/gyms`, { waitUntil: 'networkidle' });
  await page.getByRole('link', { name: /Crear gimnasio|Crear mi gimnasio/ }).first().click();
  await page.waitForURL('**/gym/onboarding');
  await page.getByRole('heading', { name: 'Datos del gimnasio' }).waitFor();

  const gymName = `Zummith onboarding ${label} ${suffix}`;
  await page.getByLabel('Nombre del gimnasio').fill(gymName);
  await page.getByLabel('Correo de contacto Opcional').fill(`${label}-${suffix}@example.invalid`);
  await page.getByLabel('Teléfono Opcional').fill('+506 2222 4444');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('heading', { name: 'Revisa antes de crear' }).waitFor();
  await page.getByLabel('Dirección Opcional').fill('San José, Costa Rica');
  await page.locator('#onboarding-color-text').fill('#14532D');

  const draft = await page.evaluate((userId) => {
    const raw = sessionStorage.getItem(`zummith:gym-onboarding:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }, identity.id);
  assert.match(draft?.requestId || '', /^[0-9a-f-]{36}$/i, 'El borrador conserva una llave idempotente.');
  assert.equal(draft?.step, 2, 'El borrador conserva el paso actual.');
  assert.equal(draft?.value?.name, gymName, 'El borrador conserva los datos escritos.');
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(hasHorizontalOverflow, false, `El onboarding ${label} no debe desbordarse horizontalmente.`);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: `${appRoot}/docs/qa/gym-onboarding-${label}.png` });
  await page.getByRole('button', { name: 'Crear gimnasio' }).click();
  await page.waitForURL((url) => /^\/gym\/dashboard\/[0-9a-f-]+$/.test(url.pathname) && url.searchParams.get('created') === '1', {
    timeout: 20_000
  });
  await page.getByText('Tu gimnasio quedó creado. Ya puedes agregar clientes e invitar a tu equipo.').waitFor();
  const gymId = page.url().match(/\/gym\/dashboard\/([0-9a-f-]+)/)?.[1];
  assert.ok(gymId, 'El dashboard incluye el gimnasio creado.');
  gymIds.push(gymId);

  const savedDraft = await page.evaluate((userId) => sessionStorage.getItem(`zummith:gym-onboarding:${userId}`), identity.id);
  assert.equal(savedDraft, null, 'El borrador se elimina después de completar el flujo.');
  assert.deepEqual(pageErrors, [], 'El onboarding no produjo errores de página.');
  await context.close();
  return { gymId, gymName };
}

async function assertCreatedGym(identity, result) {
  const gym = checked(await admin.from('gyms')
    .select('id,name,email,phone,address,brand_color,access_code,owner_id,creation_request_id')
    .eq('id', result.gymId).single(), 'Leer gimnasio creado por UI');
  assert.equal(gym.name, result.gymName);
  assert.equal(gym.owner_id, null);
  assert.equal(gym.address, 'San José, Costa Rica');
  assert.equal(gym.brand_color, '#14532D');
  assert.match(gym.access_code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.match(gym.creation_request_id, /^[0-9a-f-]{36}$/i);

  const membership = checked(await admin.from('gym_staff')
    .select('role,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff')
    .eq('gym_id', result.gymId).eq('coach_id', identity.id).maybeSingle(), 'Leer membresía inicial');
  assert.equal(membership,null,'Crear un gimnasio no asigna propietario automáticamente.');
  const profile = checked(await admin.from('coaches').select('account_type').eq('id', identity.id).single(), 'Leer tipo de cuenta');
  assert.equal(profile.account_type, 'independent');
  return gym;
}

try {
  const directOwner = await createCoach('rpc-owner');
  const desktopOwner = await createCoach('desktop-owner');
  const mobileOwner = await createCoach('mobile-owner');
  const joiner = await createCoach('joiner');

  const anonymousAttempt = await anonymousApi.rpc('create_owned_gym', {
    p_request_id: randomUUID(), p_name: 'Sin sesión'
  });
  assert.ok(anonymousAttempt.error, 'Una sesión anónima no puede crear gimnasios.');

  checked(await apiOwner.auth.signInWithPassword({ email: directOwner.email, password }), 'Login API dueño');
  const invalidAttempt = await apiOwner.rpc('create_owned_gym', {
    p_request_id: randomUUID(), p_name: `Inválido ${suffix}`, p_email: 'correo-invalido'
  });
  assert.ok(invalidAttempt.error, 'El RPC rechaza información inválida.');
  const invalidResidue = checked(await admin.from('gyms').select('id').eq('owner_id', directOwner.id), 'Buscar residuos inválidos');
  assert.equal(invalidResidue.length, 0, 'Una validación fallida no deja gimnasios parciales.');

  const requestId = randomUUID();
  const parameters = {
    p_request_id: requestId,
    p_name: `Zummith idempotente ${suffix}`,
    p_email: `rpc-${suffix}@example.invalid`,
    p_phone: '+506 2111 1111',
    p_address: 'Heredia, Costa Rica',
    p_brand_color: '#2563EB'
  };
  const first = checked(await apiOwner.rpc('create_owned_gym', parameters), 'Crear gimnasio por RPC')[0];
  const repeated = checked(await apiOwner.rpc('create_owned_gym', parameters), 'Repetir creación por RPC')[0];
  assert.equal(repeated.gym_id, first.gym_id, 'Repetir la misma solicitud devuelve el gimnasio original.');
  assert.equal(repeated.gym_access_code, first.gym_access_code, 'Repetir la misma solicitud conserva el código.');
  gymIds.push(first.gym_id);
  const idempotentRows = checked(await admin.from('gyms').select('id').eq('creation_request_id', requestId), 'Contar solicitud idempotente');
  assert.equal(idempotentRows.length, 1, 'La repetición no duplica gimnasios.');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', target.hosted ? 'hosted-staging' : 'local-staging', '--host', '127.0.0.1', '--port', '4426'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const desktopResult = await createGymThroughUi(desktopOwner, { width: 1440, height: 1000 }, 'desktop');
  const desktopGym = await assertCreatedGym(desktopOwner, desktopResult);
  const mobileResult = await createGymThroughUi(mobileOwner, { width: 390, height: 844 }, 'mobile');
  await assertCreatedGym(mobileOwner, mobileResult);

  checked(await joinerApi.auth.signInWithPassword({ email: joiner.email, password }), 'Login API integrante');
  checked(await joinerApi.rpc('join_gym_by_access_code', { p_access_code: desktopGym.access_code }), 'Usar primer código generado');
  const joined = checked(await admin.from('gym_staff')
    .select('role').eq('gym_id', desktopResult.gymId).eq('coach_id', joiner.id).single(), 'Confirmar ingreso por código');
  assert.equal(joined.role, 'trainer');

  console.log('Onboarding validado: creación atómica e idempotente, creación exclusiva del administrador sin propietario automático, código utilizable, dashboard y UI responsive.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  for (const gymId of [...new Set(gymIds)].reverse()) await admin.from('gyms').delete().eq('id', gymId);
  for (const userId of users) {
    await admin.from('coaches').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
  const gymResidue = checked(await admin.from('gyms').select('id').ilike('name', `%${suffix}%`), 'Verificar residuos de gimnasios');
  assert.equal(gymResidue.length, 0, 'La prueba no debe dejar gimnasios sintéticos.');
}
