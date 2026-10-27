import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Only synthetic, run-owned clients/memberships/measurements may be written.
// Persistent demo and manually added business rows are snapshotted in full.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted targets are unsupported.');
assert.equal(process.env.ORIGINAL_MEASUREMENT_PARITY_LOCAL, '1', 'Coordinate the local measurement regression before execution.');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--focus'), 'Usage: original-measurement-parity-check.mjs [--focus independent|gym|admin]');
const focus = args[1] || 'all';
assert.ok(['all', 'independent', 'gym', 'admin'].includes(focus), 'Unknown measurement surface.');
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
const prefix = `original-measurement-parity-${randomBytes(7).toString('hex')}`;
const artifacts = process.env.ORIGINAL_MEASUREMENT_PARITY_ARTIFACTS || `/tmp/coachfitflow-${prefix}`;
assert.ok(artifacts.startsWith('/tmp/'), 'Artifacts must stay outside the repository.');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);

const businessTables = [
  'coaches', 'gyms', 'gym_staff', 'membership_plans', 'clients', 'client_gym_memberships',
  'payments', 'exercises', 'routines', 'routine_days', 'routine_day_exercises',
  'routine_week_configs', 'routine_warmup_exercises', 'measurements', 'client_portal_access',
  'competitor_sheets', 'independent_client_portal_access', 'training_sessions', 'training_session_sets'
];
// Deliberately independent from the implementation's shared field definitions.
const fields = [
  ['weight', 'weight', 'Peso (kg)', 79.6, 81.2],
  ['height', 'height', 'Altura (cm)', 176.3, 177.4],
  ['bodyFatPercentage', 'body_fat_percentage', '% Grasa Corporal', 19.3, 18.7],
  ['muscleMass', 'muscle_mass', 'Masa Muscular (kg)', 51.7, 52.4],
  ['visceralFat', 'visceral_fat', 'Grasa Visceral', 7, 6],
  ['metabolicAge', 'metabolic_age', 'Edad Metabólica', 34, 33],
  ['calories', 'calories', 'Calorías', 2140, 2200],
  ['boneMass', 'bone_mass', 'Masa Ósea (kg)', 3.4, 3.5],
  ['waterPercentage', 'water_percentage', '% Agua Corporal', 58.2, 59.1],
  ['calf', 'calf', 'Pantorrilla', 37.2, 37.6],
  ['thigh', 'thigh', 'Cuádriceps', 55.3, 55.8],
  ['hips', 'hips', 'Glúteos / Cadera', 99.4, 98.8],
  ['waist', 'waist', 'Abdomen', 83.5, 82.7],
  ['chest', 'chest', 'Pecho / Espalda', 102.6, 103.4],
  ['arms', 'arms', 'Bíceps', 33.7, 34.1]
];
const ownClients = new Set(), ownMemberships = new Set(), ownMeasurements = new Set();
const checks = [], browserErrors = [], escapedRequests = [], cleanupErrors = [], writes = [];
let browser, activePage, phase = 'preflight', failure, baseline;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'unknown'})`);
  return result.data;
}
function check(value, label) { assert.ok(value, label); checks.push(label); }
function digest(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
function begin(value) { phase = value; console.log(`Measurement phase: ${value}`); }
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
    name: `Atleta mediciones ${surface} ${prefix.slice(-5)}`, email: `${prefix}-${surface}@example.invalid`,
    birth_date: '1992-06-15', age: 34, weight: 78, height: 176, goal: 'Seguimiento de composición corporal',
    notes: 'Registro efímero para comprobar la paridad del formulario.' }), 'Create run-owned measurement client');
  let membershipId;
  if (surface === 'gym') {
    membershipId = randomUUID(); ownMemberships.add(membershipId);
    checked(await db.from('client_gym_memberships').insert({ id: membershipId, client_id: clientId,
      gym_id: manifest.fixtures.gymId, assigned_coach_id: coach.userId, subscription_status: 'active' }), 'Create run-owned gym membership');
  }
  return { surface, clientId, membershipId, coachId: coach.userId,
    account: manifest.accounts[surface === 'admin' ? 'admin' : surface === 'gym' ? 'owner' : 'coach_standard'],
    url: surface === 'admin' ? `/admin/clients/${coach.userId}/${clientId}`
      : surface === 'gym' ? `/gym/${manifest.fixtures.gymId}/clients/${clientId}?tab=measurements`
        : `/clients/${clientId}?tab=measurements` };
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
    if (url.origin === target.API_URL && url.pathname === '/rest/v1/measurements' && ['POST', 'PATCH', 'DELETE'].includes(request.method())) {
      const payload = request.postDataJSON();
      const clientId = payload?.client_id || url.searchParams.get('client_id')?.replace(/^eq\./, '');
      const measurementId = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (!ownClients.has(clientId) && !ownMeasurements.has(measurementId)) {
        escapedRequests.push('Measurement mutation outside run-owned fixture IDs');
        return route.abort('blockedbyclient');
      }
      writes.push({ method: request.method(), clientId, measurementId });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000); page.setDefaultNavigationTimeout(30_000);
  page.on('pageerror', error => browserErrors.push(error.message));
  activePage = page;
  return { context, page };
}
async function login(page, fixture) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Correo electrónico', { exact: true }).fill(fixture.account.email);
  await page.locator('#password').fill(fixture.account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(url => url.pathname !== '/login');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
  await page.goto(`${base}${fixture.url}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Nueva medición', exact: true }).waitFor();
}
function measurementSection(page, fixture) {
  return fixture.surface === 'admin'
    ? page.locator('app-admin-measurements') : page.locator('#client-measurements-panel');
}
function measurementForm(page, fixture) {
  return fixture.surface === 'admin' ? page.locator('app-admin-measurements form') : page.locator('.editor-dialog form');
}
function control(form, fixture, key) {
  if (key === 'notes') return form.getByLabel('Notas', { exact: true });
  if (fixture.surface !== 'admin') return form.locator(`[id="measurement-${key}"]`);
  const labels = { weight: 'Peso (kg)', height: 'Altura (cm)', bodyFatPercentage: 'Grasa corporal (%)',
    muscleMass: 'Masa muscular (kg)', visceralFat: 'Grasa visceral', metabolicAge: 'Edad metabólica',
    calories: 'Calorías', boneMass: 'Masa ósea (kg)', waterPercentage: 'Agua corporal (%)',
    calf: 'Pantorrilla (cm)', thigh: 'Cuádriceps (cm)', hips: 'Glúteos / Cadera (cm)',
    waist: 'Abdomen (cm)', chest: 'Pecho / Espalda (cm)', arms: 'Bíceps (cm)' };
  return form.getByLabel(labels[key], { exact: true });
}
async function openNew(page, fixture) {
  await measurementSection(page, fixture).getByRole('button', { name: 'Nueva medición', exact: true }).click();
  const form = measurementForm(page, fixture); await form.waitFor(); return form;
}
async function openEdit(page, fixture) {
  await measurementSection(page, fixture).getByRole('button', { name: 'Editar', exact: true }).click();
  const form = measurementForm(page, fixture); await form.waitFor(); return form;
}
async function fillAll(form, fixture, version, notes) {
  for (const [key, , , initial, edited] of fields) await control(form, fixture, key).fill(String(version === 'initial' ? initial : edited));
  await control(form, fixture, 'notes').fill(notes);
}
async function save(page, fixture, form) {
  await form.getByRole('button', { name: 'Guardar medición', exact: true }).click();
  await form.waitFor({ state: 'detached' });
}
async function rowFor(fixture) {
  return checked(await db.from('measurements').select('*').eq('client_id', fixture.clientId).single(), 'Read run-owned measurement');
}
function rowMatches(row, version, notes) {
  return fields.every(([, column, , initial, edited]) => Number(row[column]) === (version === 'initial' ? initial : edited))
    && row.notes === notes;
}
function assertScope(row, fixture, label) {
  check(row.client_id === fixture.clientId && row.client_gym_membership_id === (fixture.membershipId || null), label);
}
async function screenshot(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; });
  const path = `${artifacts}/${name}.png`;
  await page.screenshot({ path, fullPage: true }); await chmod(path, 0o600);
}
async function fieldContract(page, fixture, form) {
  check(await form.locator('input[type="number"]').count() === 15, `${fixture.surface}: exactly the original fifteen numeric inputs`);
  check(await form.locator('input[type="date"], [name="date"], [formcontrolname="date"], [name="legs"], [formcontrolname="legs"]').count() === 0,
    `${fixture.surface}: date and legacy legs are absent from the editing UI`);
  check(await form.locator('details').count() === 0, `${fixture.surface}: optional indicators are not hidden in a disclosure`);
  for (const [key] of fields) assert.ok(await control(form, fixture, key).isVisible(), `${fixture.surface}: ${key} is visible`);
  check(true, `${fixture.surface}: all fifteen indicators are visible`);
  for (const [key, , label] of fields.slice(9)) {
    const text = await control(form, fixture, key).evaluate(node => node.closest('label')?.textContent || document.querySelector(`label[for="${node.id}"]`)?.textContent || '');
    assert.ok(text.includes(label) && text.includes('cm'), `${fixture.surface}: original circumference label ${label}`);
  }
  check(true, `${fixture.surface}: original circumference labels and units`);
  for (const [key] of fields) {
    const actual = Number(await control(form, fixture, key).getAttribute('step'));
    assert.equal(actual, ['visceralFat', 'metabolicAge', 'calories'].includes(key) ? 1 : 0.1, `${fixture.surface}: original step for ${key}`);
  }
  check(true, `${fixture.surface}: original integer/decimal input steps`);
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, `${fixture.surface}-all-fields-mobile`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${fixture.surface}: mobile page has no horizontal overflow`);
  check(await form.evaluate(node => node.scrollWidth <= node.clientWidth + 1), `${fixture.surface}: mobile measurement form has no horizontal overflow`);
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function invalidCases(page, fixture, form) {
  const invalid = [
    ['weight', '', 'required'], ['weight', '19.9', 'minimum'], ['weight', '300.1', 'maximum'],
    ['height', '', 'required'], ['height', '99.9', 'minimum'], ['height', '250.1', 'maximum'],
    ['bodyFatPercentage', '-0.1', 'minimum'], ['bodyFatPercentage', '100.1', 'maximum'],
    ['muscleMass', '-0.1', 'minimum'], ['visceralFat', '-1', 'minimum'],
    ['metabolicAge', '9', 'minimum'], ['metabolicAge', '101', 'maximum'], ['calories', '-1', 'minimum'],
    ['boneMass', '-0.1', 'minimum'], ['waterPercentage', '-0.1', 'minimum'], ['waterPercentage', '100.1', 'maximum'],
    ...fields.slice(9).map(([key]) => [key, '-0.1', 'minimum'])
  ];
  for (const [key, value, reason] of invalid) {
    await fillAll(form, fixture, 'initial', `${prefix} validation`);
    const input = control(form, fixture, key);
    await input.fill(value); await input.blur();
    await eventually(() => input.getAttribute('class'), value => value?.includes('ng-invalid'), `${fixture.surface}: ${key} was not marked invalid`);
    const count = writes.length;
    const submit = form.getByRole('button', { name: 'Guardar medición', exact: true });
    if (await submit.isEnabled()) await submit.click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check(writes.length === count && await form.isVisible(), `${fixture.surface}: ${key} ${reason} blocks a backend write`);
    const describedBy = await input.getAttribute('aria-describedby');
    assert.ok(describedBy, `${fixture.surface}: invalid field is associated with its error`);
    const message = form.locator(`[id="${describedBy}"]`);
    assert.ok(await message.isVisible() && (await message.textContent()).trim().length > 0,
      `${fixture.surface}: ${key} displays its associated validation error`);
  }
  await fillAll(form, fixture, 'initial', `${prefix} all indicators`);
}
async function foreignRls(fixture, row) {
  const other = manifest.accounts[fixture.surface === 'gym' ? 'owner_second' : 'coach_pro'];
  const api = createClient(target.API_URL, target.ANON_KEY, clientOptions);
  checked(await api.auth.signInWithPassword({ email: other.email, password: other.password }), 'Sign in unrelated local coach for RLS');
  try {
    const before = digest(row);
    check(checked(await api.from('measurements').select('id').eq('id', row.id), 'Read another coach measurement').length === 0,
      `${fixture.surface}: unrelated coach cannot read the measurement through RLS`);
    const attempted = await api.from('measurements').update({ notes: `${prefix} forbidden` }).eq('id', row.id).select('id');
    check((!!attempted.error || attempted.data?.length === 0) && digest(await rowFor(fixture)) === before,
      `${fixture.surface}: unrelated coach cannot change the measurement through RLS`);
  } finally { await api.auth.signOut(); }
}
async function backendFailure(page, context, fixture, form, id) {
  const notes = `${prefix} retry preserves draft`, original = await rowFor(fixture);
  await control(form, fixture, 'weight').fill('82.4');
  await control(form, fixture, 'notes').fill(notes);
  let injected = false;
  const matcher = `${target.API_URL}/rest/v1/measurements?**`;
  const handler = async route => {
    const request = route.request(), url = new URL(request.url());
    if (!injected && request.method() === 'PATCH' && url.searchParams.get('id') === `eq.${id}`) {
      assert.ok(ownMeasurements.has(id), 'The error injection must target a run-owned measurement.');
      injected = true;
      return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': base },
        body: JSON.stringify({ code: 'PT503', message: 'Synthetic one-shot local regression failure' }) });
    }
    return route.fallback();
  };
  await context.route(matcher, handler);
  try {
    await form.getByRole('button', { name: 'Guardar medición', exact: true }).click();
    await eventually(() => form.getByRole('button', { name: 'Guardar medición', exact: true }).isEnabled(), value => injected && value, 'The failed save did not return to an editable form');
    check(await form.isVisible() && await control(form, fixture, 'weight').inputValue() === '82.4'
      && await control(form, fixture, 'notes').inputValue() === notes && digest(await rowFor(fixture)) === digest(original),
      `${fixture.surface}: failed backend save preserves the draft and stored measurement`);
    const inlineError = (fixture.surface === 'admin' ? measurementSection(page, fixture) : form)
      .locator('[role="alert"], .form-error, .admin-feedback.error, .measurement-error, .measurement-server-error');
    await inlineError.filter({ hasText: /guardar|inténtalo|error/i }).first().waitFor();
    check(await inlineError.count() > 0 && await inlineError.filter({ hasText: /guardar|inténtalo|error/i }).count() > 0,
      `${fixture.surface}: failed backend save displays an inline error`);
    await screenshot(page, `${fixture.surface}-retry-error`);
  } finally { await context.unroute(matcher, handler); }
  await save(page, fixture, form);
  const retried = await rowFor(fixture);
  check(Number(retried.weight) === 82.4 && retried.notes === notes, `${fixture.surface}: retry persists the preserved draft`);
}
async function surface(surface) {
  begin(surface);
  const fixture = await makeFixture(surface);
  const { page, context } = await newPage();
  try {
    await login(page, fixture);
    let form = await openNew(page, fixture);
    await fieldContract(page, fixture, form);
    await invalidCases(page, fixture, form);
    const notes = `${prefix} all indicators`;
    await fillAll(form, fixture, 'initial', notes);
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    await save(page, fixture, form);
    let row = await rowFor(fixture); ownMeasurements.add(row.id);
    check(rowMatches(row, 'initial', notes), `${surface}: creation persists all fifteen numeric fields and notes`);
    check(row.date === today, `${surface}: creation uses the current local calendar date without an input`);
    check(Number(row.bmi) === Number((79.6 / ((176.3 / 100) ** 2)).toFixed(1)), `${surface}: BMI uses the original one-decimal calculation`);
    assertScope(row, fixture, `${surface}: creation preserves the intended independent/gym scope`);
    await foreignRls(fixture, row);

    checked(await db.from('measurements').update({ date: '2024-02-03', legs: 63.2 }).eq('id', row.id).eq('client_id', fixture.clientId), 'Prepare run-owned historical date and hidden legacy legs');
    // Load the historical fixture into the editor; do not test a concurrent
    // out-of-band change against a deliberately stale browser copy.
    await page.reload({ waitUntil: 'networkidle' });
    await measurementSection(page, fixture).getByRole('button', { name: 'Editar', exact: true }).waitFor();
    form = await openEdit(page, fixture);
    await fillAll(form, fixture, 'edited', `${prefix} edited indicators`);
    await save(page, fixture, form);
    row = await rowFor(fixture);
    check(rowMatches(row, 'edited', `${prefix} edited indicators`), `${surface}: editing persists all fifteen numeric fields and notes`);
    check(row.date === '2024-02-03' && Number(row.legs) === 63.2, `${surface}: editing preserves the historical date and hidden legacy legs`);
    assertScope(row, fixture, `${surface}: editing retains the measurement scope`);

    form = await openEdit(page, fixture);
    for (const [key] of fields.slice(2)) await control(form, fixture, key).fill(['metabolicAge', 'muscleMass'].includes(key) ? '' : '0');
    await control(form, fixture, 'notes').fill('');
    await save(page, fixture, form);
    row = await rowFor(fixture);
    check(fields.slice(2).every(([key, column]) => ['metabolicAge', 'muscleMass'].includes(key) ? row[column] === null : row[column] !== null && Number(row[column]) === 0)
      && row.notes === null, `${surface}: optional zero values persist and cleared values become null`);
    check(row.date === '2024-02-03' && Number(row.legs) === 63.2, `${surface}: zero/nullable editing retains hidden legacy values`);
    form = await openEdit(page, fixture);
    await backendFailure(page, context, fixture, form, row.id);
    await page.reload({ waitUntil: 'networkidle' });
    await measurementSection(page, fixture).getByRole('button', { name: 'Editar', exact: true }).waitFor();
    row = await rowFor(fixture);
    check(row.date === '2024-02-03' && Number(row.legs) === 63.2 && row.notes === `${prefix} retry preserves draft`,
      `${surface}: reload preserves saved values and historical hidden fields`);
    if (surface === 'admin') page.once('dialog', dialog => dialog.accept());
    await measurementSection(page, fixture).getByRole('button', { name: 'Eliminar', exact: true }).click();
    if (surface !== 'admin') await page.locator('.confirm-dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await eventually(async () => checked(await db.from('measurements').select('id').eq('id', row.id), 'Read deleted own measurement'), value => value.length === 0, 'Measurement deletion did not persist');
    check(true, `${surface}: confirmed measurement deletion persists`);
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/login');
  } catch (error) {
    await screenshot(page, `${fixture.surface}-failure`).catch(() => {});
    throw error;
  } finally { await context.close(); }
}
async function cleanup() {
  const run = async (label, operation) => { try { checked(await operation(), label); } catch (error) { cleanupErrors.push(error.message); } };
  // IDs are recorded before inserts; no global namespace search or demo deletion.
  if (ownClients.size) await run('Clean only run-owned measurements', () => db.from('measurements').delete().in('client_id', [...ownClients]));
  if (ownMemberships.size) await run('Clean only run-owned memberships', () => db.from('client_gym_memberships').delete().in('id', [...ownMemberships]));
  if (ownClients.size) await run('Clean only run-owned clients', () => db.from('clients').delete().in('id', [...ownClients]));
  const leftovers = ownClients.size ? checked(await db.from('clients').select('id').in('id', [...ownClients]), 'Verify exact client cleanup') : [];
  const measurements = ownClients.size ? checked(await db.from('measurements').select('id').in('client_id', [...ownClients]), 'Verify exact measurement cleanup') : [];
  check(leftovers.length === 0 && measurements.length === 0 && cleanupErrors.length === 0, 'All run-owned clients, memberships and measurements are removed');
}

try {
  assert.ok((await fetch(`${base}/login`)).ok, 'Start the dedicated local-testing frontend before this regression.');
  baseline = await snapshotBusiness();
  await writeFile(`${artifacts}/baseline.json`, JSON.stringify(baseline), { mode: 0o600 });
  browser = await chromium.launch();
  for (const name of ['independent', 'gym', 'admin']) if (focus === 'all' || focus === name) await surface(name);
  check(browserErrors.length === 0, 'No uncaught browser errors');
  check(escapedRequests.length === 0, 'No off-origin, hosted or out-of-fixture browser requests');
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) {
    const path = `${artifacts}/failure.png`;
    await activePage.screenshot({ path, fullPage: true, timeout: 5000 }).then(() => chmod(path, 0o600)).catch(() => {});
  }
} finally {
  try { await browser?.close(); } catch (error) { cleanupErrors.push(`Browser close: ${error.message}`); failure ||= error; }
  try { await cleanup(); } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  try {
    if (baseline) {
      const after = await snapshotBusiness();
      const changed = businessTables.filter(table => digest(after[table]) !== digest(baseline[table]));
      if (changed.length) throw new Error(`Existing business data changed in tables: ${changed.join(', ')}`);
      check(true, 'All existing seed and manual business records across nineteen tables remain unchanged');
    }
    check(digest(await readFile(manifestPath)) === digest(manifestBytes), 'Private persistent credentials remain unchanged');
  } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ ok: !failure, focus, phase, checks, browserErrors, escapedRequests,
    cleanupErrors, preservedTables: businessTables, baselineCounts: baseline && Object.fromEntries(businessTables.map(table => [table, baseline[table].length])),
    failure: failure?.message }, null, 2), { mode: 0o600 });
}
if (failure) throw new Error(`Measurement parity failed during ${phase}: ${failure.message}. Private artifacts: ${artifacts}`);
console.log(`Original measurement parity (${focus}): ${checks.length} checks passed; existing seed/manual data preserved and own fixtures removed. Artifacts: ${artifacts}`);
