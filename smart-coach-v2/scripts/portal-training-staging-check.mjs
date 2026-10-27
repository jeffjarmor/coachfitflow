import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const target = loadStagingTarget();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const portalApi = createClient(target.API_URL, target.ANON_KEY, options);
const outsiderApi = createClient(target.API_URL, target.ANON_KEY, options);
const expiredApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const domain = target.hosted ? 'zummith.com' : 'example.invalid';
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4427';
const appRoot = new URL('..', import.meta.url).pathname;
const users = [];
const coaches = [];
const clients = [];
const gyms = [];
const exercises = [];
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createAuth(label) {
  const email = `stage-portal-training-${label}-${suffix}@${domain}`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  users.push(user.id);
  return { id: user.id, email };
}

async function createCoach(label, values) {
  const auth = await createAuth(label);
  checked(await admin.from('coaches').insert({
    id: auth.id,
    email: auth.email,
    name: `Stage portal ${label}`,
    role: 'coach',
    account_type: values.accountType,
    coach_plan: values.plan,
    next_plan_payment_date: values.paymentDate
  }), `Crear coach ${label}`);
  coaches.push(auth.id);
  return auth;
}

async function createRoutine({ clientId, coachId, membershipId, label }) {
  const exercise = checked(await admin.from('exercises').insert({
    name: `Press portal ${label} ${suffix}`,
    muscle_group: 'Pecho',
    source: 'coach',
    coach_id: coachId,
    video_url: 'https://example.com/tecnica'
  }).select('id').single(), `Crear ejercicio ${label}`);
  exercises.push(exercise.id);
  const routine = checked(await admin.from('routines').insert({
    client_id: clientId,
    coach_id: coachId,
    client_gym_membership_id: membershipId,
    name: `Rutina portal ${label}`,
    objective: 'Registrar el entrenamiento real',
    training_days_count: 1,
    duration_weeks: 4,
    warmup_enabled: true,
    warmup_custom_text: 'Movilidad de hombros durante cinco minutos.'
  }).select('id').single(), `Crear rutina ${label}`);
  const day = checked(await admin.from('routine_days').insert({
    routine_id: routine.id,
    day_number: 1,
    day_name: `Día ${label}`,
    muscle_groups: ['Pecho', 'Tríceps']
  }).select('id').single(), `Crear día ${label}`);
  const assignment = checked(await admin.from('routine_day_exercises').insert({
    routine_day_id: day.id,
    exercise_id: exercise.id,
    sets: 3,
    reps: '8-10',
    rest: '90 s',
    notes: 'Controla la bajada.',
    order_index: 0,
    block_type: 'single'
  }).select('id').single(), `Crear asignación ${label}`);
  return { routineId: routine.id, dayId: day.id, assignmentId: assignment.id, exerciseId: exercise.id };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/login`)).ok) return; } catch { /* Angular está iniciando. */ }
    await delay(500);
  }
  throw new Error('El frontend del Portal no arrancó.');
}

try {
  const independentCoach = await createCoach('independent', {
    accountType: 'independent', plan: 'paid', paymentDate: '2027-12-31'
  });
  const expiredCoach = await createCoach('expired', {
    accountType: 'independent', plan: 'paid', paymentDate: '2025-01-01'
  });
  const gymCoach = await createCoach('gym', {
    accountType: 'gym', plan: 'standard', paymentDate: null
  });
  const portalUser = await createAuth('client');
  const outsider = await createAuth('outsider');
  const expiredUser = await createAuth('expired-client');

  const independentClient = checked(await admin.from('clients').insert({
    user_id: portalUser.id,
    primary_coach_id: independentCoach.id,
    name: 'Cliente independiente Portal',
    email: portalUser.email,
    age: 31,
    goal: 'Fuerza',
    portal_status: 'active'
  }).select('id').single(), 'Crear cliente independiente');
  clients.push(independentClient.id);
  checked(await admin.from('independent_client_portal_access').insert({
    user_id: portalUser.id, client_id: independentClient.id, coach_id: independentCoach.id
  }), 'Crear acceso independiente');
  const independent = await createRoutine({
    clientId: independentClient.id, coachId: independentCoach.id, membershipId: null, label: 'independiente'
  });

  const gym = checked(await admin.from('gyms').insert({
    name: `Gym portal training stage ${suffix}`,
    access_code: `PTR${suffix.toUpperCase()}`,
    owner_id: gymCoach.id
  }).select('id').single(), 'Crear gimnasio');
  gyms.push(gym.id);
  const gymClient = checked(await admin.from('clients').insert({
    user_id: portalUser.id,
    primary_coach_id: gymCoach.id,
    name: 'Cliente gimnasio Portal',
    email: portalUser.email,
    age: 31,
    goal: 'Hipertrofia',
    portal_status: 'active'
  }).select('id').single(), 'Crear cliente de gimnasio');
  clients.push(gymClient.id);
  const membership = checked(await admin.from('client_gym_memberships').insert({
    client_id: gymClient.id,
    gym_id: gym.id,
    assigned_coach_id: gymCoach.id,
    subscription_status: 'active',
    portal_status: 'active'
  }).select('id').single(), 'Crear membresía de gimnasio');
  checked(await admin.from('client_portal_access').insert({
    user_id: portalUser.id, client_gym_membership_id: membership.id
  }), 'Crear acceso de gimnasio');
  const gymRoutine = await createRoutine({
    clientId: gymClient.id, coachId: gymCoach.id, membershipId: membership.id, label: 'gimnasio'
  });

  const expiredClient = checked(await admin.from('clients').insert({
    user_id: expiredUser.id,
    primary_coach_id: expiredCoach.id,
    name: 'Cliente Pro vencido',
    email: expiredUser.email,
    age: 31,
    goal: 'Validar bloqueo',
    portal_status: 'active'
  }).select('id').single(), 'Crear cliente vencido');
  clients.push(expiredClient.id);
  checked(await admin.from('independent_client_portal_access').insert({
    user_id: expiredUser.id, client_id: expiredClient.id, coach_id: expiredCoach.id
  }), 'Crear acceso vencido');
  const expiredRoutine = await createRoutine({
    clientId: expiredClient.id, coachId: expiredCoach.id, membershipId: null, label: 'vencido'
  });

  checked(await portalApi.auth.signInWithPassword({ email: portalUser.email, password }), 'Login API Portal');
  checked(await outsiderApi.auth.signInWithPassword({ email: outsider.email, password }), 'Login API externo');
  checked(await expiredApi.auth.signInWithPassword({ email: expiredUser.email, password }), 'Login API vencido');

  const saveParams = {
    p_routine_id: independent.routineId,
    p_routine_day_id: independent.dayId,
    p_assignment_id: independent.assignmentId,
    p_set_number: 1,
    p_actual_reps: 10,
    p_rir: 2,
    p_load: 42.5
  };
  const first = checked(await portalApi.rpc('save_portal_training_set', saveParams), 'Guardar serie independiente')[0];
  const repeated = checked(await portalApi.rpc('save_portal_training_set', {
    ...saveParams, p_actual_reps: 9, p_rir: 1, p_load: 45
  }), 'Actualizar misma serie independiente')[0];
  assert.equal(repeated.training_session_id, first.training_session_id);
  assert.equal(repeated.training_set_id, first.training_set_id);
  assert.ok((await portalApi.rpc('complete_portal_training_session', {p_session_id:first.training_session_id})).error, 'La finalización explícita no pertenece al contrato original.');
  const independentSessions = checked(await admin.from('training_sessions').select('id,status')
    .eq('routine_id', independent.routineId), 'Leer sesión independiente');
  assert.equal(independentSessions.length, 1, 'Los reintentos no duplican la sesión.');
  assert.equal(independentSessions[0].status, 'in_progress');
  const independentSets = checked(await admin.from('training_session_sets').select('actual_reps,rir,load')
    .eq('training_session_id', first.training_session_id), 'Leer serie independiente');
  assert.deepEqual(independentSets.map(row => ({ ...row, load: Number(row.load) })), [{ actual_reps: 9, rir: 1, load: 45 }]);

  assert.ok((await outsiderApi.rpc('save_portal_training_set', saveParams)).error,
    'Otra identidad no puede escribir el entrenamiento.');
  assert.ok((await expiredApi.rpc('save_portal_training_set', {
    p_routine_id: expiredRoutine.routineId,
    p_routine_day_id: expiredRoutine.dayId,
    p_assignment_id: expiredRoutine.assignmentId,
    p_set_number: 1,
    p_actual_reps: 8,
    p_rir: 3,
    p_load: 20
  })).error, 'Un Portal independiente con Pro vencido no puede escribir.');
  assert.ok((await portalApi.rpc('save_portal_training_set', {
    ...saveParams, p_set_number: 4
  })).error, 'No se puede registrar una serie fuera del plan.');

  const configuration = target.hosted ? 'hosted-staging' : 'local-staging';
  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', configuration, '--host', '127.0.0.1', '--port', '4427'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(portalUser.email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL('**/client/portal', { timeout: 20_000 });
  await page.goto(`${baseUrl}/client/routines/${gymRoutine.routineId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: `Press portal gimnasio ${suffix}` }).waitFor();
  await page.getByRole('button', { name: 'Registrar series' }).click();
  await page.getByLabel(`Repeticiones, serie 1 de Press portal gimnasio ${suffix}`).fill('12');
  await page.getByLabel(`Carga en kg, serie 1 de Press portal gimnasio ${suffix}`).fill('32.5');
  await page.getByLabel(`RIR, serie 1 de Press portal gimnasio ${suffix}`).fill('2');
  await page.getByLabel(`RIR, serie 1 de Press portal gimnasio ${suffix}`).press('Tab');
  await page.getByText('Guardado', { exact: true }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByRole('button', {name:'Finalizar entrenamiento'}).count(),0);
  const [routineDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar PDF' }).click()
  ]);
  const routinePdfPath = await routineDownload.path();
  assert.ok(routineDownload.suggestedFilename().endsWith('.pdf'));
  assert.ok(routinePdfPath, 'El PDF de la rutina debe tener un archivo temporal.');
  const routinePdf = await readFile(routinePdfPath);
  assert.equal(routinePdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(routinePdf.length > 1_000, 'El PDF de la rutina debe tener contenido.');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'El registro móvil no se desborda.');
  await page.screenshot({ path: `${appRoot}/docs/qa/client-portal-training-mobile.png`, fullPage: true });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Registrar series/ }).click();
  assert.equal(await page.getByLabel(`RIR, serie 1 de Press portal gimnasio ${suffix}`).isDisabled(), false);
  assert.equal(await page.getByLabel(`RIR, serie 1 de Press portal gimnasio ${suffix}`).inputValue(), '2');
  assert.equal(await page.locator('a[href="/client/history"]').count(), 0, 'No se añade el historial dedicado.');
  await page.setViewportSize({width:1440,height:1000});
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path:`${appRoot}/docs/qa/client-portal-training-desktop.png`,fullPage:true});
  assert.deepEqual(pageErrors, []);
  await context.close();

  const gymSessions = checked(await admin.from('training_sessions').select('id,status,client_gym_membership_id')
    .eq('routine_id', gymRoutine.routineId), 'Leer sesión UI gimnasio');
  assert.equal(gymSessions.length, 1);
  assert.equal(gymSessions[0].status, 'in_progress');
  assert.equal(gymSessions[0].client_gym_membership_id, membership.id);
  const gymSets = checked(await admin.from('training_session_sets').select('actual_reps,rir,load')
    .eq('training_session_id', gymSessions[0].id), 'Leer serie UI gimnasio');
  assert.deepEqual(gymSets.map(row => ({ ...row, load: Number(row.load) })), [{ actual_reps: 12, rir: 2, load: 32.5 }]);

  console.log(`Portal de entrenamiento validado en staging ${target.hosted ? 'alojado' : 'local'}: independiente, gimnasio, UI responsive, PDF, series editables, reintentos y aislamiento.`);
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  for (const clientId of clients.reverse()) await admin.from('clients').delete().eq('id', clientId);
  for (const exerciseId of exercises.reverse()) await admin.from('exercises').delete().eq('id', exerciseId);
  for (const gymId of gyms.reverse()) await admin.from('gyms').delete().eq('id', gymId);
  for (const coachId of coaches.reverse()) await admin.from('coaches').delete().eq('id', coachId);
  for (const userId of users.reverse()) await admin.auth.admin.deleteUser(userId);
}
