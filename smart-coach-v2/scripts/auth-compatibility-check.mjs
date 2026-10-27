import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

// All identities, password changes and data requests stay in Supabase CLI.
assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Auth compatibility only runs locally.');
const target = loadStagingTarget();
assert.equal(target.hosted, false);
assert.equal(target.API_URL, 'http://127.0.0.1:54321');
const base = 'http://127.0.0.1:4300';
const originalBase = 'http://127.0.0.1:4350';
const stagingKey = 'zummith-v2-local-auth';
const originalKey = 'zummith-auth';
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const anonymous = () => createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(5).toString('hex');
const initialPassword = `${randomBytes(18).toString('base64url')}Aa1!`;
const users = [];
const servers = [];
const checks = [];
let browser;

function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
function check(value, label) { assert.ok(value, label); checks.push(label); }
async function start(configuration, port) {
  const url = `http://127.0.0.1:${port}`;
  try { if ((await fetch(`${url}/login`)).ok) return; } catch { /* Start below. */ }
  const server = spawn('./node_modules/.bin/ng', ['serve', '--configuration', configuration, '--host', '127.0.0.1', '--port', String(port)],
    { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  servers.push(server);
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${url}/login`)).ok) return; } catch { /* Wait for compilation. */ }
    await delay(500);
  }
  throw new Error(`Angular did not start at ${url}.`);
}
async function account(name) {
  const email = `auth-compat-${name}-${suffix}@example.invalid`;
  const user = checked(await admin.auth.admin.createUser({ email, password: initialPassword, email_confirm: true,
    user_metadata: { name, role: 'coach', account_type: 'independent' } }), 'create local identity').user;
  users.push(user.id);
  checked(await admin.from('coaches').upsert({ id: user.id, name, email, role: 'coach', account_type: 'independent' }), 'create local profile');
  const session = checked(await anonymous().auth.signInWithPassword({ email, password: initialPassword }), 'sign in local identity').session;
  return { user, email, session };
}
async function contextWithSession(session, key = stagingKey) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ session, key }) => {
    if (!sessionStorage.getItem('auth-compat-initialized')) {
      localStorage.setItem(key, JSON.stringify(session));
      sessionStorage.setItem('auth-compat-initialized', '1');
    }
  }, { session, key });
  return context;
}
async function savePassword(page, password) {
  await page.locator('#new-password').fill(password);
  await page.locator('#password-confirmation').fill(password);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
}

try {
  await start('local-staging', 4300);
  await start('development', 4350);
  browser = await chromium.launch({ headless: true });
  const main = await account('Main');
  const recovery = await account('Recovery');
  const legacyContext = await browser.newContext();
  const legacyPage = await legacyContext.newPage();
  await legacyPage.goto(`${base}/forgot-password`, { waitUntil: 'networkidle' });
  check(new URL(legacyPage.url()).pathname === '/login', 'Legacy forgot-password links reach the recovery-enabled login.');
  await legacyPage.goto(`${base}/landing-nueva`, { waitUntil: 'networkidle' });
  check(new URL(legacyPage.url()).pathname === '/', 'Legacy landing-nueva links reach the V2 landing.');
  await legacyContext.close();

  // Exercise the original storage key through the normal build, proxying every
  // Supabase request to local CLI before the page can make any request.
  const env = await readFile(new URL('../src/environments/environment.ts', import.meta.url), 'utf8');
  const productionOrigin = env.match(/url:\s*'([^']+)'/)[1];
  const inherited = await contextWithSession(main.session, originalKey);
  await inherited.route(`${productionOrigin}/**`, async route => {
    const request = route.request();
    const headers = { ...request.headers(), apikey: target.ANON_KEY };
    if (headers.authorization?.startsWith('Bearer sb_publishable_')) headers.authorization = `Bearer ${target.ANON_KEY}`;
    const localUrl = request.url().replace(productionOrigin, target.API_URL);
    const response = await route.fetch({ url: localUrl, headers });
    await route.fulfill({ response });
  });
  const inheritedPage = await inherited.newPage();
  await inheritedPage.goto(`${originalBase}/dashboard`, { waitUntil: 'networkidle' });
  check(new URL(inheritedPage.url()).pathname === '/dashboard', 'Normal build inherits the original application session.');
  await inheritedPage.reload({ waitUntil: 'networkidle' });
  check(new URL(inheritedPage.url()).pathname === '/dashboard', 'Inherited session survives hard reload.');
  await inherited.close();

  const isolated = await contextWithSession(main.session, originalKey);
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  check(new URL(isolatedPage.url()).pathname === '/login', 'Local staging ignores the original production storage key.');
  await isolated.close();

  const protectedContext = await contextWithSession(main.session);
  const protectedPage = await protectedContext.newPage();
  await protectedPage.goto(`${base}/set-password`, { waitUntil: 'networkidle' });
  await protectedPage.getByRole('alert').filter({ hasText: 'El enlace no es válido o expiró' }).waitFor();
  const sessionBefore = await protectedPage.evaluate(key => localStorage.getItem(key), stagingKey);
  await savePassword(protectedPage, `${initialPassword}Invalid1!`);
  await protectedPage.getByRole('alert').filter({ hasText: 'El enlace no es válido o expiró' }).waitFor();
  check((await anonymous().auth.signInWithPassword({ email: main.email, password: initialPassword })).error === null,
    'Opening set-password without a link cannot change the signed-in account password.');
  check(await protectedPage.evaluate(key => localStorage.getItem(key), stagingKey) === sessionBefore,
    'Invalid password actions preserve the existing session.');

  const link = checked(await admin.auth.admin.generateLink({ type: 'recovery', email: recovery.email }), 'generate recovery link');
  const nextPassword = `${randomBytes(18).toString('base64url')}Bb2!`;
  await protectedPage.goto(`${base}/set-password?type=recovery&token_hash=${encodeURIComponent(link.properties.hashed_token)}`,
    { waitUntil: 'networkidle' });
  check(new URL(protectedPage.url()).search === '', 'Recovery credentials are removed from browser history.');
  await savePassword(protectedPage, nextPassword);
  await protectedPage.waitForURL(url => url.pathname === '/dashboard', { timeout: 20_000 });
  check((await anonymous().auth.signInWithPassword({ email: recovery.email, password: nextPassword })).error === null,
    'token_hash recovery updates the intended identity.');
  check(await protectedPage.evaluate(key => localStorage.getItem(key), stagingKey) === sessionBefore,
    'Recovering another identity preserves the original persisted session.');
  check((await anonymous().auth.getUser(main.session.access_token)).data.user?.id === main.user.id,
    'Password-action sign-out does not revoke the original account session.');

  await protectedPage.goto(`${base}/set-password?type=recovery&token_hash=${encodeURIComponent(link.properties.hashed_token)}`,
    { waitUntil: 'networkidle' });
  await protectedPage.getByRole('alert').filter({ hasText: 'El enlace no es válido o expiró' }).waitFor();
  check(true, 'A consumed recovery link is rejected.');
  await protectedContext.close();

  const hashContext = await browser.newContext();
  const hashPage = await hashContext.newPage();
  const hashSession = checked(await anonymous().auth.signInWithPassword({ email: recovery.email, password: nextPassword }), 'create hash session').session;
  const hashPassword = `${randomBytes(18).toString('base64url')}Cc3!`;
  await hashPage.goto(`${base}/set-password/#type=recovery&access_token=${encodeURIComponent(hashSession.access_token)}&refresh_token=${encodeURIComponent(hashSession.refresh_token)}`,
    { waitUntil: 'networkidle' });
  check(new URL(hashPage.url()).hash === '', 'Legacy hash credentials are removed from browser history.');
  await savePassword(hashPage, hashPassword);
  await hashPage.waitForURL(url => url.pathname === '/login' && url.searchParams.get('passwordUpdated') === '1');
  check((await anonymous().auth.signInWithPassword({ email: recovery.email, password: hashPassword })).error === null,
    'Legacy access/refresh token links remain supported.');
  check(await hashPage.evaluate(key => localStorage.getItem(key), stagingKey) === null,
    'Recovery sessions are never persisted as the normal application session.');
  await hashContext.close();

  const verifierStorage = new Map();
  const pkce = createClient(target.API_URL, target.ANON_KEY, { auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    storageKey: stagingKey,
    storage: {
      getItem: key => verifierStorage.get(key) ?? null,
      setItem: (key, value) => { verifierStorage.set(key, value); },
      removeItem: key => { verifierStorage.delete(key); }
    }
  } });
  checked(await pkce.auth.resetPasswordForEmail(recovery.email, { redirectTo: `${base}/set-password` }), 'request local PKCE recovery');
  let message;
  for (let attempt = 0; attempt < 40; attempt++) {
    const mailbox = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
    message = mailbox.messages.find(item => item.To.some(to => to.Address.toLowerCase() === recovery.email.toLowerCase()));
    if (message) break;
    await delay(250);
  }
  assert.ok(message, 'The local Mailpit inbox did not receive the PKCE recovery email.');
  const detail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${message.ID}`)).json();
  const actionLink = detail.HTML.match(/href="([^"]*\/auth\/v1\/verify[^\"]*)"/)[1].replace(/&amp;/g, '&');
  assert.equal(new URL(actionLink).origin, target.API_URL, 'PKCE verification must remain local.');
  const verified = await fetch(actionLink, { redirect: 'manual' });
  const callback = new URL(verified.headers.get('location'));
  assert.ok(callback.searchParams.get('code'), 'PKCE verification did not return an authorization code.');
  check(callback.origin === base && callback.pathname === '/set-password', 'Local Auth callbacks return directly to the configured V2 origin.');
  const pkceContext = await contextWithSession(main.session);
  await pkceContext.addInitScript(entries => {
    if (!sessionStorage.getItem('auth-compat-pkce')) {
      for (const [key, value] of entries) localStorage.setItem(key, value);
      sessionStorage.setItem('auth-compat-pkce', '1');
    }
  }, [...verifierStorage]);
  const pkcePage = await pkceContext.newPage();
  const pkcePassword = `${randomBytes(18).toString('base64url')}Dd4!`;
  await pkcePage.goto(callback.toString(), { waitUntil: 'networkidle' });
  await savePassword(pkcePage, pkcePassword);
  await pkcePage.waitForURL(url => url.pathname === '/dashboard', { timeout: 20_000 });
  check((await anonymous().auth.signInWithPassword({ email: recovery.email, password: pkcePassword })).error === null,
    'PKCE codes use the initiating browser verifier in the isolated password client.');
  check(JSON.parse(await pkcePage.evaluate(key => localStorage.getItem(key), stagingKey)).user.id === main.user.id,
    'PKCE recovery preserves the existing account session.');
  await pkceContext.close();

  const inviteEmail = `auth-compat-invite-${suffix}@example.invalid`;
  const invite = checked(await admin.auth.admin.generateLink({ type: 'invite', email: inviteEmail }), 'generate invite');
  users.push(invite.user.id);
  const inviteContext = await browser.newContext();
  const invitePage = await inviteContext.newPage();
  await invitePage.goto(`${base}/set-password?mode=invite&type=invite&token_hash=${encodeURIComponent(invite.properties.hashed_token)}`,
    { waitUntil: 'networkidle' });
  await savePassword(invitePage, `${initialPassword}Invite1!`);
  await invitePage.waitForURL(url => url.pathname === '/login' && url.searchParams.get('passwordUpdated') === '1');
  check((await anonymous().auth.signInWithPassword({ email: inviteEmail, password: `${initialPassword}Invite1!` })).error === null,
    'Invitation token_hash links activate the intended account.');
  await inviteContext.close();

  const loginContext = await browser.newContext();
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await loginPage.locator('#email').fill(main.email);
  await loginPage.locator('#password').fill(initialPassword);
  await loginPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await loginPage.waitForURL(url => url.pathname === '/dashboard');
  const activity = checked(await admin.from('activity_logins').select('role').eq('user_id', main.user.id), 'read activity');
  check(activity.some(row => row.role === 'coach'), 'Password sign-in records the original activity_logins audit contract.');
  await loginPage.reload({ waitUntil: 'networkidle' });
  const reloadedActivity = checked(await admin.from('activity_logins').select('role').eq('user_id', main.user.id), 'read activity after reload');
  check(reloadedActivity.length === activity.length, 'Session restoration does not duplicate login activity.');
  await loginContext.close();

  console.log(`Auth compatibility: ${checks.length} checks passed using local Supabase only.`);
  for (const message of checks) console.log(`PASS ${message}`);
} finally {
  if (browser) await browser.close();
  for (const server of servers) server.kill('SIGINT');
  for (const id of users) {
    await admin.from('coaches').delete().eq('id', id);
    await admin.auth.admin.deleteUser(id);
  }
}
