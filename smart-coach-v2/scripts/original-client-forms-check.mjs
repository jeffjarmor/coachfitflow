import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Only synthetic, run-owned clients and memberships may be written.
// Persistent demo and manually added business rows are snapshotted in full.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted targets are unsupported.');
assert.equal(process.env.ORIGINAL_CLIENT_FORMS_LOCAL, '1', 'Coordinate the local client form regression before execution.');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--focus'), 'Usage: original-client-forms-check.mjs [--focus independent|gym|admin]');
const focus = args[1] || 'all';
assert.ok(['all', 'independent', 'gym', 'admin'].includes(focus), 'Unknown client surface.');
const base = process.env.ZUMMITH_TEST_URL || 'http://127.0.0.1:4350';
assert.equal(base, 'http://127.0.0.1:4350', 'Use only the dedicated local-testing frontend.');
const manifestPath = process.env.ORIGINAL_DEMO_CREDENTIALS_FILE || `${homedir()}/.local/share/coachfitflow-testing/original-demo-credentials.json`;
assert.equal((await stat(manifestPath)).mode & 0o077, 0, 'The credentials manifest must remain private.');
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.state, 'ready');
assert.equal(manifest.formatVersion, 1);
assert.equal(manifest.fixtureNamespace, 'coachfitflow-original-demo-v1');
assert.equal(manifest.target.apiUrl, 'http://127.0.0.1:55321');
assert.equal(manifest.target.projectId, 'coachfitflow-original-compat');
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, manifest.target.apiUrl);
for (const [key, role] of [[target.ANON_KEY, 'anon'], [target.SERVICE_ROLE_KEY, 'service_role']]) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  assert.ok(claims.role === role && claims.ref !== 'bzhqprxolseyxuuwodqs', 'Only locally issued credentials are supported.');
}
for (const role of ['admin', 'coach_standard', 'coach_pro', 'owner', 'owner_second']) {
  assert.ok(manifest.accounts[role]?.userId && manifest.accounts[role]?.password, `Missing local role ${role}.`);
}
const appRoot = fileURLToPath(new URL('..', import.meta.url));
const environment = await readFile(`${appRoot}/src/environments/environment.local-testing.ts`, 'utf8');
assert.ok(environment.includes(target.API_URL) && environment.includes(base), 'The testing environment must target ports 55321/4350.');
assert.ok(environment.includes(target.ANON_KEY) && !environment.includes(target.SERVICE_ROLE_KEY), 'The browser may contain only the public local key.');
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (input, init) => {
    assert.equal(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).origin, target.API_URL, 'SDK requests must remain local.');
    return fetch(input, init);
  } }
};
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, clientOptions);
const prefix = `original-client-forms-${randomBytes(7).toString('hex')}`;
const artifacts = process.env.ORIGINAL_CLIENT_FORMS_ARTIFACTS || `/tmp/coachfitflow-${prefix}`;
assert.ok(artifacts.startsWith('/tmp/'), 'Artifacts must stay outside the repository.');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);

const businessTables = [
  'coaches', 'gyms', 'gym_staff', 'membership_plans', 'clients', 'client_gym_memberships',
  'payments', 'exercises', 'routines', 'routine_days', 'routine_day_exercises',
  'routine_week_configs', 'routine_warmup_exercises', 'measurements', 'client_portal_access',
  'competitor_sheets', 'independent_client_portal_access', 'training_sessions', 'training_session_sets', 'coach_announcements'
];
const ownClients = new Set(), ownMemberships = new Set();
const checks = [], browserErrors = [], escapedRequests = [], cleanupErrors = [], writes = [];
let browser, phase = 'preflight', failure, baseline;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'unknown'})`);
  return result.data;
}
function check(value, label) { assert.ok(value, label); checks.push(label); }
function digest(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function begin(value) { phase = value; console.log(`Client form phase: ${value}`); }
async function eventually(read, predicate, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(label);
}
async function snapshotBusiness() {
  const snapshot = {};
  for (const table of businessTables) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const page = checked(await db.from(table).select('*').order('id').range(offset, offset + 999), `Snapshot ${table}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    snapshot[table] = rows;
  }
  return snapshot;
}
async function makeFixture(surface) {
  const coach = manifest.accounts[surface === 'gym' ? 'owner' : 'coach_standard'];
  const clientId = randomUUID();
  assert.ok(!baseline.clients.some(row => row.id === clientId), 'New fixture IDs must not overlap existing clients.');
  ownClients.add(clientId);
  checked(await db.from('clients').insert({ id: clientId, primary_coach_id: coach.userId,
    name: `Atleta formularios ${surface} ${prefix.slice(-5).replace(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit)))}`, email: `${prefix}-${surface}@example.invalid`,
    birth_date: '1992-06-15', age: 34, weight: 78, height: 176, goal: 'Seguimiento de composición corporal',
    notes: 'Registro efímero para comprobar valores físicos editables.' }), 'Create run-owned client form fixture');
  let membershipId;
  if (surface === 'gym') {
    membershipId = randomUUID(); ownMemberships.add(membershipId);
    checked(await db.from('client_gym_memberships').insert({ id: membershipId, client_id: clientId,
      gym_id: manifest.fixtures.gymId, assigned_coach_id: coach.userId, subscription_status: 'active' }), 'Create run-owned gym membership');
  }
  return { surface, clientId, membershipId, coachId: coach.userId,
    account: manifest.accounts[surface === 'admin' ? 'admin' : surface === 'gym' ? 'owner' : 'coach_standard'],
    url: surface === 'admin' ? `/admin/clients/${coach.userId}/${clientId}`
      : surface === 'gym' ? `/gym/${manifest.fixtures.gymId}/clients/${clientId}`
        : `/clients/${clientId}` };
}
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Costa_Rica', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (request.headers().apikey === target.SERVICE_ROLE_KEY) {
      escapedRequests.push('Privileged local key attempted in browser');
      return route.abort('blockedbyclient');
    }
    if (![base, target.API_URL].includes(url.origin) && !['data:', 'blob:'].includes(url.protocol)) {
      escapedRequests.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort('blockedbyclient');
    }
    if (url.origin === target.API_URL && url.pathname.startsWith('/rest/v1/') && ['POST', 'PATCH', 'DELETE'].includes(request.method())) {
      const table = url.pathname.split('/').at(-1);
      if (request.method() === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')
        && ['is_admin', 'is_gym_owner', 'can_manage_clients'].includes(table)) return route.continue();
      if (request.method() === 'POST' && table === 'activity_logins'
        && Object.values(manifest.accounts).some(account => account.userId === request.postDataJSON()?.user_id)) return route.continue();
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const clientId = url.searchParams.get('client_id')?.replace(/^eq\./, '');
      const isOwn = request.method() === 'PATCH' && ((table === 'clients' && ownClients.has(id))
        || (table === 'client_gym_memberships' && ownClients.has(clientId)));
      if (!isOwn) { escapedRequests.push(`${request.method()} ${url.pathname}: outside run-owned clients or memberships`); return route.abort('blockedbyclient'); }
      writes.push({ table, id, clientId });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000); page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror', error => browserErrors.push(error.message));
  return { context, page };
}

