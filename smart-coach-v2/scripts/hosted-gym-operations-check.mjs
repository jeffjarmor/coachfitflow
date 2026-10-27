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
const receptionApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4421';
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

async function createCoach(label) {
  const email = `stage-gym-ops-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  userIds.push(user.id);
  checked(await admin.from('coaches').insert({
    id: user.id, email, name: `Stage ${label}`, role: 'coach', account_type: 'gym', coach_plan: 'standard'
  }), `Crear coach ${label}`);
  return { id: user.id, email };
}

async function login(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch { /* Angular is starting. */ }
    await delay(500);
  }
  throw new Error('El frontend de staging no arrancó.');
}

try {
  const owner = await createCoach('owner');
  const reception = await createCoach('reception');
  const gym = checked(await admin.from('gyms').insert({
    name: `Gym operaciones ${suffix}`, access_code: `OPS${suffix.slice(0, 5).toUpperCase()}`, owner_id: owner.id
  }).select('id').single(), 'Crear gimnasio operativo');
  gymIds.push(gym.id);
  const otherGym = checked(await admin.from('gyms').insert({
    name: `Gym aislado ${suffix}`, access_code: `ISO${suffix.slice(0, 5).toUpperCase()}`, owner_id: owner.id
  }).select('id').single(), 'Crear gimnasio aislado');
  gymIds.push(otherGym.id);
  checked(await admin.from('gym_staff').insert({
    gym_id: gym.id, coach_id: reception.id, role: 'receptionist',
    can_edit_clients: false, can_create_routines: false, can_view_payments: true, can_manage_staff: false
  }), 'Crear recepción de solo lectura');

  checked(await ownerApi.auth.signInWithPassword({ email: owner.email, password }), 'Login API propietario');
  clientId = String(checked(await ownerApi.rpc('create_gym_client', {
    p_gym_id: gym.id,
    p_client: {
      name: `Atleta Gym ${suffix}`,
      email: `stage-gym-athlete-${suffix}@example.invalid`,
      birth_date: '1994-06-15', age: 32, weight: 78, height: 176,
      goal: 'Competencia', notes: 'Contexto multigimnasio'
    }
  }), 'Crear cliente transaccional'));
  const membership = checked(await admin.from('client_gym_memberships')
    .select('id').eq('gym_id', gym.id).eq('client_id', clientId).single(), 'Leer membresía');
  const client = checked(await admin.from('clients').select('primary_coach_id').eq('id', clientId).single(), 'Leer cliente');
  assert.equal(client.primary_coach_id, null, 'Un cliente de gimnasio no debe caer al espacio independiente.');
  checked(await receptionApi.auth.signInWithPassword({ email: reception.email, password }), 'Login API recepción');
  const forbiddenUpdate = await receptionApi.from('clients').update({ notes: 'No permitido' }).eq('id', clientId).select('id');
  if (forbiddenUpdate.error) throw forbiddenUpdate.error;
  assert.equal(forbiddenUpdate.data?.length, 0, 'Recepción sin canEditClients no debe afectar filas.');
  const unchangedClient = checked(await admin.from('clients').select('notes').eq('id', clientId).single(), 'Comprobar perfil intacto');
  assert.equal(unchangedClient.notes, 'Contexto multigimnasio');

  checked(await ownerApi.from('measurements').insert({
    client_id: clientId, client_gym_membership_id: membership.id,
    date: '2026-09-26', weight: 78, height: 176, bmi: 25.18
  }), 'Crear medición contextual');
  const exercise = checked(await admin.from('exercises').select('id').eq('source', 'global').limit(1).single(), 'Leer ejercicio global');
  const routineId = String(checked(await ownerApi.rpc('save_gym_routine_plan', {
    p_gym_id: gym.id,
    p_plan: {
      client_id: clientId, name: 'Rutina contextual', objective: 'Validar gimnasio',
      duration_weeks: 4, start_date: '2026-09-26', end_date: '2026-10-24', notes: null,
      warmup: { enabled: false, custom_text: null, exercise_ids: [] },
      days: [{
        day_number: 1, day_name: 'Día contextual', muscle_groups: ['Full Body'], notes: null,
        exercises: [{
          exercise_id: exercise.id, sets: 3, reps: '8-10', rest: '60 s', notes: null,
          order_index: 0, block_type: 'single', block_id: null, block_label: null,
          block_position: null, block_rest: null, week_configs: []
        }]
      }]
    }
  }), 'Guardar rutina contextual'));
  const routine = checked(await admin.from('routines').select('client_gym_membership_id').eq('id', routineId).single(), 'Leer rutina contextual');
  assert.equal(routine.client_gym_membership_id, membership.id);

  const sheetId = String(checked(await ownerApi.rpc('save_gym_competitor_sheet', {
    p_gym_id: gym.id,
    p_sheet: {
      client_id: clientId, program_title: 'Stage', mesocycle_title: 'Mesociclo contextual',
      macrocycle_title: 'Macro', frequency_text: '3 días', split_text: 'Full Body',
      training_days_text: 'L-M-V', day_labels: ['Lunes'], week_plans: [{ weekLabel: 'Semana 1', workouts: ['A'] }],
      workouts: [{ key: 'A', title: 'Entreno A', subtitle: 'Stage', code: 'A', blocks: [] }]
    }
  }), 'Guardar competidor contextual'));
  const sheet = checked(await admin.from('competitor_sheets').select('client_gym_membership_id').eq('id', sheetId).single(), 'Leer competidor contextual');
  assert.equal(sheet.client_gym_membership_id, membership.id);

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4421'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const ownerContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const ownerPage = await ownerContext.newPage();
  await login(ownerPage, owner.email);
  await ownerPage.goto(`${baseUrl}/gym/${gym.id}/clients`, { waitUntil: 'networkidle' });
  await ownerPage.getByText(`Atleta Gym ${suffix}`, { exact: true }).waitFor();
  await ownerPage.goto(`${baseUrl}/gym/${otherGym.id}/clients`, { waitUntil: 'networkidle' });
  assert.equal(await ownerPage.getByText(`Atleta Gym ${suffix}`, { exact: true }).count(), 0);
  await ownerPage.goto(`${baseUrl}/gym/${gym.id}/clients/${clientId}`, { waitUntil: 'networkidle' });
  await ownerPage.getByRole('heading', { name: `Atleta Gym ${suffix}`, level: 1 }).waitFor();
  await ownerPage.getByText('Rutina contextual', { exact: true }).waitFor();
  const measurementsTab = ownerPage.locator('#client-measurements-tab');
  await measurementsTab.waitFor();
  assert.match((await measurementsTab.textContent()) || '', /Mediciones\s*1/);
  const competitorTab = ownerPage.locator('#client-competitor-tab');
  await competitorTab.waitFor();
  assert.match((await competitorTab.textContent()) || '', /Competidor\s*1/);
  await ownerPage.screenshot({ path: `${appRoot}/docs/qa/gym-client-detail-desktop.png`, fullPage: true });
  await ownerContext.close();

  const receptionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const receptionPage = await receptionContext.newPage();
  await login(receptionPage, reception.email);
  await receptionPage.goto(`${baseUrl}/gym/${gym.id}/clients/${clientId}`, { waitUntil: 'networkidle' });
  await receptionPage.getByRole('heading', { name: `Atleta Gym ${suffix}`, level: 1 }).waitFor();
  assert.equal(await receptionPage.getByRole('button', { name: 'Editar' }).count(), 0);
  assert.equal(await receptionPage.getByRole('link', { name: 'Nueva rutina' }).count(), 0);
  assert.equal(await receptionPage.getByRole('button', { name: 'Nueva medición' }).count(), 0);
  await receptionContext.close();

  checked(await ownerApi.rpc('remove_gym_client', { p_gym_id: gym.id, p_client_id: clientId }), 'Retirar cliente del gimnasio');
  const cleanupResult = await admin.from('clients').select('id', { count: 'exact', head: true }).eq('id', clientId);
  if (cleanupResult.error) throw cleanupResult.error;
  assert.equal(cleanupResult.count, 0);
  clientId = undefined;
  console.log('Clientes, mediciones, rutinas, competidor, aislamiento y permisos de gimnasio verificados en staging alojado.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (clientId) checked(await admin.from('clients').delete().eq('id', clientId), 'Limpiar cliente');
  for (const gymId of gymIds) checked(await admin.from('gyms').delete().eq('id', gymId), 'Limpiar gimnasio');
  for (const userId of userIds) {
    checked(await admin.from('coaches').delete().eq('id', userId), 'Limpiar coach');
    checked(await admin.auth.admin.deleteUser(userId), 'Limpiar Auth');
  }
}
