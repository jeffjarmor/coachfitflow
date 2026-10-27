import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

const appRoot = new URL('..', import.meta.url).pathname;
const status = loadStagingTarget();

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const coach = createClient(status.API_URL, status.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const email = `stage-ui-${suffix}@example.invalid`;
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const baseUrl = status.hosted ? 'http://127.0.0.1:4410' : 'http://127.0.0.1:4310';
let coachId;
let server;
let browser;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
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
  throw new Error(`V2 ${status.hosted ? 'hosted' : 'local'} staging no arrancó en ${baseUrl}.`);
}

try {
  coachId = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    'Crear Auth temporal').user.id;
  checked(await admin.from('coaches').upsert({
    id: coachId, email, name: 'Coach UI Stage', role: 'coach', account_type: 'independent',
    coach_plan: 'paid', next_plan_payment_date: '2099-01-01'
  }), 'Crear perfil temporal');
  checked(await coach.auth.signInWithPassword({ email, password }), 'Login inicial');
  const logoPath = `coaches/${coachId}/logo/ui-stage.png`;
  checked(await coach.storage.from('assets').upload(logoPath, Buffer.from([137, 80, 78, 71]), {
    contentType: 'image/png'
  }), 'Subir logo temporal');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', status.hosted ? 'hosted-staging' : 'local-staging',
    '--host', '127.0.0.1', '--port', status.hosted ? '4410' : '4310'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
  await page.goto(`${baseUrl}/profile`);
  await page.locator('.danger-row button').waitFor({ timeout: 20_000 });
  await page.locator('.danger-row button').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, eliminar' }).click();
  await page.waitForURL(baseUrl + '/', { timeout: 20_000 });

  assert.equal(checked(await admin.from('coaches').select('id').eq('id', coachId), 'Verificar coach').length, 0);
  const remaining = checked(await admin.storage.from('assets').list(`coaches/${coachId}/logo`),
    'Verificar logo');
  assert.equal(remaining.some(file => file.name === 'ui-stage.png'), false);
  console.log(`V2 móvil: login y eliminación completa de cuenta/Storage verificados contra staging ${status.hosted ? 'alojado' : 'local'}.`);
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill('SIGINT');
  if (coachId) {
    const remaining = await admin.storage.from('assets').list(`coaches/${coachId}/logo`);
    if (remaining.data?.some(file => file.name === 'ui-stage.png')) {
      await admin.storage.from('assets').remove([`coaches/${coachId}/logo/ui-stage.png`]);
    }
    const profile = checked(await admin.from('coaches').select('id').eq('id', coachId), 'Revisar limpieza');
    if (profile.length) checked(await admin.from('coaches').delete().eq('id', coachId), 'Limpiar perfil');
    const identity = await admin.auth.admin.getUserById(coachId);
    if (identity.data?.user) checked(await admin.auth.admin.deleteUser(coachId), 'Limpiar Auth');
  }
}
