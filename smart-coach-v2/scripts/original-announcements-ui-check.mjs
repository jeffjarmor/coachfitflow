import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Existing synthetic accounts, real UI login and original-schema RLS only.
// Root coordinates this opt-in suite after other local mutation checks.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted targets are unsupported.');
assert.equal(process.env.ORIGINAL_ANNOUNCEMENTS_UI_LOCAL, '1', 'Coordinate local suites before enabling announcements UI checks.');
const base = 'http://127.0.0.1:4350';
const apiUrl = 'http://127.0.0.1:55321';
const manifestPath = process.env.ORIGINAL_DEMO_CREDENTIALS_FILE || `${homedir()}/.local/share/coachfitflow-testing/original-demo-credentials.json`;
const statusPath = process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json';
for (const filename of [manifestPath, statusPath]) assert.equal((await stat(filename)).mode & 0o077, 0, 'Credential files must be private.');
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const target = JSON.parse(await readFile(statusPath, 'utf8'));
assert.equal(manifest.fixtureNamespace, 'coachfitflow-original-demo-v1');
assert.equal(manifest.state, 'ready');
assert.equal(manifest.target.projectId, 'coachfitflow-original-compat');
assert.equal(manifest.target.apiUrl, apiUrl);
assert.equal(target.API_URL, apiUrl);
for (const [key, role] of [[target.ANON_KEY, 'anon'], [target.SERVICE_ROLE_KEY, 'service_role']]) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  assert.ok(claims.role === role && claims.ref !== 'bzhqprxolseyxuuwodqs', 'Only local fixture credentials are supported.');
}
const environment = await readFile(new URL('../src/environments/environment.local-testing.ts', import.meta.url), 'utf8');
assert.ok(environment.includes(apiUrl) && environment.includes(base) && environment.includes('zummith-v2-testing-auth'));
assert.ok(environment.includes(target.ANON_KEY) && !environment.includes(target.SERVICE_ROLE_KEY));
const allowed = new Set([base, apiUrl]);
async function localFetch(input, init) {
  assert.ok(allowed.has(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).origin), 'A request tried to leave the original local clone.');
  return fetch(input, { ...init, redirect: 'manual' });
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch } };
const db = createClient(apiUrl, target.SERVICE_ROLE_KEY, options);
const admin = manifest.accounts.admin, standard = manifest.accounts.coach_standard, pro = manifest.accounts.coach_pro;
for (const account of [admin, standard, pro]) assert.ok(account?.userId && account.email && account.password, 'Persistent synthetic accounts must be ready.');
const suffix = randomBytes(8).toString('hex');
const prefix = `Aviso de seguimiento ${suffix}`;
const artifacts = `/tmp/coachfitflow-announcements-ui-${suffix}`;
const ownIds = new Set(), sdkClients = [], contexts = [], checks = [], errors = [], hostedRequests = [], cleanupErrors = [];
const fixtureAuthors = [admin.userId, standard.userId, pro.userId];
let browser, activePage, baseline, failure, phase = 'preflight';
const checked = (result, label) => { if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'unknown'})`); return result.data; };
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
const begin = label => { phase = label; console.log(`Announcements UI: ${label}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);

