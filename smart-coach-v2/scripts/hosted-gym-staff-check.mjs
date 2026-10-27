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
const ownerApi = createClient(target.API_URL, target.ANON_KEY, options);
const managerApi = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = 'http://127.0.0.1:4424';
const appRoot = new URL('..', import.meta.url).pathname;
const users = [];
let gymId;
let browser;
let server;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createCoach(label) {
  const email = `stage-gym-staff-${label}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), `Crear Auth ${label}`).user;
  users.push(user.id);
  checked(await admin.from('coaches').insert({
    id: user.id, email, name: `Stage ${label}`, role: 'coach', account_type: 'gym', coach_plan: 'standard'
  }), `Crear coach ${label}`);
  return { id: user.id, email, name: `Stage ${label}` };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/login`)).ok) return;
    } catch { /* Angular is starting. */ }
    await delay(500);
  }
  throw new Error('El frontend de Personal no arrancó.');
}

async function login(page, identity) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(identity.email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

async function openStaff(identity, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await login(page, identity);
  await page.goto(`${baseUrl}/gym/staff/${gymId}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Equipo del gimnasio' }).waitFor();
  return { context, page, pageErrors };
}

try {
  const owner = await createCoach('owner');
  const coowner = await createCoach('coowner');
  const trainer = await createCoach('trainer');
  const reception = await createCoach('reception');
  const manager = await createCoach('manager');
  const candidate = await createCoach('candidate');

  const gym = checked(await admin.from('gyms').insert({
    name: `Gym personal ${suffix}`, access_code: `STF${suffix.slice(0, 5).toUpperCase()}`, owner_id: owner.id
  }).select('id').single(), 'Crear gimnasio');
  gymId = gym.id;
  checked(await admin.from('gym_staff').insert([
    { gym_id: gymId, coach_id: owner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
    { gym_id: gymId, coach_id: coowner.id, role: 'owner', can_edit_clients: true, can_create_routines: true, can_view_payments: true, can_manage_staff: true },
    { gym_id: gymId, coach_id: trainer.id, role: 'trainer', can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false },
    { gym_id: gymId, coach_id: reception.id, role: 'receptionist', can_edit_clients: true, can_create_routines: false, can_view_payments: true, can_manage_staff: false },
    { gym_id: gymId, coach_id: manager.id, role: 'trainer', can_edit_clients: true, can_create_routines: false, can_view_payments: false, can_manage_staff: true }
  ]), 'Crear matriz de personal');
  checked(await ownerApi.auth.signInWithPassword({ email: owner.email, password }), 'Login API dueño');
  checked(await managerApi.auth.signInWithPassword({ email: manager.email, password }), 'Login API manager');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', target.hosted ? 'hosted-staging' : 'local-staging', '--host', '127.0.0.1', '--port', '4424'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const ownerResult = await openStaff(owner, { width: 1440, height: 1000 });
  const ownerPage = ownerResult.page;
  await ownerPage.locator('.metrics article').filter({ hasText: 'Personas' }).getByText('5', { exact: true }).waitFor();
  const ownerRow = ownerPage.locator('.staff-row').filter({ hasText: owner.email });
  await ownerRow.getByText('Dueño principal', { exact: true }).waitFor();
  await ownerRow.getByText('Protegido', { exact: true }).waitFor();

  assert.equal(await ownerPage.getByRole('button', {name:'Agregar personal'}).count(),0);
  const candidateApi = createClient(target.API_URL,target.ANON_KEY,options);
  checked(await candidateApi.auth.signInWithPassword({email:candidate.email,password}),'Login candidato');
  checked(await candidateApi.rpc('join_gym_by_access_code',{p_access_code:`STF${suffix.slice(0,5).toUpperCase()}`}), 'Ingreso por código');
  await ownerPage.reload({waitUntil:'networkidle'});
  let candidateRow = ownerPage.locator('.staff-row').filter({hasText:candidate.email});
  await candidateRow.getByText('Entrenador',{exact:true}).waitFor();
  await candidateRow.getByRole('button', { name: 'Editar' }).click();
  const editDialog = ownerPage.getByRole('dialog');
  await editDialog.locator('#staff-role').click();
  await ownerPage.getByRole('option',{name:'Recepción',exact:true}).click();
  assert.equal(await editDialog.getByRole('checkbox').count(),0);
  await editDialog.getByRole('button', { name: 'Guardar cambios' }).click();
  await ownerPage.getByText(new RegExp(`El acceso de ${candidate.name} quedó actualizado`)).waitFor();
  candidateRow = ownerPage.locator('.staff-row').filter({ hasText: candidate.email });
  await candidateRow.getByText('Recepción', { exact: true }).waitFor();
  assert.equal(await candidateRow.getByText('Clientes', { exact: true }).count(), 1);

  const trainerRow = ownerPage.locator('.staff-row').filter({ hasText: trainer.email });
  await trainerRow.getByRole('button', { name: 'Editar' }).click();
  await ownerPage.getByRole('dialog').locator('#staff-role').click();
  await ownerPage.getByRole('option',{name:'Copropietario',exact:true}).click();
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click();
  await ownerPage.locator('.staff-row').filter({ hasText: trainer.email }).getByText('Copropietario', { exact: true }).waitFor();
  await ownerPage.evaluate(() => window.scrollTo(0, 0));
  await ownerPage.screenshot({ path: `${appRoot}/docs/qa/gym-staff-owner-desktop.png`, fullPage: true });
  assert.deepEqual(ownerResult.pageErrors, []);

  const candidateMembership = checked(await admin.from('gym_staff')
    .select('role,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff')
    .eq('gym_id', gymId).eq('coach_id', candidate.id).single(), 'Leer permisos de candidata');
  assert.deepEqual(candidateMembership, {
    role: 'receptionist', can_edit_clients: true, can_create_routines: false,
    can_view_payments: true, can_manage_staff: false
  });
  const promotedTrainer = checked(await admin.from('gym_staff')
    .select('role,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff')
    .eq('gym_id', gymId).eq('coach_id', trainer.id).single(), 'Leer copropietario promovido');
  assert.equal(promotedTrainer.role, 'owner');
  assert.ok(promotedTrainer.can_edit_clients && promotedTrainer.can_create_routines
    && promotedTrainer.can_view_payments && promotedTrainer.can_manage_staff);

  const primaryUpdate = await ownerApi.rpc('set_gym_staff_role',{p_gym_id:gymId,p_coach_id:owner.id,p_role:'trainer'});
  assert.ok(primaryUpdate.error, 'La RPC debe bloquear cambios al dueño principal.');
  const primaryRemove = await ownerApi.rpc('remove_gym_staff_member', { p_gym_id: gymId, p_coach_id: owner.id });
  assert.ok(primaryRemove.error, 'La RPC debe bloquear retirar al dueño principal.');
  await ownerResult.context.close();

  const coownerResult = await openStaff(coowner, { width: 1280, height: 900 });
  await coownerResult.page.locator('.staff-row').filter({ hasText: candidate.email }).getByRole('button', { name: 'Editar' }).waitFor();
  assert.deepEqual(coownerResult.pageErrors, []);
  await coownerResult.context.close();

  const managerResult = await openStaff(manager, { width: 390, height: 844 });
  const managerPage = managerResult.page;
  await managerPage.locator('.staff-row').filter({ hasText: coowner.email }).getByText('Protegido', { exact: true }).waitFor();
  assert.equal(await managerPage.getByRole('button',{name:'Editar',exact:true}).count(),0,'Un manager delegado no cambia roles.');
  await managerPage.locator('.staff-row').filter({hasText:candidate.email}).getByRole('button',{name:'Retirar',exact:true}).waitFor();
  await managerPage.evaluate(() => window.scrollTo(0, 0));
  await managerPage.screenshot({ path: `${appRoot}/docs/qa/gym-staff-manager-mobile.png`, fullPage: true });
  assert.deepEqual(managerResult.pageErrors, []);
  await managerResult.context.close();

  const forbiddenPromotion = await managerApi.rpc('set_gym_staff_role',{p_gym_id:gymId,p_coach_id:candidate.id,p_role:'owner'});
  assert.ok(forbiddenPromotion.error, 'Un manager delegado no puede promover propietarios.');
  const forbiddenOwnerRemoval = await managerApi.rpc('remove_gym_staff_member', {
    p_gym_id: gymId, p_coach_id: coowner.id
  });
  assert.ok(forbiddenOwnerRemoval.error, 'Un manager delegado no puede retirar copropietarios.');

  for (const identity of [reception]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page, identity);
    await page.goto(`${baseUrl}/gym/staff/${gymId}`);
    await page.waitForURL((url) => url.pathname === `/gym/${gymId}/clients` && url.searchParams.get('access') === 'permission-required');
    await context.close();
  }

  const standardTrainer = await createCoach('standard-trainer');
  checked(await admin.from('gym_staff').insert({
    gym_id: gymId, coach_id: standardTrainer.id, role: 'trainer',
    can_edit_clients: true, can_create_routines: true, can_view_payments: false, can_manage_staff: false
  }), 'Agregar entrenador sin gestión');
  const trainerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const trainerPage = await trainerContext.newPage();
  await login(trainerPage, standardTrainer);
  await trainerPage.goto(`${baseUrl}/gym/staff/${gymId}`);
  await trainerPage.waitForURL((url) => url.pathname === `/gym/${gymId}/clients` && url.searchParams.get('access') === 'permission-required');
  await trainerContext.close();

  const cleanupOwnerResult = await openStaff(owner, { width: 1280, height: 900 });
  candidateRow = cleanupOwnerResult.page.locator('.staff-row').filter({ hasText: candidate.email });
  await candidateRow.getByRole('button', { name: 'Retirar' }).click();
  await cleanupOwnerResult.page.getByRole('alertdialog').getByRole('button', { name: 'Retirar del gimnasio' }).click();
  await cleanupOwnerResult.page.getByText(new RegExp(`${candidate.name} ya no forma parte`)).waitFor();
  assert.equal(await cleanupOwnerResult.page.locator('.staff-row').filter({ hasText: candidate.email }).count(), 0);
  await cleanupOwnerResult.context.close();
  const removedMembership = await admin.from('gym_staff').select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId).eq('coach_id', candidate.id);
  if (removedMembership.error) throw removedMembership.error;
  assert.equal(removedMembership.count, 0);
  const candidateCoach = checked(await admin.from('coaches').select('account_type').eq('id', candidate.id).single(), 'Leer cuenta conservada');
  assert.equal(candidateCoach.account_type, 'independent');

  console.log('Personal validado con dueño, copropietario, manager delegado, entrenador y recepción; ingreso por código, permisos por rol, promoción y retiro seguros.');
} finally {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
  if (gymId) await admin.from('gyms').delete().eq('id', gymId);
  for (const userId of users) {
    await admin.from('coaches').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
  }
}
