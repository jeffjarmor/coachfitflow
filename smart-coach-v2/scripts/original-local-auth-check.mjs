import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Real Auth, SMTP capture and password UI, exclusively on the original local
// clone. Run sequentially after other UI suites. No Google or external email.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Hosted targets are unsupported.');
assert.equal(process.env.ORIGINAL_LOCAL_AUTH_CHECK, '1', 'Coordinate local UI and seed before enabling this check.');
const base = 'http://127.0.0.1:4350';
const mailBase = 'http://127.0.0.1:55324';
const target = JSON.parse(await readFile(process.env.ORIGINAL_COMPAT_STATUS_FILE || '/tmp/coachfitflow-original-compat-status.json', 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:55321');
const environment = await readFile(new URL('../src/environments/environment.local-testing.ts', import.meta.url), 'utf8');
assert.ok(environment.includes(target.API_URL) && environment.includes('zummith-v2-testing-auth'));
assert.ok(environment.includes(target.ANON_KEY) && !environment.includes(target.SERVICE_ROLE_KEY));
const allowed = new Set([base, target.API_URL, mailBase]);
async function localFetch(input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.ok(allowed.has(url.origin), 'An Auth test request attempted to leave the isolated local origins.');
  return fetch(input, { ...init, redirect: 'manual' });
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const anonymous = () => createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(8).toString('hex');
const prefix = `original-local-auth-${suffix}`;
const emails = new Set(['signup', 'recovery', 'invite'].map(label => `${prefix}-${label}@example.invalid`));
const [signupEmail, recoveryEmail, inviteEmail] = [...emails];
const password = `${randomBytes(20).toString('base64url')}Aa1!`;
const recoveryPassword = `${randomBytes(20).toString('base64url')}Bb2!`;
const invitePassword = `${randomBytes(20).toString('base64url')}Cc3!`;
const users = new Set(), checks = [], errors = [], escaped = [], cleanupErrors = [];
const artifacts = `/tmp/coachfitflow-${prefix}`;
await mkdir(artifacts, { recursive: true, mode: 0o700 });
await chmod(artifacts, 0o700);
let browser, activePage, mailFlavor, failure, phase = 'preflight';
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message} (${result.error.code || 'unknown'})`);
  return result.data;
};
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };

async function ownAuthUsers() {
  const result = [];
  for (let page = 1; ; page++) {
    const rows = checked(await db.auth.admin.listUsers({ page, perPage: 1000 }), 'Discover only ephemeral Auth fixtures').users;
    result.push(...rows.filter(user => emails.has(user.email?.toLowerCase())));
    if (rows.length < 1000) return result;
  }
}
async function mailMessages(email) {
  assert.ok(emails.has(email), 'Mail access must use this run\'s recipient addresses.');
  if (mailFlavor === 'mailpit') {
    const response = await localFetch(`${mailBase}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1000`);
    assert.ok(response.ok, 'Local Mailpit search failed.');
    const data = await response.json();
    return (data.messages || []).filter(message => message.To?.some(to => to.Address?.toLowerCase() === email))
      .map(message => ({ id: message.ID, email }));
  }
  const mailbox = email.split('@')[0];
  const response = await localFetch(`${mailBase}/api/v1/mailbox/${encodeURIComponent(mailbox)}`);
  if (response.status === 404) return [];
  assert.ok(response.ok, 'Local Inbucket mailbox read failed.');
  return (await response.json()).map(message => ({ id: message.id, email, mailbox }));
}
async function deliveredAction(email, type) {
  for (let attempt = 0; attempt < 80; attempt++) {
    for (const message of await mailMessages(email)) {
      const path = mailFlavor === 'mailpit' ? `/api/v1/message/${encodeURIComponent(message.id)}`
        : `/api/v1/mailbox/${encodeURIComponent(message.mailbox)}/${encodeURIComponent(message.id)}`;
      const response = await localFetch(mailBase + path);
      assert.ok(response.ok, 'Local captured email could not be read.');
      const detail = await response.json();
      const html = detail.HTML || detail.body?.html || detail.Body?.HTML || '';
      for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
        let url;
        try { url = new URL(match[1].replaceAll('&amp;', '&')); } catch { continue; }
        if (url.pathname !== '/auth/v1/verify' || url.searchParams.get('type') !== type) continue;
        assert.equal(url.origin, target.API_URL, 'Email verification must remain on local Auth.');
        const redirect = new URL(url.searchParams.get('redirect_to'));
        assert.equal(redirect.origin, base, 'Delivered email must point to the dedicated testing app.');
        assert.equal(redirect.pathname, '/set-password');
        const tokenHash = url.searchParams.get('token_hash') || url.searchParams.get('token');
        assert.ok(tokenHash, 'Delivered email must contain its real Auth token hash.');
        // Follow the delivered href unchanged. This exercises GoTrue's real
        // verification redirect and the app's returned action credentials.
        return url.toString();
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`No ${type} email reached the run-owned local mailbox.`);
}
async function page() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Costa_Rica', reducedMotion: 'reduce' });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === base || url.origin === target.API_URL || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    escaped.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const result = await context.newPage();
  result.setDefaultTimeout(15_000);
  result.on('pageerror', error => errors.push(error.message));
  activePage = result;
  return result;
}
async function savePassword(page, value) {
  await page.locator('#new-password').fill(value);
  await page.locator('#password-confirmation').fill(value);
  await page.getByRole('button', { name: 'Guardar contraseña', exact: true }).click();
}
async function followEmail(page, href, type) {
  const responsePromise = page.waitForResponse(response => response.url() === href && response.status() >= 300 && response.status() < 400);
  const [response] = await Promise.all([responsePromise, page.goto(href, { waitUntil: 'networkidle' })]);
  const callback = new URL(await response.headerValue('location'), href);
  check(callback.origin === base && callback.pathname === '/set-password', `${type}: GoTrue redirects the real email verification to the testing app`);
  check(new URL(page.url()).origin === base && new URL(page.url()).pathname === '/set-password', `${type}: the browser reaches the actual password callback`);
}
async function cleanup() {
  const attempt = async (label, action) => {
    try { await action(); } catch (error) { cleanupErrors.push(`${label}: ${error.message}`); }
  };
  // Recover identifiers after a partially completed signup/invitation. Matching
  // uses exact randomly generated addresses, never persistent demo identities.
  await attempt('Discover ephemeral users', async () => { for (const user of await ownAuthUsers()) users.add(user.id); });
  for (const email of emails) {
    await attempt('Remove own captured email', async () => {
      const messages = await mailMessages(email);
      for (const message of new Map(messages.map(item => [item.id, item])).values()) {
        assert.ok(message.id && emails.has(message.email));
        // Mailpit supports explicit IDs; never issue its unscoped delete-all API.
        // https://mailpit.axllent.org/docs/api-v1/
        // Inbucket deletes one message by mailbox/id.
        // https://github.com/inbucket/inbucket/wiki/REST-DELETE-message
        const response = mailFlavor === 'mailpit'
          ? await localFetch(`${mailBase}/api/v1/messages`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [message.id] }) })
          : await localFetch(`${mailBase}/api/v1/mailbox/${encodeURIComponent(message.mailbox)}/${encodeURIComponent(message.id)}`, { method: 'DELETE' });
        assert.ok(response.ok || response.status === 404, 'Failed to remove a run-owned captured email.');
      }
    });
  }
  if (users.size) {
    for (const table of ['activity_logins', 'coaches']) await attempt(`Clean ephemeral ${table}`, async () => checked(await db.from(table).delete().in(table === 'coaches' ? 'id' : 'user_id', [...users]), `Clean ephemeral ${table}`));
    for (const id of users) {
      await attempt('Clean ephemeral Auth identity', async () => {
        const result = await db.auth.admin.deleteUser(id);
        if (result.error && result.error.status !== 404) throw result.error;
      });
    }
  }
  await attempt('Verify Auth cleanup', async () => check((await ownAuthUsers()).length === 0, 'All ephemeral Auth identities are removed'));
  for (const email of emails) await attempt('Verify email cleanup', async () => check((await mailMessages(email)).length === 0, 'Run-owned captured email is removed without clearing other mailboxes'));
  if (cleanupErrors.length) throw new Error('Ephemeral Auth/mail cleanup needs review.');
}

try {
  assert.ok((await localFetch(`${base}/login`)).ok, 'Root must start the local-testing app before this suite.');
  const probe = await localFetch(`${mailBase}/api/v1/messages`);
  mailFlavor = probe.ok && Array.isArray((await probe.json()).messages) ? 'mailpit' : 'inbucket';
  browser = await chromium.launch();

  phase = 'signup';
  const main = await page();
  await main.goto(`${base}/signup`, { waitUntil: 'networkidle' });
  await main.locator('#signup-name').fill('Entrenador temporal de Auth');
  await main.locator('#signup-email').fill(signupEmail.toUpperCase());
  await main.locator('#signup-password').fill(password);
  await main.locator('#signup-confirmation').fill(password);
  const signupResponse = main.waitForResponse(response => response.url().startsWith(`${target.API_URL}/auth/v1/signup`) && response.request().method() === 'POST');
  const [signupResult] = await Promise.all([signupResponse,
    main.getByRole('button', { name: 'Crear cuenta', exact: true }).click()]);
  const signup = await signupResult.json();
  assert.ok(signup.user?.id, 'Local signup did not return its created identity.'); users.add(signup.user.id);
  await main.waitForURL(url => url.pathname === '/dashboard');
  const user = checked(await db.auth.admin.getUserById(signup.user.id), 'Read own signup').user;
  check(user.email === signupEmail && !!user.email_confirmed_at, 'Signup normalizes email and follows the current local auto-confirm setting');
  const profile = checked(await db.from('coaches').select('role,account_type,coach_plan').eq('id', user.id).single(), 'Read own provisioned coach');
  check(profile.role === 'coach' && profile.account_type === 'independent' && profile.coach_plan === 'standard', 'Signup provisions the original standard independent coach profile');
  const normalSession = await main.evaluate(() => localStorage.getItem('zummith-v2-testing-auth'));
  assert.ok(normalSession);
  check(await main.evaluate(() => localStorage.getItem('zummith-auth')) === null, 'Local signup leaves the production session key untouched');

  phase = 'recovery-email';
  const recovery = checked(await db.auth.admin.createUser({ email: recoveryEmail, password, email_confirm: true }), 'Create own recovery fixture').user;
  users.add(recovery.id);
  const requester = await page();
  await requester.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await requester.locator('#email').fill(recoveryEmail);
  await requester.getByRole('button', { name: '¿La olvidaste?', exact: true }).click();
  await requester.getByRole('status').filter({ hasText: 'Te enviamos un enlace de recuperación' }).waitFor();
  const recoveryAction = await deliveredAction(recoveryEmail, 'recovery');
  check(true, 'Recovery email is delivered to the actual local SMTP capture with a testing-only callback');
  await followEmail(main, recoveryAction, 'recovery');
  check(new URL(main.url()).search === '' && new URL(main.url()).hash === '', 'Returned recovery credentials are removed from browser history');
  await savePassword(main, recoveryPassword);
  await main.waitForURL(url => url.pathname === '/dashboard');
  check((await anonymous().auth.signInWithPassword({ email: recoveryEmail, password: recoveryPassword })).data.user?.id === recovery.id,
    'The app consumes the real email callback and updates its intended recovery account');
  check((await anonymous().auth.signInWithPassword({ email: signupEmail, password })).data.user?.id === user.id
    && await main.evaluate(() => localStorage.getItem('zummith-v2-testing-auth')) === normalSession,
    'Recovering another identity preserves the main account password and persisted session');
  check(checked(await anonymous().auth.getUser(JSON.parse(normalSession).access_token), 'Validate protected session').user.id === user.id,
    'The protected account session remains valid at Auth');
  await followEmail(requester, recoveryAction, 'reused-recovery');
  await requester.getByRole('alert').filter({ hasText: 'El enlace no es válido o expiró' }).waitFor();
  check(true, 'A delivered recovery token cannot be reused');

  phase = 'invitation-email';
  const invitation = checked(await db.auth.admin.inviteUserByEmail(inviteEmail, { redirectTo: `${base}/set-password?mode=invite`,
    data: { name: 'Invitación temporal', role: 'coach', account_type: 'independent' } }), 'Send own local Auth invitation').user;
  users.add(invitation.id);
  const inviteAction = await deliveredAction(inviteEmail, 'invite');
  check(true, 'An actual Auth invitation reaches only the run-owned local mailbox');
  const invited = await page();
  await followEmail(invited, inviteAction, 'invite');
  await savePassword(invited, invitePassword);
  await invited.waitForURL(url => url.pathname === '/login' && url.searchParams.get('passwordUpdated') === '1');
  check((await anonymous().auth.signInWithPassword({ email: inviteEmail, password: invitePassword })).data.user?.id === invitation.id,
    'The delivered invitation token activates the intended account with its new password');
  check(await invited.evaluate(() => localStorage.getItem('zummith-v2-testing-auth')) === null,
    'Invitation action sessions are never persisted as a normal application session');
  await invited.locator('#email').fill(inviteEmail); await invited.locator('#password').fill(invitePassword);
  await invited.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await invited.waitForURL(url => url.pathname === '/dashboard');
  check(checked(await db.from('coaches').select('role').eq('id', invitation.id).single(), 'Read invited coach').role === 'coach',
    'The activated invitation completes a real first login and profile provisioning');
  check(await main.evaluate(() => localStorage.getItem('zummith-v2-testing-auth')) === normalSession,
    'The main account remains unchanged after all invitation operations');
  check(errors.length === 0, 'No uncaught browser errors');
  check(escaped.length === 0, 'Every browser and SDK Auth request remains local');
} catch (error) {
  failure = error;
} finally {
  try { await browser?.close(); }
  catch (error) { cleanupErrors.push(`Browser shutdown: ${error.message}`); failure ||= error; }
  if (mailFlavor) {
    try { await cleanup(); } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  }
  const redact = value => value?.replace(/https?:\/\/\S+/g, '[local URL]').replace(/[A-Za-z0-9_-]{60,}/g, '[redacted]');
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ ok: !failure, phase, checks, mailApi: mailFlavor,
    browserErrors: errors.map(redact), escapedRequests: escaped, cleanupErrors: cleanupErrors.map(redact), failure: redact(failure?.message) }, null, 2), { mode: 0o600 });
}
if (failure) throw new Error(`Local Auth check failed during ${phase}. Private report: ${artifacts}/report.json`);
console.log(`Original local Auth: ${checks.length} checks passed; ephemeral accounts and captured messages removed. Private report: ${artifacts}/report.json`);