async function login(page, fixture) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Correo electrónico', { exact: true }).fill(fixture.account.email);
  await page.locator('#password').fill(fixture.account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
}
async function openEditor(page, fixture, legacy = false) {
  await page.goto(`${base}${fixture.url}${legacy ? '/edit' : ''}`, { waitUntil: 'networkidle' });
  if (!legacy) {
    const button = fixture.surface === 'admin' ? page.getByRole('button', { name: 'Editar perfil', exact: true })
      : page.locator('.client-utilities').getByRole('button', { name: 'Editar', exact: true });
    await button.click();
  }
  const form = page.locator(fixture.surface === 'admin' ? 'app-admin-client-detail form' : 'app-client-form form');
  await form.waitFor();
  return form;
}
function control(form, key) { return form.locator(`[formcontrolname="${key}"]`); }
async function fill(form, weight, height, notes) {
  await control(form, 'weight').fill(weight);
  await control(form, 'height').fill(height);
  await control(form, 'notes').fill(notes);
}
async function save(page, fixture, form, retry = false) {
  const button = retry && fixture.surface !== 'admin'
    ? page.getByRole('button', { name: 'Reintentar guardado', exact: true })
    : form.getByRole('button', { name: 'Guardar cambios', exact: true });
  await button.click();
  await form.waitFor({ state: 'detached' });
}
async function rowFor(fixture) {
  return checked(await db.from('clients').select('*').eq('id', fixture.clientId).single(), 'Read own edited client');
}
async function screenshot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
  const path = `${artifacts}/${name}.png`;
  await page.screenshot({ path, fullPage: true }); await chmod(path, 0o600);
}
async function surface(surface) {
  begin(surface);
  const fixture = await makeFixture(surface);
  const { page, context } = await newPage();
  try {
    await login(page, fixture);
    let form = await openEditor(page, fixture);
    check(await control(form, 'weight').inputValue() === '78' && await control(form, 'height').inputValue() === '176', `${surface}: editor loads existing physical values`);
    await fill(form, '79.6', '177.4', `${prefix} decimals`);
    await save(page, fixture, form);
    let row = await rowFor(fixture);
    check(Number(row.weight) === 79.6 && Number(row.height) === 177.4 && row.notes === `${prefix} decimals`, `${surface}: decimal weight and height persist in the original schema`);

    form = await openEditor(page, fixture, true);
    await fill(form, '', '', `${prefix} optional empty`);
    await save(page, fixture, form);
    row = await rowFor(fixture);
    check(row.weight === null && row.height === null && row.notes === `${prefix} optional empty`, `${surface}: clearing optional physical values stores null through the legacy edit route`);

    form = await openEditor(page, fixture);
    const unchanged = await rowFor(fixture);
    await fill(form, '19', '301', `${prefix} invalid`);
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    check(await form.isVisible() && digest(await rowFor(fixture)) === digest(unchanged), `${surface}: out-of-range fields block writes and retain the draft`);
    await form.getByText('El peso debe estar entre 20 y 500 kg.', { exact: true }).waitFor();
    await form.getByText('La altura debe estar entre 50 y 300 cm.', { exact: true }).waitFor();
    check(true, `${surface}: both numeric validation errors are visible`);

    const notes = `${prefix} retry preserves draft`;
    await fill(form, '82.4', '', notes);
    let injected = false;
    const matcher = `${target.API_URL}/rest/v1/clients?*`;
    const handler = async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'PATCH' && url.searchParams.get('id') === `eq.${fixture.clientId}` && !injected) {
        injected = true;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'LOCAL_TEST_FAILURE', message: 'Injected local save failure' }) });
      }
      return route.fallback();
    };
    await context.route(matcher, handler);
    try {
      await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      await eventually(() => form.getByRole('button', { name: 'Guardar cambios', exact: true }).isEnabled(), value => injected && value, 'Failed save did not return to editable state');
      await page.getByRole('alert').filter({ hasText: 'No pudimos guardar' }).waitFor();
      check(await control(form, 'weight').inputValue() === '82.4' && await control(form, 'height').inputValue() === '' && await control(form, 'notes').inputValue() === notes
        && digest(await rowFor(fixture)) === digest(unchanged), `${surface}: rejected backend write preserves every draft field and the stored client`);
      await screenshot(page, `${surface}-save-error-desktop`);
    } finally { await context.unroute(matcher, handler); }
    await save(page, fixture, form, true);
    row = await rowFor(fixture);
    check(Number(row.weight) === 82.4 && row.height === null && row.notes === notes, `${surface}: retry writes the preserved draft without reloading old values`);
    check(row.primary_coach_id === fixture.coachId, `${surface}: original client ownership remains unchanged`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 390, height: 844 });
    form = await openEditor(page, fixture);
    check(await control(form, 'weight').inputValue() === '82.4' && await control(form, 'height').inputValue() === '' && await control(form, 'notes').inputValue() === notes,
      `${surface}: saved values survive a page reload`);
    await screenshot(page, `${surface}-editor-mobile`);
  } catch (error) {
    const path = `${artifacts}/${surface}-failure.png`;
    await page.screenshot({ path, fullPage: true, timeout: 5000 }).then(() => chmod(path, 0o600)).catch(() => {});
    await writeFile(`${artifacts}/${surface}-failure.txt`, await page.locator('body').innerText().catch(() => ''), { mode: 0o600 });
    throw error;
  } finally { await context.close(); }
}
async function cleanup() {
  const run = async (label, operation) => { try { checked(await operation(), label); } catch (error) { cleanupErrors.push(error.message); } };
  if (ownMemberships.size) await run('Clean only run-owned memberships', () => db.from('client_gym_memberships').delete().in('id', [...ownMemberships]));
  if (ownClients.size) await run('Clean only run-owned clients', () => db.from('clients').delete().in('id', [...ownClients]));
  const leftovers = ownClients.size ? checked(await db.from('clients').select('id').in('id', [...ownClients]), 'Verify exact client cleanup') : [];
  const memberships = ownMemberships.size ? checked(await db.from('client_gym_memberships').select('id').in('id', [...ownMemberships]), 'Verify exact membership cleanup') : [];
  check(leftovers.length === 0 && memberships.length === 0 && cleanupErrors.length === 0, 'All run-owned clients and memberships are removed');
}