async function snapshotAnnouncements() {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = checked(await db.from('coach_announcements').select('*').order('id').range(offset, offset + 999), 'Snapshot local announcements');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
async function sdkLogin(account) {
  const client = createClient(apiUrl, target.ANON_KEY, options);
  const identity = checked(await client.auth.signInWithPassword({ email: account.email, password: account.password }), 'Sign in fixture API account');
  assert.equal(identity.user.id, account.userId);
  sdkClients.push(client);
  return client;
}
async function newPage(viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, timezoneId: 'America/Costa_Rica', reducedMotion: 'reduce' });
  contexts.push(context);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (allowed.has(url.origin) || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    if (url.hostname.endsWith('.supabase.co')) hostedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror', error => errors.push(error.message));
  activePage = page;
  return page;
}
async function login(page, account, label) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.locator('#password').fill(account.password);
  const response = page.waitForResponse(result => result.url().startsWith(`${apiUrl}/auth/v1/token`) && result.request().method() === 'POST');
  const [authenticated] = await Promise.all([response, page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()]);
  assert.equal((await authenticated.json()).user.id, account.userId);
  await page.waitForURL(url => url.pathname !== '/login');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
  check(await page.evaluate(() => localStorage.getItem('zummith-auth')) === null, `${label}: real local login does not create a production session key`);
}
async function choose(page, name, option) {
  const trigger = page.getByRole('combobox', { name, exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
const row = (page, title) => page.getByRole('article', { name: title, exact: true });
const status = (page, message) => page.getByRole('status').filter({ hasText: message }).waitFor();
async function screenshot(page, label) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo({ top: 0, behavior: 'instant' }); });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
  const filename = `${artifacts}/${label}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  await chmod(filename, 0o600);
}
async function savedRow(title) {
  const result = checked(await db.from('coach_announcements').select('*').eq('title', title).eq('created_by', admin.userId).single(), 'Read run-owned announcement');
  assert.ok(result.title.startsWith(prefix));
  ownIds.add(result.id);
  return result;
}
async function dashboard(page, expectations, label) {
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /^Hola,/ }).waitFor();
  await page.locator('.metrics > a > strong').first().waitFor();
  for (const [title, visible] of expectations) {
    const announcement = page.locator('.announcements article').filter({ has: page.getByText(title, { exact: true }) });
    if (visible) await announcement.waitFor();
    else assert.equal(await announcement.count(), 0, `${label}: ${title} must stay hidden`);
    check(true, `${label}: ${visible ? 'shows' : 'hides'} the intended announcement`);
  }
}
async function closePage(page) {
  if (!page.isClosed() && await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).count()) {
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/login');
  }
  await page.context().close();
}

try {
  assert.ok((await localFetch(`${base}/login`)).ok, 'Root must start the dedicated local-testing frontend.');
  baseline = await snapshotAnnouncements();
  assert.ok(baseline.every(item => !item.title.startsWith(prefix)), 'The run namespace must be new.');
  const profiles = checked(await db.from('coaches').select('id,role,account_type,coach_plan,next_plan_payment_date').in('id', fixtureAuthors), 'Check real fixture roles');
  assert.equal(profiles.find(item => item.id === admin.userId)?.role, 'admin');
  assert.equal(profiles.find(item => item.id === standard.userId)?.coach_plan, 'standard');
  const proProfile = profiles.find(item => item.id === pro.userId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date());
  assert.ok(proProfile?.account_type === 'independent' && proProfile.coach_plan === 'paid' && proProfile.next_plan_payment_date >= today, 'Use the existing active Pro account without changing its plan.');
  const denied = await sdkLogin(standard);
  const publisher = await sdkLogin(admin);
  browser = await chromium.launch();
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    begin(`${device}: real admin and coach logins`);
    const page = await newPage(viewport), standardPage = await newPage(viewport), proPage = await newPage(viewport);
    await login(page, admin, `${device}/admin`);
    await login(standardPage, standard, `${device}/standard`);
    await login(proPage, pro, `${device}/Pro`);
    activePage = page;
    await page.goto(`${base}/admin/announcements`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Anuncios para entrenadores', exact: true }).waitFor();
    const title = `${prefix} ${device}`;
    await page.getByLabel('Título', { exact: true }).fill(title);
    await page.getByLabel('Mensaje', { exact: true }).fill('Información del seguimiento semanal.');
    await page.getByLabel(/^Orden de aparición/).fill('3');
    await page.getByLabel('Desde', { exact: true }).fill('2099-10-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2026-10-01');
    await page.getByRole('button', { name: 'Crear anuncio', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'La fecha final debe ser igual o posterior' }).waitFor();
    check((await db.from('coach_announcements').select('id').eq('title', title)).data?.length === 0, `${device}: reversed dates never create a record`);
    await page.getByLabel('Desde', { exact: true }).fill('2026-10-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2099-10-31');
    await page.getByRole('button', { name: 'Crear anuncio', exact: true }).click();
    await status(page, 'Anuncio guardado correctamente.');
    const created = await savedRow(title);
    check(created.audience === 'all' && created.active && created.sort_order === 3, `${device}: admin creates the original announcement fields`);
    await dashboard(standardPage, [[title, true]], `${device}/standard/all`);
    await dashboard(proPage, [[title, true]], `${device}/Pro/all`);

    begin(`${device}: edit and segment audiences`);
    await row(page, title).getByRole('button', { name: `Editar ${title}`, exact: true }).click();
    await page.getByLabel('Mensaje', { exact: true }).fill('Actualización para entrenadores Pro.');
    await choose(page, 'Dirigido a', 'Entrenadores Pro');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await status(page, 'Anuncio guardado correctamente.');
    check((await savedRow(title)).audience === 'paid', `${device}: editing preserves the original paid audience value`);
    await dashboard(standardPage, [[title, false]], `${device}/standard/paid`);
    await dashboard(proPage, [[title, true]], `${device}/Pro/paid`);
    await row(page, title).getByRole('button', { name: `Desactivar ${title}`, exact: true }).click();
    await status(page, 'Anuncio desactivado correctamente.');
    check(!(await savedRow(title)).active, `${device}: admin deactivates the announcement`);
    await dashboard(proPage, [[title, false]], `${device}/Pro/deactivated`);
    await row(page, title).getByRole('button', { name: `Publicar ${title}`, exact: true }).click();
    await status(page, 'Anuncio activado correctamente.');
    await dashboard(proPage, [[title, true]], `${device}/Pro/published`);
    await row(page, title).getByRole('button', { name: `Editar ${title}`, exact: true }).click();
    await choose(page, 'Dirigido a', 'Entrenadores estándar');
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await status(page, 'Anuncio guardado correctamente.');
    await dashboard(standardPage, [[title, true]], `${device}/standard/standard`);
    await dashboard(proPage, [[title, false]], `${device}/Pro/standard`);
    await screenshot(page, `announcements-${device}`);
    await screenshot(standardPage, `standard-dashboard-${device}`);

    begin(`${device}: RLS and route permissions`);
    const prior = await savedRow(title);
    const unauthorizedInsert = await denied.from('coach_announcements').insert({ title: `${prefix} denied ${device}`, message: 'Unauthorized attempt', audience: 'all', active: true, created_by: standard.userId }).select('id');
    check(!!unauthorizedInsert.error, `${device}: the real coach cannot create announcements through REST`);
    for (const operation of ['update', 'delete']) {
      const query = operation === 'update' ? denied.from('coach_announcements').update({ message: 'Unauthorized change' }) : denied.from('coach_announcements').delete();
      const result = await query.eq('id', prior.id).select('id');
      check(!!result.error || result.data?.length === 0, `${device}: RLS denies the real coach ${operation}`);
    }
    assert.deepEqual(await savedRow(title), prior, 'Denied operations must preserve the original row.');
    await standardPage.goto(`${base}/admin/announcements`, { waitUntil: 'networkidle' });
    await standardPage.waitForURL(url => url.pathname === '/dashboard');
    check(await standardPage.getByRole('navigation', { name: 'Administración global' }).count() === 0, `${device}: non-admin cannot enter announcement administration`);

    begin(`${device}: schedule boundary and filters`);
    const now = Date.now();
    checked(await publisher.from('coach_announcements').update({ starts_at: new Date(now + 6000).toISOString(), ends_at: new Date(now + 8500).toISOString() }).eq('id', prior.id).eq('title', title).select('id').single(), 'Schedule only the run-owned announcement');
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await row(page, title).locator('.admin-pill').filter({ hasText: 'Programado' }).waitFor();
    await choose(page, 'Estado del anuncio', 'Publicados');
    await row(page, title).waitFor({ state: 'hidden' });
    await row(page, title).waitFor({ state: 'visible' });
    check(await row(page, title).locator('.admin-pill').textContent() === 'Publicado', `${device}: published filter updates at the actual start without a reload`);
    await row(page, title).waitFor({ state: 'hidden' });
    await choose(page, 'Estado del anuncio', 'Vencidos');
    await row(page, title).locator('.admin-pill').filter({ hasText: 'Vencido' }).waitFor();
    check(true, `${device}: expiration updates the state and filters without a reload`);
    await choose(page, 'Estado del anuncio', 'Todos los estados');

    begin(`${device}: confirmed deletion`);
    page.once('dialog', dialog => dialog.dismiss());
    await row(page, title).getByRole('button', { name: `Eliminar ${title}`, exact: true }).click();
    check((await savedRow(title)).id === prior.id, `${device}: cancelling deletion preserves the announcement`);
    page.once('dialog', dialog => dialog.accept());
    await row(page, title).getByRole('button', { name: `Eliminar ${title}`, exact: true }).click();
    await status(page, 'Anuncio eliminado correctamente.');
    check(checked(await db.from('coach_announcements').select('id').eq('id', prior.id), 'Verify UI deletion').length === 0, `${device}: admin confirms and deletes the intended announcement`);
    await closePage(page);
    await closePage(standardPage);
    await closePage(proPage);
  }
  check(hostedRequests.length === 0, 'The app never attempts to contact a hosted Supabase project');
  check(errors.length === 0, 'No uncaught browser errors');
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) {
    const filename = `${artifacts}/failure.png`;
    await activePage.screenshot({ path: filename, fullPage: true, timeout: 3000 }).then(() => chmod(filename, 0o600)).catch(() => {});
  }
} finally {
  const attempt = async (label, action) => { try { await action(); } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); } };
  await attempt('Close browser', async () => browser?.close());
  for (const client of sdkClients) await attempt('Close own API session', async () => checked(await client.auth.signOut({ scope: 'local' }), 'Close run session'));
  await attempt('Discover only own announcement rows', async () => {
    const rows = checked(await db.from('coach_announcements').select('id,title,created_by').like('title', `${prefix}%`).in('created_by', fixtureAuthors), 'Discover run namespace');
    for (const item of rows) { assert.ok(item.title.startsWith(prefix) && fixtureAuthors.includes(item.created_by)); ownIds.add(item.id); }
  });
  if (ownIds.size) await attempt('Remove only own announcement rows', async () => checked(await db.from('coach_announcements').delete().in('id', [...ownIds]).like('title', `${prefix}%`).in('created_by', fixtureAuthors), 'Clean run announcements'));
  if (baseline) await attempt('Verify persistent announcements', async () => assert.deepEqual(await snapshotAnnouncements(), baseline, 'Persistent announcements must remain byte-for-byte unchanged.'));
  await attempt('Verify private credentials unchanged', async () => assert.equal(digest(await readFile(manifestPath)), digest(manifestBytes), 'Persistent credentials must not change.'));
  if (cleanupErrors.length && !failure) failure = new Error('Announcement fixture cleanup needs review.');
  const report = { passed: !failure, phase, checks, browserErrors: errors, hostedRequests, cleanupErrors, artifacts, failure: failure?.message || null };
  await writeFile(`${artifacts}/report.json`, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await chmod(`${artifacts}/report.json`, 0o600);
}
console.log(`Announcements UI: ${checks.length} checks; ${failure ? 'FAILED' : 'passed'}; private report: ${artifacts}/report.json`);
if (failure) throw new Error(`Announcements UI failed during ${phase}. Review the private report.`);
