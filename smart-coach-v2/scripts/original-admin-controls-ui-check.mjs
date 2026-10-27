import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Only isolated local fixtures are supported.');
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:55321');
const base = 'http://127.0.0.1:4361';
const root = new URL('..', import.meta.url).pathname;
const env = await readFile(`${root}/src/environments/environment.ts`, 'utf8');
const productionOrigin = env.match(/url:\s*'([^']+)'/)[1];
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const suffix = randomBytes(6).toString('hex');
const password = `${randomBytes(20).toString('base64url')}Aa1!`;
const users = [], gymIds = [], checks = [], errors = [];
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message}`); return result.data; };
const check = (value, label) => { assert.ok(value, label); checks.push(label); };
let browser, server, activePage;

async function account(name, role) {
  const email = `admin-controls-ui-${role}-${suffix}@example.invalid`;
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name, role: 'admin' } }), 'Create local UI identity').user;
  users.push(user.id);
  checked(await db.from('coaches').upsert({ id: user.id, email, name, role, account_type: 'independent', coach_plan: 'standard' }), 'Create local UI profile');
  const api = createClient(target.API_URL, target.ANON_KEY, options);
  const session = checked(await api.auth.signInWithPassword({ email, password }), 'Sign in local UI identity').session;
  return { id: user.id, name, session };
}

async function start() {
  try { if ((await fetch(`${base}/login`)).ok) return; } catch { /* Start the dedicated test server. */ }
  server = spawn('./node_modules/.bin/ng', ['serve', '--configuration', 'development', '--host', '127.0.0.1', '--port', '4361'], { cwd: root, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/login`)).ok) return; } catch { /* Await compilation. */ }
    if (server.exitCode !== null) throw new Error('Angular exited before the test server was ready.');
    await delay(500);
  }
  throw new Error('Angular test server did not become ready.');
}

async function context(identity, viewport) {
  const result = await browser.newContext({ viewport, hasTouch: viewport.width < 600, reducedMotion: 'reduce', timezoneId: 'America/Costa_Rica' });
  const failures = { table: '', method: '', remaining: 0 };
  // All hosted Supabase requests, including Auth and RPC, are redirected before
  // opening any page. Privileged fixture credentials never enter the browser.
  await result.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (!url.hostname.endsWith('.supabase.co')) return route.continue();
    if (url.origin !== productionOrigin) return route.abort('blockedbyclient');
    if (failures.remaining && url.pathname.endsWith(`/${failures.table}`) && request.method() === failures.method) {
      failures.remaining--;
      return route.fulfill({ status: 400, contentType: 'application/json', json: { message: 'Synthetic local failure' } });
    }
    const headers = { ...request.headers(), apikey: target.ANON_KEY };
    const bearer = headers.authorization?.replace(/^Bearer /, '');
    let anonymous = bearer?.startsWith('sb_publishable_');
    try { anonymous ||= JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url').toString()).role === 'anon'; } catch { /* Authenticated token or no token. */ }
    if (anonymous) headers.authorization = `Bearer ${target.ANON_KEY}`;
    const response = await route.fetch({ url: request.url().replace(productionOrigin, target.API_URL), headers });
    await route.fulfill({ response });
  });
  await result.addInitScript(({ session, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('admin-controls-initialized')) {
      localStorage.setItem('zummith-auth', JSON.stringify(session));
      sessionStorage.setItem('admin-controls-initialized', '1');
    }
  }, { session: identity.session, origin: base });
  result.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return { context: result, failures };
}

async function screenshot(page, label) {
  await page.evaluate(async () => { window.scrollTo({ top: 0, behavior: 'instant' }); await document.fonts.ready; });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
  await page.screenshot({ path: `${root}/docs/qa/admin-controls-${label}.png`, fullPage: true });
}