try {
  assert.ok((await fetch(`${base}/login`)).ok, 'Start local-testing before this regression.');
  baseline = await snapshotBusiness();
  await writeFile(`${artifacts}/baseline.json`, JSON.stringify(baseline), { mode: 0o600 });
  browser = await chromium.launch();
  for (const name of ['independent', 'gym', 'admin']) if (focus === 'all' || focus === name) await surface(name);
  check(browserErrors.length === 0, 'No uncaught browser errors');
  check(escapedRequests.length === 0, 'No off-origin, hosted or out-of-fixture browser requests');
} catch (error) {
  failure = error;
} finally {
  try { await browser?.close(); } catch (error) { cleanupErrors.push(`Browser close: ${error.message}`); failure ||= error; }
  try { await cleanup(); } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  try {
    if (baseline) {
      const after = await snapshotBusiness();
      const changed = businessTables.filter(table => digest(after[table]) !== digest(baseline[table]));
      if (changed.length) throw new Error(`Existing business data changed in tables: ${changed.join(', ')}`);
      check(true, 'All existing seed and manual business rows across twenty tables remain unchanged');
    }
    check(digest(await readFile(manifestPath)) === digest(manifestBytes), 'Private persistent credentials remain unchanged');
  } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ ok: !failure, focus, phase, checks, browserErrors, escapedRequests,
    cleanupErrors, writes, preservedTables: businessTables, baselineCounts: baseline && Object.fromEntries(businessTables.map(table => [table, baseline[table].length])),
    failure: failure?.message }, null, 2), { mode: 0o600 });
}
if (failure) throw new Error(`Client forms failed during ${phase}: ${failure.message}. Private artifacts: ${artifacts}`);
console.log(`Original client forms (${focus}): ${checks.length} checks passed; existing seed/manual data preserved and own fixtures removed. Artifacts: ${artifacts}`);
