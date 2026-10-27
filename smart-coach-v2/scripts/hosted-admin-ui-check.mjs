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
const baseUrl = 'http://127.0.0.1:4415';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const adminApi = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(5).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const users = [];
let temporaryExerciseId;
let server;
let browser;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'sin código'})`);
  return result.data;
}

async function createUser(label, role) {
  const email = `stage-admin-ui-${label}-${suffix}@example.invalid`;
  const user = checked(await adminApi.auth.admin.createUser({ email, password, email_confirm: true }),
    `Crear Auth ${label}`).user;
  users.push(user.id);
  checked(await adminApi.from('coaches').insert({
    id: user.id,
    email,
    name: `Stage ${label}`,
    role,
    account_type: 'independent',
    coach_plan: 'standard',
    brand_color: '#CCFF00'
  }), `Crear perfil ${label}`);
  return { id: user.id, email };
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

async function login(page, email) {
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(url => url.pathname === '/dashboard' || url.pathname.startsWith('/gym/'), { timeout: 20_000 });
}

try {
  const coach = await createUser('coach', 'coach');
  const platformAdmin = await createUser('admin', 'admin');

  server = spawn('./node_modules/.bin/ng', [
    'serve', '--configuration', 'hosted-staging', '--host', '127.0.0.1', '--port', '4415'
  ], { cwd: appRoot, stdio: 'ignore' });
  await waitForServer();

  browser = await chromium.launch({ headless: true });

  const deniedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const deniedPage = await deniedContext.newPage();
  await login(deniedPage, coach.email);
  await deniedPage.goto(`${baseUrl}/exercises/admin`, { waitUntil: 'networkidle' });
  await deniedPage.waitForURL(url => url.pathname === '/dashboard' && url.searchParams.get('access') === 'admin-required');
  await deniedPage.goto(`${baseUrl}/seed-exercises`, { waitUntil: 'networkidle' });
  await deniedPage.waitForURL(url => url.pathname === '/dashboard' && url.searchParams.get('access') === 'admin-required');
  await deniedContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await adminContext.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await login(page, platformAdmin.email);

  await page.goto(`${baseUrl}/exercises/admin`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Biblioteca global', level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Nuevo ejercicio global' }).click();
  const temporaryName = `Global UI RC ${suffix}`;
  await page.locator('[formcontrolname="name"]').fill(temporaryName);
  await page.locator('[formcontrolname="muscleGroup"]').fill('Full Body');
  await page.locator('[formcontrolname="description"]').fill('Ejercicio temporal para validar CRUD real.');
  await page.getByRole('button', { name: 'Guardar ejercicio' }).click();
  await page.getByText('El ejercicio global se agregó a la biblioteca.').waitFor();
  temporaryExerciseId = checked(await adminApi.from('exercises').select('id')
    .eq('source', 'global').eq('name', temporaryName).single(), 'Leer ejercicio temporal').id;

  await page.locator('#global-search').fill(temporaryName);
  const row = page.locator('.exercise-row').filter({ hasText: temporaryName });
  await row.getByRole('button', { name: 'Editar' }).click();
  await page.locator('[formcontrolname="description"]').fill('Ejercicio temporal editado desde UI real.');
  await page.getByRole('button', { name: 'Guardar ejercicio' }).click();
  await page.getByText('Los cambios del ejercicio se guardaron.').waitFor();
  await page.locator('.exercise-row').filter({ hasText: temporaryName })
    .getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('button', { name: 'Eliminar ejercicio' }).click();
  await page.getByText(/se eliminó de la biblioteca global/).waitFor();
  temporaryExerciseId = undefined;

  await page.goto(`${baseUrl}/seed-exercises`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Carga inicial', level: 1 }).waitFor();
  const seedButton = page.getByRole('button', { name: 'Agregar ejercicios faltantes' });
  const canSeed = await seedButton.isEnabled();
  if (canSeed) {
    await seedButton.click();
    await page.getByRole('button', { name: 'Iniciar carga' }).click();
    await page.getByText(/Carga terminada:/).waitFor({ timeout: 120_000 });
  }
  await page.getByText('El catálogo ya está actualizado.').waitFor({ timeout: 120_000 });
  const countResult = await adminApi.from('exercises').select('id', { count: 'exact', head: true }).eq('source', 'global');
  checked(countResult, 'Verificar catálogo global');
  assert.ok((countResult.count || 0) > 0, 'La carga inicial debe dejar ejercicios globales disponibles.');
  assert.deepEqual(pageErrors, []);
  await adminContext.close();

  console.log(`Guard admin real verificado; catálogo inicial disponible con ${countResult.count} ejercicios globales.`);
  console.log(`Carga inicial ${canSeed ? 'ejecutada y revalidada' : 'ya estaba completa'} de forma idempotente en staging.`);
} finally {
  if (browser) await browser.close();
  if (server && !server.killed) server.kill('SIGINT');
  if (temporaryExerciseId) await adminApi.from('exercises').delete().eq('id', temporaryExerciseId);
  for (const id of users) await adminApi.from('coaches').delete().eq('id', id);
  for (const id of users) await adminApi.auth.admin.deleteUser(id);
}
