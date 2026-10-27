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
const baseUrl = 'http://127.0.0.1:4400';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(5).toString('hex');
const initialPassword = `${randomBytes(18).toString('base64url')}Aa1!`;
const updatedPassword = `${randomBytes(18).toString('base64url')}Bb2!`;
const userIds = [];
let server;
let browser;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`);
      if (response.ok) return;
    } catch { /* Angular is still starting. */ }
    await delay(500);
  }
  throw new Error(`V2 hosted staging no arrancó en ${baseUrl}.`);
}

async function findUserByEmail(email) {
  const users = checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'Listar usuarios Auth').users;
  return users.find(user => user.email?.toLocaleLowerCase('es') === email.toLocaleLowerCase('es'));
}

try {
  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4400'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const signupEmail = `stage-signup-${suffix}@zummith.com`;
  const signupContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const signupPage = await signupContext.newPage();
  await signupPage.goto(`${baseUrl}/signup`, { waitUntil: 'networkidle' });
  await signupPage.locator('#signup-name').fill('Coach Signup Stage');
  await signupPage.locator('#signup-email').fill(signupEmail.toUpperCase());
  await signupPage.locator('#signup-password').fill(initialPassword);
  await signupPage.locator('#signup-confirmation').fill(initialPassword);
  await signupPage.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await signupPage.getByRole('heading', { name: 'Revisa tu correo.' }).waitFor({ timeout: 20_000 });
  const signupUser = await findUserByEmail(signupEmail);
  assert.ok(signupUser, 'El registro UI no creó la identidad Auth.');
  assert.ok(!signupUser.email_confirmed_at, 'El registro debe requerir confirmación de correo.');
  assert.equal(signupUser.user_metadata?.role, 'coach');
  assert.equal(signupUser.user_metadata?.account_type, 'independent');
  userIds.push(signupUser.id);
  await signupContext.close();

  const confirmationEmail = `stage-confirm-${suffix}@zummith.com`;
  const signupLink = checked(await admin.auth.admin.generateLink({
    type: 'signup',
    email: confirmationEmail,
    password: initialPassword,
    options: {
      redirectTo: `${baseUrl}/login?registered=1`,
      data: { name: 'Coach Confirm Stage', full_name: 'Coach Confirm Stage', role: 'coach', account_type: 'independent' }
    }
  }), 'Generar enlace de confirmación');
  userIds.push(signupLink.user.id);
  const confirmationContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const confirmationPage = await confirmationContext.newPage();
  await confirmationPage.goto(signupLink.properties.action_link, { waitUntil: 'domcontentloaded' });
  await confirmationPage.waitForURL(url => url.origin === baseUrl, { timeout: 30_000 });
  await confirmationPage.waitForLoadState('networkidle');
  const confirmedUser = checked(await admin.auth.admin.getUserById(signupLink.user.id),
    'Leer usuario confirmado').user;
  assert.ok(confirmedUser.email_confirmed_at, 'El enlace no confirmó el correo.');
  assert.ok(['/login', '/dashboard'].includes(new URL(confirmationPage.url()).pathname));
  await confirmationContext.close();

  const recoveryEmail = `stage-recovery-${suffix}@zummith.com`;
  const recoveryUser = checked(await admin.auth.admin.createUser({
    email: recoveryEmail,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { name: 'Coach Recovery Stage', role: 'coach', account_type: 'independent' }
  }), 'Crear usuario de recuperación').user;
  userIds.push(recoveryUser.id);
  const recoveryLink = checked(await admin.auth.admin.generateLink({
    type: 'recovery',
    email: recoveryEmail,
    options: { redirectTo: `${baseUrl}/set-password` }
  }), 'Generar enlace de recuperación');

  const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const recoveryPage = await recoveryContext.newPage();
  await recoveryPage.goto(recoveryLink.properties.action_link, { waitUntil: 'domcontentloaded' });
  await recoveryPage.waitForURL(url => url.origin === baseUrl && url.pathname === '/set-password', { timeout: 30_000 });
  await recoveryPage.locator('#new-password').fill(updatedPassword);
  await recoveryPage.locator('#password-confirmation').fill(updatedPassword);
  await recoveryPage.getByRole('button', { name: 'Guardar contraseña' }).click();
  await recoveryPage.waitForURL(url => url.pathname === '/login' && url.searchParams.get('passwordUpdated') === '1',
    { timeout: 20_000 });
  await recoveryPage.getByText('Tu contraseña quedó lista. Ya puedes iniciar sesión con ese correo.').waitFor();
  await recoveryPage.locator('#email').fill(recoveryEmail);
  await recoveryPage.locator('#password').fill(updatedPassword);
  await recoveryPage.getByRole('button', { name: 'Iniciar sesión' }).click();
  await recoveryPage.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
  await recoveryPage.getByRole('heading', { name: /Hola,/ }).waitFor();
  await recoveryContext.close();

  console.log('Registro UI real aceptado con confirmación obligatoria y metadatos correctos.');
  console.log('Enlace de confirmación, redirect local, recuperación, cambio de contraseña y login final verificados.');
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill('SIGINT');
  for (const id of userIds) await admin.from('coaches').delete().eq('id', id);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
}
