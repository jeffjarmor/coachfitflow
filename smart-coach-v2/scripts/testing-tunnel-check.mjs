import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, stat, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

// Password-only HTTPS smoke for the public tunnel into the synthetic local copy.
// No fixture creation, manual data writes, service-role key or browser-session injection.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted backend modes are unsupported.');
const publicUrl = new URL(process.argv[2] || process.env.ZUMMITH_TUNNEL_URL || 'invalid:');
assert.equal(publicUrl.protocol, 'https:', 'Provide the real HTTPS tunnel URL.');
assert.match(publicUrl.hostname, /^[a-z0-9-]+\.trycloudflare\.com$/, 'Only the temporary Cloudflare testing tunnel is supported.');
assert.ok(!publicUrl.username && !publicUrl.password && !publicUrl.port && publicUrl.pathname === '/' && !publicUrl.search && !publicUrl.hash,
  'Provide a plain tunnel origin without credentials, port or path.');
const origin = publicUrl.origin;
const apiPrefix = `${origin}/supabase/`;
const tunnelEnvironment = await readFile(new URL('../src/environments/environment.local-testing-tunnel.ts', import.meta.url), 'utf8');
const publicKey = tunnelEnvironment.match(/publishableKey:\s*'([^']+)'/)?.[1];
assert.ok(publicKey, 'The local tunnel public key is required.');
const publicClaims = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString());
assert.ok(publicClaims.role === 'anon' && publicClaims.ref !== 'bzhqprxolseyxuuwodqs', 'Only the public local anon key may be sent to the tunnel.');
const manifestPath = process.env.ORIGINAL_DEMO_CREDENTIALS_FILE || `${homedir()}/.local/share/coachfitflow-testing/original-demo-credentials.json`;
assert.equal((await stat(manifestPath)).mode & 0o077, 0, 'The demo credentials file must remain private.');
const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.formatVersion, 1);
assert.equal(manifest.fixtureNamespace, 'coachfitflow-original-demo-v1');
assert.equal(manifest.state, 'ready');
assert.equal(manifest.target.apiUrl, 'http://127.0.0.1:55321');
assert.equal(manifest.target.projectId, 'coachfitflow-original-compat');
const roles = ['coach_standard', 'owner', 'independent_client', 'gym_client'];
for (const role of roles) assert.ok(manifest.accounts[role]?.userId && manifest.accounts[role].password?.length >= 8, `Missing testing role ${role}.`);
const artifacts = process.env.TESTING_TUNNEL_ARTIFACTS || `/tmp/coachfitflow-testing-tunnel-${randomUUID()}`;
assert.ok(artifacts.startsWith('/tmp/'), 'Keep screenshots and reports outside the repository.');
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);
const checks = [], pageErrors = [], forbiddenRequests = [], apiErrors = [], networkFailures = [], apiReads = [], cleanupErrors = [];
let browser, activePage, activeRole = '', failure;