try {
  const admin = await account('Administración local', 'admin');
  const coach = await account('Entrenador local', 'coach');
  await mkdir(`${root}/docs/qa`, { recursive: true });
  await start();
  browser = await chromium.launch();
  for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const setup = await context(admin, viewport), page = await setup.context.newPage();
    activePage = page;
    await page.goto(`${base}/admin/activity`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Actividad global', exact: true }).waitFor();
    await page.getByRole('region', { name: 'Resumen de actividad' }).waitFor();
    check(await page.getByRole('navigation', { name: 'Administración global' }).getByRole('link').count() === 6, `${name}: all administrative destinations are discoverable`);
    if (name === 'mobile') check(await page.locator('.mobile-bottom-nav a').count() === 5, 'Mobile retains five main destinations');
    await screenshot(page, `activity-${name}`);
    setup.failures.table = 'activity_logins'; setup.failures.method = 'GET'; setup.failures.remaining = 1;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('heading', { name: 'La actividad no está disponible' }).waitFor();
    check(await page.getByRole('region', { name: 'Resumen de actividad' }).count() === 0, `${name}: an activity failure never displays false zero metrics`);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await page.getByRole('region', { name: 'Resumen de actividad' }).waitFor();

    await page.getByRole('navigation', { name: 'Administración global' }).getByRole('link', { name: 'Anuncios', exact: true }).click();
    await page.getByRole('heading', { name: 'Anuncios para entrenadores', exact: true }).waitFor();
    const title = `Aviso UI ${name} ${suffix}`;
    await page.getByLabel('Título', { exact: true }).fill(title);
    await page.getByLabel('Mensaje', { exact: true }).fill('Aviso ficticio para verificar la administración.');
    await page.getByLabel(/^Orden de aparición/).fill('3');
    await page.getByLabel('Desde', { exact: true }).fill('2099-10-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2026-10-01');
    await page.getByRole('button', { name: 'Crear anuncio', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'La fecha final debe ser igual o posterior' }).waitFor();
    check(true, `${name}: reversed announcement dates are rejected before saving`);
    await page.getByLabel('Desde', { exact: true }).fill('2026-10-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2099-10-31');
    setup.failures.table = 'coach_announcements'; setup.failures.method = 'POST'; setup.failures.remaining = 1;
    await page.getByRole('button', { name: 'Crear anuncio', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Tus cambios siguen en el formulario' }).waitFor();
    check(await page.getByLabel('Título', { exact: true }).inputValue() === title, `${name}: failed save preserves announcement input`);
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Anuncio guardado correctamente.' }).waitFor();
    const row = page.getByRole('article', { name: title, exact: true });
    await row.waitFor();
    const saved = checked(await db.from('coach_announcements').select('id,audience,active,sort_order').eq('title', title).single(), 'Read UI announcement');
    check(saved.audience === 'all' && saved.active && saved.sort_order === 3, `${name}: announcement creation persists original fields`);
    await row.getByRole('button', { name: `Editar ${title}`, exact: true }).click();
    await page.getByLabel('Mensaje', { exact: true }).fill('Mensaje actualizado desde la nueva interfaz.');
    const discard = page.waitForEvent('dialog').then(dialog => dialog.dismiss());
    await page.getByRole('navigation', { name: 'Administración global' }).getByRole('link', { name: 'Actividad', exact: true }).click();
    await discard;
    check(new URL(page.url()).pathname === '/admin/announcements' && await page.getByLabel('Mensaje', { exact: true }).inputValue() === 'Mensaje actualizado desde la nueva interfaz.',
      `${name}: navigation cancellation preserves unsaved edits`);
    await page.getByRole('combobox', { name: 'Dirigido a', exact: true }).click();
    await page.getByRole('option', { name: 'Entrenadores Pro', exact: true }).click();
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Anuncio guardado correctamente.' }).waitFor();
    check(checked(await db.from('coach_announcements').select('message,audience').eq('id', saved.id).single(), 'Read UI announcement edit').audience === 'paid',
      `${name}: announcement editing changes the intended audience`);
    await row.getByRole('button', { name: `Desactivar ${title}`, exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Anuncio desactivado correctamente.' }).waitFor();
    await row.getByRole('button', { name: `Publicar ${title}`, exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Anuncio activado correctamente.' }).waitFor();
    await screenshot(page, `announcements-${name}`);
    page.once('dialog', dialog => dialog.dismiss());
    await row.getByRole('button', { name: `Eliminar ${title}`, exact: true }).click();
    check(checked(await db.from('coach_announcements').select('id').eq('id', saved.id), 'Read cancelled announcement deletion').length === 1,
      `${name}: cancelling announcement deletion preserves the record`);
    page.once('dialog', dialog => dialog.accept());
    await row.getByRole('button', { name: `Eliminar ${title}`, exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Anuncio eliminado correctamente.' }).waitFor();
    check(checked(await db.from('coach_announcements').select('id').eq('id', saved.id), 'Read confirmed announcement deletion').length === 0,
      `${name}: confirmed announcement deletion completes`);

    const gymName = `Gimnasio UI ${name} ${suffix}`;
    const gym = checked(await db.from('gyms').insert({ name: gymName, access_code: `${name === 'desktop' ? 'D' : 'M'}${suffix.slice(0, 5)}`.toUpperCase() }).select('id').single(), 'Create local maintenance UI fixture');
    gymIds.push(gym.id);
    await page.getByRole('navigation', { name: 'Administración global' }).getByRole('link', { name: 'Mantenimiento', exact: true }).click();
    await page.getByRole('heading', { name: 'Mantenimiento', exact: true }).waitFor();
    await page.getByLabel('Buscar gimnasio o propietario').fill(gymName);
    await page.getByRole('button', { name: `Asignar propietario a ${gymName}`, exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'maintenance-action-title');
    const ownerPicker = page.getByRole('combobox', { name: 'Entrenador independiente', exact: true });
    await ownerPicker.scrollIntoViewIfNeeded();
    await ownerPicker.focus();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    if (name === 'mobile') await ownerPicker.tap(); else await ownerPicker.click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await ownerPicker.getAttribute('aria-expanded'), 'true', `${name}: the owner picker stays open after focus and scroll settle`);
    const ownerOption = page.getByRole('option', { name: new RegExp(coach.name) });
    await ownerOption.waitFor();
    if (name === 'mobile') await ownerOption.tap(); else await ownerOption.click();
    await page.getByRole('button', { name: 'Confirmar asignación', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Se actualizó el propietario' }).waitFor();
    check(checked(await db.from('gyms').select('owner_id').eq('id', gym.id).single(), 'Read UI owner assignment').owner_id === coach.id, `${name}: owner assignment persists through original RPC`);
    await screenshot(page, `maintenance-${name}`);
    await page.getByRole('button', { name: `Eliminar ${gymName}`, exact: true }).click();
    check(await page.getByRole('button', { name: 'Eliminar gimnasio definitivamente' }).isDisabled(), `${name}: deletion requires the exact gym name`);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    check(checked(await db.from('gyms').select('id').eq('id', gym.id), 'Read cancelled deletion').length === 1, `${name}: cancelling deletion preserves the gym`);
    await page.getByRole('button', { name: `Eliminar ${gymName}`, exact: true }).click();
    await page.locator('#gym-deletion-confirmation').fill(gymName);
    await screenshot(page, `maintenance-confirmation-${name}`);
    await page.getByRole('button', { name: 'Eliminar gimnasio definitivamente' }).click();
    await page.getByRole('status').filter({ hasText: 'Se eliminó el gimnasio' }).waitFor();
    check(checked(await db.from('gyms').select('id').eq('id', gym.id), 'Read confirmed UI deletion').length === 0, `${name}: confirmed deletion completes`);
    await setup.context.close();
  }
  const denied = await context(coach, { width: 1280, height: 800 });
  const page = await denied.context.newPage();
  for (const path of ['/admin/announcements', '/admin/activity', '/admin/maintenance']) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForURL(url => url.pathname === '/dashboard');
    check(await page.getByRole('navigation', { name: 'Administración global' }).count() === 0, `${path}: a coach with admin metadata cannot enter`);
  }
  await denied.context.close();
  check(errors.length === 0, 'No uncaught browser exceptions');
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${root}/docs/qa/admin-controls-failure.png`, fullPage: true, timeout: 3000 }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) server.kill('SIGTERM');
  if (gymIds.length) checked(await db.from('gyms').delete().in('id', gymIds), 'Clean UI gyms');
  if (users.length) {
    checked(await db.from('coach_announcements').delete().in('created_by', users), 'Clean UI announcements');
    checked(await db.from('activity_logins').delete().in('user_id', users), 'Clean UI activity');
    checked(await db.from('coaches').delete().in('id', users), 'Clean UI profiles');
    for (const id of users) { const result = await db.auth.admin.deleteUser(id); if (result.error && result.error.status !== 404) throw result.error; }
  }
}
console.log(`Original admin controls UI: ${checks.length} checks passed on desktop/mobile; local fixtures removed.`);
