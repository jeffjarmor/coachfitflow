import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const portalApi = createClient(target.API_URL, target.ANON_KEY, options);
const outsiderApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4428';
const appRoot = new URL('..', import.meta.url).pathname;
const userIds = [];
const gymIds = [];
let clientId;
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createAuth(label) {
  const email = `stage-portal-measurements-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  userIds.push(user.id);
  return { id: user.id, email };
}

async function createCoach(label, accountType) {
  const identity = await createAuth(label);
  checked(await admin.from('coaches').insert({
    id: identity.id,
    email: identity.email,
    name: `Coach ${label} ${suffix}`,
    role: 'coach',
    account_type: accountType,
    coach_plan: accountType === 'independent' ? 'paid' : 'standard',
    next_plan_payment_date: accountType === 'independent' ? '2027-12-31' : null
  }), `Crear coach ${label}`);
  return identity;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/login`)).ok) return; } catch { /* Angular está iniciando. */ }
    await delay(500);
  }
  throw new Error('El frontend del Portal no arrancó.');
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('**/client/portal', { timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

try {
  const independentCoach = await createCoach('independent', 'independent');
  const gymOwner = await createCoach('gym-owner', 'gym');
  const otherGymOwner = await createCoach('other-gym-owner', 'gym');
  const portalUser = await createAuth('client');
  const outsider = await createAuth('outsider');

  const gym = checked(await admin.from('gyms').insert({
    name: `Gym progreso ${suffix}`,
    access_code: `PG${suffix.toUpperCase()}`,
    owner_id: gymOwner.id
  }).select('id').single(), 'Crear gimnasio autorizado');
  gymIds.push(gym.id);
  const otherGym = checked(await admin.from('gyms').insert({
    name: `Gym privado ${suffix}`,
    access_code: `PV${suffix.toUpperCase()}`,
    owner_id: otherGymOwner.id
  }).select('id').single(), 'Crear gimnasio no autorizado');
  gymIds.push(otherGym.id);
  const plan = checked(await admin.from('membership_plans').insert({
    gym_id: gym.id, name: 'Plan mensual', price: 25000, currency: 'CRC',
    description: 'Acceso mensual al gimnasio', active: true
  }).select('id').single(), 'Crear plan autorizado');

  const client = checked(await admin.from('clients').insert({
    user_id: portalUser.id,
    primary_coach_id: independentCoach.id,
    name: 'Valeria Progreso',
    email: portalUser.email,
    age: 30,
    goal: 'Mejorar composición corporal',
    portal_status: 'active'
  }).select('id').single(), 'Crear cliente compartido');
  clientId = client.id;
  checked(await admin.from('independent_client_portal_access').insert({
    user_id: portalUser.id,
    client_id: clientId,
    coach_id: independentCoach.id
  }), 'Crear acceso independiente');

  const membership = checked(await admin.from('client_gym_memberships').insert({
    client_id: clientId,
    gym_id: gym.id,
    assigned_coach_id: gymOwner.id,
    membership_plan_id: plan.id,
    next_payment_due_date: '2026-10-15T12:00:00Z',
    subscription_status: 'active',
    portal_status: 'active'
  }).select('id').single(), 'Crear membresía autorizada');
  const privateMembership = checked(await admin.from('client_gym_memberships').insert({
    client_id: clientId,
    gym_id: otherGym.id,
    assigned_coach_id: otherGymOwner.id,
    subscription_status: 'active',
    portal_status: 'active'
  }).select('id').single(), 'Crear membresía no autorizada');
  checked(await admin.from('client_portal_access').insert({
    user_id: portalUser.id,
    client_gym_membership_id: membership.id
  }), 'Crear acceso al gimnasio autorizado');

  checked(await admin.from('measurements').insert([
    {
      client_id: clientId, client_gym_membership_id: null, date: '2026-07-01',
      weight: 74.5, height: 168, bmi: 26.4, body_fat_percentage: 28.1,
      muscle_mass: 45.2, notes: 'Control independiente'
    },
    {
      client_id: clientId, client_gym_membership_id: membership.id, date: '2026-08-01',
      weight: 73.2, height: 168, bmi: 25.93, body_fat_percentage: 27.4,
      muscle_mass: 45.8, waist: 78, hips: 101, notes: 'Inicio en gimnasio'
    },
    {
      client_id: clientId, client_gym_membership_id: membership.id, date: '2026-09-15',
      weight: 72, height: 168, bmi: 25.51, body_fat_percentage: 26.1,
      muscle_mass: 46.7, visceral_fat: 7, metabolic_age: 29, calories: 1580,
      bone_mass: 2.6, water_percentage: 52.4, waist: 75.5, hips: 99,
      chest: 91, arms: 29, legs: 56, calf: 35, thigh: 54,
      notes: 'Mejor control del trimestre'
    },
    {
      client_id: clientId, client_gym_membership_id: privateMembership.id, date: '2026-09-20',
      weight: 99, height: 168, bmi: 35.08, body_fat_percentage: 40,
      muscle_mass: 30, notes: 'DATO PRIVADO DE OTRO GIMNASIO'
    }
  ]), 'Crear historial de mediciones');
  checked(await admin.from('payments').insert([
    { client_gym_membership_id: membership.id, amount: 25000, currency: 'CRC', method: 'sinpe', due_date: '2026-09-15T12:00:00Z', paid_date: '2026-09-14T12:00:00Z', status: 'paid', created_by: gymOwner.id },
    { client_gym_membership_id: membership.id, amount: 25000, currency: 'CRC', method: 'card', due_date: '2026-08-15T12:00:00Z', paid_date: '2026-08-15T12:00:00Z', status: 'paid', created_by: gymOwner.id },
    { client_gym_membership_id: privateMembership.id, amount: 99999, currency: 'CRC', method: 'cash', due_date: '2026-09-20T12:00:00Z', paid_date: '2026-09-20T12:00:00Z', status: 'paid', created_by: otherGymOwner.id }
  ]), 'Crear historial de pagos');

  checked(await portalApi.auth.signInWithPassword({ email: portalUser.email, password }), 'Login API Portal');
  checked(await outsiderApi.auth.signInWithPassword({ email: outsider.email, password }), 'Login API externo');

  const visibleRows = checked(await portalApi.from('measurements').select('id,client_gym_membership_id,notes')
    .eq('client_id', clientId), 'Leer mediciones autorizadas');
  assert.equal(visibleRows.length, 3, 'El Portal debe ver solo los contextos concedidos.');
  assert.equal(visibleRows.some(row => row.client_gym_membership_id === privateMembership.id), false,
    'Una membresía no concedida no puede filtrarse desde la API.');
  const privateRows = checked(await portalApi.from('measurements').select('id')
    .eq('client_gym_membership_id', privateMembership.id), 'Consultar membresía no concedida');
  assert.equal(privateRows.length, 0);
  const outsiderRows = checked(await outsiderApi.from('measurements').select('id').eq('client_id', clientId), 'Consulta externa');
  assert.equal(outsiderRows.length, 0, 'Otra identidad no puede leer el historial.');
  const visiblePayments = checked(await portalApi.from('payments').select('id,client_gym_membership_id'), 'Leer pagos autorizados');
  assert.equal(visiblePayments.length, 2);
  assert.equal(visiblePayments.some(row => row.client_gym_membership_id === privateMembership.id), false,
    'El Portal no puede leer pagos de otra membresía.');
  const directProtectedUpdate = await portalApi.from('clients').update({ goal: 'CAMBIO NO AUTORIZADO' })
    .eq('id', clientId).select('id');
  assert.ok(directProtectedUpdate.error || !directProtectedUpdate.data?.length,
    'El Portal no puede modificar columnas de clients directamente.');
  assert.ok((await outsiderApi.rpc('update_client_portal_profile', {
    p_client_id: clientId, p_membership_id: membership.id, p_name: 'Intruso', p_phone: '',
    p_birth_date: null, p_address: '', p_notes: ''
  })).error, 'Otra identidad no puede actualizar el perfil.');
  assert.ok((await portalApi.rpc('update_client_portal_profile', {
    p_client_id: clientId, p_membership_id: privateMembership.id, p_name: 'Perfil privado', p_phone: '',
    p_birth_date: null, p_address: '', p_notes: ''
  })).error, 'El Portal no puede usar una membresía no concedida para actualizar el perfil.');

  const configuration = target.hosted ? 'hosted-staging' : 'local-staging';
  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', configuration, '--host', '127.0.0.1', '--port', '4428'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844 }]
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await login(page, portalUser.email);
    await page.getByRole('link', { name: /Ver evolución/ }).click();
    await page.waitForURL('**/client/measurements');
    await page.getByRole('heading', { name: 'Mis mediciones' }).waitFor();
    await page.getByRole('heading', { name: '15 de septiembre de 2026' }).waitFor();
    await page.getByText('72 kg', { exact: true }).first().waitFor();
    await page.getByText('↓ 1,2 kg desde el anterior', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Grasa' }).click();
    await page.getByText('26,1 %', { exact: true }).first().waitFor();
    await page.getByText('DATO PRIVADO DE OTRO GIMNASIO').waitFor({ state: 'detached' });
    await page.getByText('Ver todos los indicadores').first().click();
    await page.getByText(/1[.\s]?580 kcal/, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: horizontal overflow`);
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `${appRoot}/docs/qa/client-measurements-${name}.png`, fullPage: true });
    await page.goto(`${baseUrl}/client/portal`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /Ver estado/ }).click();
    await page.waitForURL('**/client/payments');
    await page.getByRole('heading', { name: 'Mis pagos' }).waitFor();
    await page.getByText('Al día', { exact: true }).waitFor();
    await page.getByText('15 de octubre de 2026').waitFor();
    await page.getByText('₡25 000', { exact: true }).first().waitFor();
    assert.equal(await page.getByText(/99.?999/).count(), 0, 'La UI no mezcla pagos de otra membresía.');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: payments horizontal overflow`);
    await page.screenshot({ path: `${appRoot}/docs/qa/client-payments-${name}.png`, fullPage: true });
    await page.goto(`${baseUrl}/client/portal`, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: /Ver información/ }).click();
    await page.waitForURL('**/client/profile');
    await page.getByRole('heading', { name: 'Mi perfil' }).waitFor();
    await page.getByLabel('Nombre completo').waitFor();
    assert.equal(await page.getByLabel('Nombre completo').inputValue(), 'Valeria Progreso');
    if (name === 'mobile') {
      await page.getByLabel('Nombre completo').fill('Valeria Perfil');
      await page.getByLabel('Teléfono').fill('+506 8888 1111');
      await page.getByLabel('Fecha de nacimiento').fill('1996-04-12');
      assert.equal(await page.getByLabel('Dirección',{exact:true}).count(),0);
      await page.getByLabel('Objetivos o notas personales').fill('Mejorar fuerza y movilidad.');
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await page.getByText('Tus datos personales se guardaron correctamente.').waitFor();
      await page.getByRole('heading', { name: 'Valeria Perfil' }).waitFor();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: profile horizontal overflow`);
    await page.screenshot({ path: `${appRoot}/docs/qa/client-profile-${name}.png`, fullPage: true });
    await context.close();
  }

  const switchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const switchPage = await switchContext.newPage();
  await login(switchPage, portalUser.email);
  await switchPage.getByRole('combobox',{name:'Entrenador o gimnasio'}).click();
  await switchPage.getByRole('option',{name:new RegExp(`Coach independent ${suffix}`)}).click();
  await switchPage.getByText('74,5 kg', { exact: true }).waitFor();
  await switchPage.getByRole('link', { name: /Ver evolución/ }).click();
  await switchPage.getByRole('heading', { name: '1 de julio de 2026' }).waitFor();
  await switchPage.getByText('74,5 kg', { exact: true }).first().waitFor();
  assert.equal(await switchPage.getByText('Mejor control del trimestre').count(), 0,
    'El perfil independiente no debe mezclar mediciones del gimnasio.');
  await switchPage.goto(`${baseUrl}/client/payments`, { waitUntil: 'networkidle' });
  await switchPage.getByRole('heading', { name: 'Este perfil no tiene pagos de gimnasio' }).waitFor();
  await switchContext.close();

  const updatedProfile = checked(await admin.from('clients')
    .select('name,email,phone,birth_date,address,notes,goal,user_id,primary_coach_id')
    .eq('id', clientId).single(), 'Comprobar perfil actualizado');
  assert.equal(updatedProfile.name, 'Valeria Perfil');
  assert.equal(updatedProfile.phone, '+506 8888 1111');
  assert.equal(updatedProfile.birth_date, '1996-04-12');
  assert.equal(updatedProfile.address, null, 'El portal conserva la dirección administrada.');
  assert.equal(updatedProfile.notes, 'Mejorar fuerza y movilidad.');
  assert.equal(updatedProfile.goal, 'Mejorar composición corporal');
  assert.equal(updatedProfile.email, portalUser.email);
  assert.equal(updatedProfile.user_id, portalUser.id);
  assert.equal(updatedProfile.primary_coach_id, independentCoach.id);

  console.log('Portal: mediciones, pagos, perfil, responsive y aislamiento por contexto verificados.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (clientId) checked(await admin.from('clients').delete().eq('id', clientId), 'Limpiar cliente');
  for (const gymId of gymIds) checked(await admin.from('gyms').delete().eq('id', gymId), 'Limpiar gimnasio');
  for (const userId of userIds) {
    await admin.from('coaches').delete().eq('id', userId);
    checked(await admin.auth.admin.deleteUser(userId), 'Limpiar Auth');
  }
}