function check(condition, label) { assert.ok(condition, label); checks.push(label); }
function safeRequest(url, method = '') {
  const parsed = new URL(url);
  return { method, origin: parsed.origin, path: parsed.pathname };
}
function forbidden(url, method) {
  const info = safeRequest(url, method), parsed = new URL(url);
  const loopback = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(parsed.hostname)
    || parsed.hostname.endsWith('.localhost') || /^127\./.test(parsed.hostname);
  forbiddenRequests.push({ ...info, kind: loopback ? 'loopback' : parsed.hostname.endsWith('.supabase.co') ? 'hosted-supabase' : 'unexpected-origin-or-api-path' });
}
async function screenshot(page, label) {
  await page.evaluate(async () => { await document.fonts.ready; });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label}: no horizontal overflow`);
  const path = `${artifacts}/${label}.png`;
  await page.screenshot({ path, fullPage: true, timeout: 15_000 });
  await chmod(path, 0o600);
}
async function contextFor(role) {
  const portal = role.endsWith('_client');
  const context = await browser.newContext({ viewport: portal ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    hasTouch: portal, timezoneId: 'America/Costa_Rica', reducedMotion: 'reduce', serviceWorkers: 'block' });
  context.setDefaultTimeout(45_000);
  context.setDefaultNavigationTimeout(60_000);
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
    const bareApi = /^\/(?:auth|rest|storage|realtime|functions)\/v1(?:\/|$)/.test(url.pathname);
    if (url.origin !== origin || bareApi) {
      forbidden(request.url(), request.method());
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.routeWebSocket('**', socket => {
    const url = new URL(socket.url());
    if (url.protocol === 'wss:' && url.hostname === publicUrl.hostname && !url.port && url.pathname.startsWith('/supabase/')) return socket.connectToServer();
    forbidden(socket.url(), 'WEBSOCKET');
    return socket.close();
  });
  context.on('page', page => {
    page.on('pageerror', error => pageErrors.push({ role, message: error.message }));
    page.on('response', response => {
      if (!response.url().startsWith(apiPrefix)) return;
      const entry = { role, ...safeRequest(response.url(), response.request().method()), status: response.status() };
      if (response.status() >= 400) apiErrors.push(entry);
      if (response.request().method() === 'GET' && response.url().includes('/rest/v1/')) apiReads.push(entry);
    });
    page.on('requestfailed', request => {
      const error = request.failure()?.errorText || '';
      if (request.url().startsWith(apiPrefix) && error !== 'net::ERR_ABORTED') networkFailures.push({ role, ...safeRequest(request.url(), request.method()), error });
    });
  });
  return context;
}
async function login(page, role) {
  const account = manifest.accounts[role];
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Correo electrónico', { exact: true }).fill(account.email);
  await page.locator('#password').fill(account.password);
  await Promise.all([
    page.waitForResponse(response => response.url().startsWith(`${apiPrefix}auth/v1/token`) && response.request().method() === 'POST' && response.ok()),
    page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  ]);
  await page.waitForURL(url => url.origin === origin && url.pathname !== '/login');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
  check(new URL(page.url()).pathname.startsWith('/client/') === role.endsWith('_client'), `${role}: password login reaches the correct workspace over HTTPS`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).waitFor();
  check(await page.evaluate(({ expectedUserId }) => {
    const stored = JSON.parse(localStorage.getItem('zummith-v2-tunnel-auth') || 'null');
    return stored?.user?.id === expectedUserId && !localStorage.getItem('zummith-auth') && !localStorage.getItem('zummith-v2-testing-auth');
  }, { expectedUserId: account.userId }), `${role}: reload retains only its isolated tunnel session`);
}
async function readScope(page, role) {
  if (role === 'coach_standard' || role === 'owner') {
    const path = role === 'owner' ? `/gym/${manifest.fixtures.gymId}/clients` : '/clients';
    const keyPrefix = role === 'owner' ? 'gym_' : 'standard_';
    const expected = new Set(Object.entries(manifest.fixtures.clients).filter(([key]) => key.startsWith(keyPrefix)).map(([, id]) => id));
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    await page.locator('.client-card').first().waitFor();
    const ids = await page.locator('.client-card').evaluateAll(cards => cards.map(card => new URL(card.href).pathname.split('/').at(-1)));
    check(ids.length > 0 && ids.every(id => expected.has(id)), `${role}: only clients from the expected independent/gym scope are visible`);
    check(await page.getByRole('alert').count() === 0, `${role}: scoped clients load without a visible error`);
  } else {
    const routineId = manifest.fixtures.routines[role === 'gym_client' ? 'gym' : 'independent'];
    await page.goto(`${origin}/client/routines/${routineId}`, { waitUntil: 'networkidle' });
    await page.locator('.days-section').waitFor();
    check(await page.locator('.exercise-item').count() > 0 && await page.getByRole('alert').count() === 0, `${role}: assigned routine and exercises load through the public proxy`);
    await page.goto(`${origin}/client/measurements`, { waitUntil: 'networkidle' });
    await page.locator('.measurement-row').first().waitFor();
    check(await page.locator('.measurement-row').count() >= 6 && await page.getByRole('alert').count() === 0, `${role}: six existing measurements load through the public proxy`);
  }
  await screenshot(page, role);
}
async function logout(page, role) {
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.waitForURL(url => url.origin === origin && url.pathname === '/login');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  check(new URL(page.url()).pathname === '/login', `${role}: logout remains effective after reload over HTTPS`);
}

try {
  browser = await chromium.launch();
  activeRole = 'public-http-boundary';
  const probes = await browser.newContext();
  try {
    const settings = await probes.request.get(`${apiPrefix}auth/v1/settings`, { headers: { apikey: publicKey }, timeout: 45_000, maxRedirects: 0 });
    check(settings.status() === 200 && settings.headers()['content-type']?.includes('application/json'), 'Public /supabase Auth API serves JSON with the local public key');
    for (const path of ['/supabase/auth/v1/admin/users', '/.env', '/main.js.map', '/mailpit/']) {
      const response = await probes.request.get(`${origin}${path}`, { timeout: 45_000, maxRedirects: 0 });
      check(response.status() === 403, `${path}: private or privileged HTTP endpoint is blocked`);
    }
  } finally { await probes.close(); }
  for (const role of roles) {
    activeRole = role;
    console.log(`Tunnel smoke: ${role}`);
    const context = await contextFor(role);
    const page = await context.newPage(); activePage = page;
    await login(page, role);
    await readScope(page, role);
    await logout(page, role);
    check(apiReads.some(entry => entry.role === role && entry.status < 400), `${role}: actual authenticated REST reads were observed under /supabase`);
    await context.close();
  }
  check(pageErrors.length === 0, 'No uncaught browser exceptions');
  check(forbiddenRequests.length === 0, 'No attempted loopback, hosted Supabase or off-tunnel requests');
  check(apiErrors.length === 0 && networkFailures.length === 0, 'Public Auth and Data API completed without HTTP or transport failures');
} catch (error) {
  failure = error;
  if (activePage && !activePage.isClosed()) {
    const path = `${artifacts}/failure.png`;
    await activePage.screenshot({ path, fullPage: true, timeout: 15_000 }).then(() => chmod(path, 0o600)).catch(() => {});
  }
} finally {
  try { await browser?.close(); }
  catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  try {
    check(createHash('sha256').update(await readFile(manifestPath)).digest('hex') === createHash('sha256').update(manifestBytes).digest('hex'), 'Private persistent demo credentials remain unchanged');
  } catch (error) { failure ||= error; }
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ status: failure ? 'failed' : 'passed', publicOrigin: origin, roles, activeRole, checks,
    pageErrors, forbiddenRequests, apiErrors, networkFailures, successfulRestReadCount: apiReads.length, cleanupErrors,
    scope: 'Password login, scoped reads, reload and logout only; no external OAuth/email callback, fixture creation or manual data writes.', failure: failure?.message }, null, 2), { mode: 0o600 });
}
if (failure) throw new Error(`Testing tunnel smoke failed for ${activeRole}: ${failure.message}. Private artifacts: ${artifacts}`);
console.log(`HTTPS testing tunnel: ${checks.length} checks passed across four roles; no fixtures changed. Private artifacts: ${artifacts}`);
