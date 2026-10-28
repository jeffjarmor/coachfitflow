import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

// Deliberately separate from the offline test glob. Never accept a hosted URL,
// the persistent compatibility stack, or an ambient/default credential file.
assert.equal(process.env.SECURITY_PREFLIGHT_CONFIRM, 'local-disposable-58000');
assert.ok(process.env.SECURITY_PREFLIGHT_STATUS_FILE, 'An explicit scratch status file is required');
const target = JSON.parse(await readFile(process.env.SECURITY_PREFLIGHT_STATUS_FILE, 'utf8'));
assert.equal(target.API_URL, 'http://127.0.0.1:58000');
assert.ok(target.ANON_KEY && target.SERVICE_ROLE_KEY);
const require = createRequire(new URL('../../../smart-coach-v2/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const localFetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  assert.equal(url.origin, target.API_URL, 'HTTP preflight cannot leave its disposable local API');
  return fetch(input, { ...init, redirect: 'error' });
};
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localFetch } };
const privileged = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const anonymous = () => createClient(target.API_URL, target.ANON_KEY, options);
const prefix = `security-${randomBytes(6).toString('hex')}`;
const password = `${randomBytes(24).toString('base64url')}Aa1!`;
const users = [], clients = [], gyms = [], paths = [], checks = [];
const checked = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.code || result.error.name || 'request failed'}`);
  return result.data;
};
const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
const denied = (result, label) => { check(!!result.error, label); };
const date = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function signIn(email) {
  const api = anonymous();
  checked(await api.auth.signInWithPassword({ email, password }), 'Synthetic password login');
  return api;
}
async function account(label, role = null) {
  const email = `${prefix}-${label}@example.invalid`;
  const user = checked(await privileged.auth.admin.createUser({ email, password, email_confirm: true }), 'Create synthetic Auth user').user;
  users.push(user.id);
  if (role) checked(await privileged.from('coaches').upsert({ id: user.id, name: label, email, role,
    account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: date(30) }), 'Create fixture coach');
  return { id: user.id, email, api: await signIn(email) };
}
async function clientSnapshot(id) {
  return checked(await privileged.from('clients').select('id,name,user_id,primary_coach_id,portal_status').eq('id', id).single(), 'Read synthetic client state');
}
async function serviceFor(sourcePath, className, api) {
  const ts = require('typescript');
  const source = await readFile(new URL(sourcePath, import.meta.url), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true },
  }).outputText, { exports, crypto: { randomUUID }, require: () => ({ Injectable: () => value => value,
    environment: { appUrl: target.API_URL } }) });
  // Skip Angular/browser startup; call the shipped method with a real local
  // Supabase session. Database and HTTP authorization remain fully exercised.
  const service = Object.create(exports[className].prototype);
  service.supabase = api;
  return service;
}
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=', 'base64');
const replacement = Buffer.concat([image, Buffer.from([0])]);
async function upload(api, path, bytes = image, upsert = false) {
  if (!paths.includes(path)) paths.push(path);
  return api.storage.from('assets').upload(path, bytes, { contentType: 'image/png', cacheControl: '0', upsert });
}
async function contents(path) {
  const url = new URL(`${target.API_URL}/storage/v1/object/public/assets/${path}`);
  url.searchParams.set('preflight', randomBytes(4).toString('hex'));
  const response = await localFetch(url);
  assert.equal(response.status, 200, 'An existing public fixture remains readable');
  return Buffer.from(await response.arrayBuffer());
}
async function gym(owner, label) {
  const row = checked(await privileged.from('gyms').insert({ name: `${prefix}-${label}`, owner_id: owner.id,
    access_code: randomBytes(6).toString('hex').toUpperCase() }).select('id').single(), 'Create fixture gym');
  gyms.push(row.id);
  return row.id;
}

let failure;
try {
  const coach = await account('coach', 'coach');
  const other = await account('other', 'coach');
  const admin = await account('admin', 'admin');
  const attacker = await account('attacker');
  const signup = anonymous();
  const signupEmail = `${prefix}-signup@example.invalid`;
  const signupUser = checked(await signup.auth.signUp({ email: signupEmail, password,
    options: { data: { role: 'admin' } } }), 'Self-service signup').user;
  assert.ok(signupUser);
  users.push(signupUser.id);
  const automaticallyCreated = checked(await privileged.from('coaches').select('role').eq('id', signupUser.id).maybeSingle(), 'Signup role snapshot');
  check(!automaticallyCreated || automaticallyCreated.role === 'coach', 'Signup metadata cannot provision an administrator');
  checked(await signup.from('coaches').upsert({ id: signupUser.id, name: 'Signup', email: signupEmail,
    role: 'coach', account_type: 'independent' }), 'Ordinary self-service coach profile');
  checked(await signup.from('coaches').update({ name: 'Edited' }).eq('id', signupUser.id), 'Ordinary profile edit');
  denied(await signup.from('coaches').update({ role: 'admin' }).eq('id', signupUser.id), 'Self-elevation is rejected through PostgREST');
  check(checked(await privileged.from('coaches').select('role,name').eq('id', signupUser.id).single(), 'Coach snapshot').role === 'coach', 'Rejected elevation leaves role unchanged');
  checked(await signup.from('coaches').delete().eq('id', signupUser.id), 'Self-delete unused fixture profile');
  denied(await signup.from('coaches').insert({ id: signupUser.id, name: 'Escalation', email: signupEmail, role: 'admin' }), 'Privileged reinsertion is rejected');
  checked(await signup.from('coaches').insert({ id: signupUser.id, name: 'Signup', email: signupEmail, role: 'coach' }), 'Ordinary reinsertion still works');
  checked(await admin.api.from('coaches').update({ role: 'owner' }).eq('id', other.id), 'Administrator role assignment');
  check(checked(await privileged.from('coaches').select('role').eq('id', other.id).single(), 'Admin assignment snapshot').role === 'owner', 'Administrator provisioning remains available');
  checked(await admin.api.from('coaches').update({ role: 'coach' }).eq('id', other.id), 'Restore synthetic role');

  const inviteEmail = `${prefix}-invited@example.invalid`;
  const coachData = await serviceFor('../../../smart-coach-v2/src/app/core/data/coach-data.service.ts', 'CoachDataService', coach.api);
  const client = { id: await coachData.createClient(coach.id, { name: 'Invited', email: inviteEmail,
    goal: 'Fuerza', phone: '', birthDate: null, weight: 70, height: 170, notes: '', address: 'Synthetic fixture' }) };
  clients.push(client.id);
  check((await clientSnapshot(client.id)).primary_coach_id === coach.id, 'Shipped V2 client creation preserves coach ownership');
  const inviteeId = checked(await coach.api.rpc('admin_ensure_auth_user_for_email', { p_email: inviteEmail,
    p_gym_id: null, p_client_id: client.id, p_role: 'independent_client',
    p_user_metadata: { role: 'independent_client', coach_id: coach.id, client_id: client.id } }), 'Coach provisions invited identity');
  assert.ok(inviteeId);
  users.push(inviteeId);
  checked(await privileged.auth.admin.updateUserById(inviteeId, { password, email_confirm: true }), 'Prepare synthetic invited password');
  checked(await coach.api.from('clients').update({ user_id: inviteeId, portal_status: 'pending' }).eq('id', client.id), 'Coach binds invited identity');
  checked(await coach.api.from('independent_client_portal_access').upsert({ user_id: inviteeId, client_id: client.id, coach_id: coach.id }), 'Coach issues portal link');
  const invited = await signIn(inviteEmail);
  check(checked(await invited.from('clients').select('id').eq('id', client.id), 'Invited client read').length === 1, 'Matching invited identity retains access');
  checked(await invited.from('clients').update({ name: 'Client edited', portal_status: 'active' }).eq('id', client.id), 'Invited profile activation/edit');
  check((await clientSnapshot(client.id)).portal_status === 'active', 'Linked activation preserves identity and activates profile');
  checked(await coach.api.from('clients').update({ portal_status: 'pending' }).eq('id', client.id), 'Reset synthetic V1 invitation');
  const legacyAuth = await serviceFor('../../../smart-coach/src/app/services/auth.service.ts', 'AuthService', invited);
  // Supply the read-only dependency interface without starting Angular caches
  // or auto-provisioning profiles; this lookup still uses real HTTP and RLS.
  legacyAuth.coachService = { getCoachProfile: async userId => checked(await invited.from('coaches')
    .select('id').eq('id', userId).maybeSingle(), 'V1 existing-coach lookup') };
  await legacyAuth.activateIndependentClientAccessForCurrentUser();
  check((await clientSnapshot(client.id)).portal_status === 'active', 'Shipped V1 activation works against patched HTTP backend');
  denied(await attacker.api.from('independent_client_portal_access').insert({ user_id: attacker.id, client_id: client.id, coach_id: coach.id }), 'Forged portal link is rejected');
  denied(await attacker.api.from('independent_client_portal_access').insert({ user_id: attacker.id, client_id: client.id, coach_id: attacker.id }), 'Claiming coach ID grants no access');
  checked(await privileged.from('independent_client_portal_access').insert({ user_id: attacker.id, client_id: client.id, coach_id: coach.id }), 'Seed historical forged link in disposable database');
  const before = await clientSnapshot(client.id);
  check(checked(await attacker.api.from('clients').select('id').eq('id', client.id), 'Historical link read').length === 0, 'Historical forged link cannot read client');
  const edit = await attacker.api.from('clients').update({ name: 'Forbidden', user_id: attacker.id }).eq('id', client.id).select('id');
  check(!!edit.error || edit.data.length === 0, 'Historical forged link cannot edit client');
  const removal = await attacker.api.from('clients').delete().eq('id', client.id).select('id');
  check(!!removal.error || removal.data.length === 0, 'Historical forged link cannot delete client');
  assert.deepEqual(await clientSnapshot(client.id), before);
  checked(await privileged.from('coaches').update({ next_plan_payment_date: date(-2) }).eq('id', coach.id), 'Expire synthetic plan');
  check(checked(await invited.from('clients').select('id').eq('id', client.id), 'Expired portal read').length === 0, 'Existing plan expiry gate remains effective');
  checked(await privileged.from('coaches').update({ next_plan_payment_date: date(30) }).eq('id', coach.id), 'Restore synthetic plan');

  const gymA = await gym(coach, 'gym-a'), gymB = await gym(other, 'gym-b');
  checked(await privileged.from('gym_staff').insert([{ gym_id: gymA, coach_id: coach.id, role: 'owner' },
    { gym_id: gymA, coach_id: other.id, role: 'trainer' }]), 'Create synthetic gym staff');
  const membership = checked(await privileged.from('client_gym_memberships').insert({ client_id: client.id, gym_id: gymA,
    assigned_coach_id: coach.id, subscription_status: 'active', portal_status: 'pending' }).select('id').single(), 'Create gym client membership');
  checked(await privileged.from('client_portal_access').insert({ user_id: inviteeId, client_gym_membership_id: membership.id }), 'Create gym invitation');
  checked(await coach.api.from('clients').update({ portal_status: 'pending' }).eq('id', client.id), 'Reset synthetic V2 invitation');
  const portalService = await serviceFor('../../../smart-coach-v2/src/app/features/client-portal/client-portal-data.service.ts', 'ClientPortalDataService', invited);
  await portalService.activateLinkedAccesses();
  check((await clientSnapshot(client.id)).portal_status === 'active', 'Shipped V2 activation works with independent and gym invitations');
  check(checked(await other.api.from('clients').select('id').eq('id', client.id), 'Existing gym staff client read').length === 1, 'Gym staff authorization remains available');
  check(checked(await invited.from('client_gym_memberships').select('id').eq('id', membership.id), 'Gym portal membership read').length === 1, 'Gym client membership remains visible');

  const own = `coaches/${coach.id}/logo/${prefix}.png`, foreign = `coaches/${other.id}/logo/${prefix}.png`;
  const ownGym = `gyms/${gymA}/logo_${prefix}.png`, foreignGym = `gyms/${gymB}/logo-${prefix}.png`;
  checked(await upload(coach.api, own), 'Own coach upload');
  checked(await upload(other.api, foreign), 'Other coach owns their upload');
  checked(await upload(coach.api, own, replacement, true), 'Own coach upsert replacement');
  assert.deepEqual(await contents(own), replacement);
  checks.push('Own replacement and anonymous public image reads work');
  const originalForeign = await contents(foreign);
  denied(await upload(coach.api, foreign, replacement, true), 'Cross-coach upsert is rejected');
  denied(await coach.api.storage.from('assets').update(foreign, replacement), 'Cross-coach update is rejected');
  await coach.api.storage.from('assets').remove([foreign]);
  assert.deepEqual(await contents(foreign), originalForeign);
  checks.push('Cross-coach delete leaves the object unchanged');
  const moved = `coaches/${other.id}/logo/${prefix}-moved.png`;
  const stolen = `coaches/${coach.id}/logo/${prefix}-stolen.png`;
  paths.push(moved, stolen);
  denied(await coach.api.storage.from('assets').move(own, moved), 'Move into another coach namespace is rejected');
  denied(await coach.api.storage.from('assets').move(foreign, stolen), 'Move from another coach namespace is rejected');
  assert.deepEqual(await contents(own), replacement);
  assert.deepEqual(await contents(foreign), originalForeign);
  checked(await upload(coach.api, ownGym), 'Gym owner logo upload');
  checked(await upload(other.api, foreignGym), 'Second gym owner logo upload');
  denied(await upload(other.api, ownGym, replacement, true), 'Non-owner gym staff cannot overwrite logo');
  denied(await upload(coach.api, foreignGym, replacement, true), 'Cross-gym logo overwrite is rejected');
  await coach.api.storage.from('assets').remove([foreignGym]);
  assert.deepEqual(await contents(foreignGym), image);
  checked(await upload(coach.api, ownGym, replacement, true), 'Gym owner replaces logo');
  const global = `exercises_global/${prefix}.png`;
  denied(await upload(coach.api, global), 'Coach cannot upload global exercise media');
  checked(await upload(admin.api, global), 'Administrator manages global exercise media');
  checked(await coach.api.storage.from('assets').remove([own, ownGym]), 'Owner cleans up own and previous gym logos');
  const removed = await privileged.storage.from('assets').download(ownGym);
  check(!!removed.error, 'Authorized cleanup actually removed the gym logo');
} catch (error) {
  failure = error;
} finally {
  const cleanupErrors = [];
  if (paths.length) {
    const result = await privileged.storage.from('assets').remove(paths);
    if (result.error) cleanupErrors.push('asset fixtures');
  }
  for (const [table, ids] of [['gyms', gyms], ['clients', clients], ['coaches', users]]) {
    if (!ids.length) continue;
    const result = await privileged.from(table).delete().in('id', ids);
    if (result.error) cleanupErrors.push(table);
  }
  for (const id of users.reverse()) {
    const result = await privileged.auth.admin.deleteUser(id);
    if (result.error) cleanupErrors.push('Auth fixture');
  }
  if (cleanupErrors.length) failure ||= new Error(`Synthetic fixture cleanup failed: ${cleanupErrors.join(', ')}`);
}
if (failure) throw failure;
console.log(JSON.stringify({ status: 'passed', checks: checks.length, scenarios: checks, syntheticFixturesRemoved: true }));
