import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadStagingTarget } from './staging-target.mjs';

assert.equal(process.env.ZUMMITH_STAGE, undefined, 'Portal activation regression only runs locally.');
const target = loadStagingTarget();
assert.equal(target.API_URL, 'http://127.0.0.1:54321');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const db = createClient(target.API_URL, target.SERVICE_ROLE_KEY, options);
const anonymous = createClient(target.API_URL, target.ANON_KEY, options);
const suffix = randomBytes(6).toString('hex');
const password = `${randomBytes(18).toString('base64url')}Aa1!`;
const users = [], clients = [], gyms = [];
const checks = [];
function checked(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}
function check(value, label) { assert.ok(value, label); checks.push(label); }
async function account(name) {
  const email = `portal-activation-${name}-${suffix}@example.invalid`;
  const user = checked(await db.auth.admin.createUser({ email, password, email_confirm: true }), 'Create Auth fixture').user;
  users.push(user.id);
  const api = createClient(target.API_URL, target.ANON_KEY, options);
  checked(await api.auth.signInWithPassword({ email, password }), 'Sign in fixture');
  return { id: user.id, email, api };
}
async function status(clientId, membershipId) {
  return {
    client: checked(await db.from('clients').select('id,user_id,primary_coach_id,portal_status,updated_at').eq('id', clientId).single(), 'Read client status'),
    membership: checked(await db.from('client_gym_memberships').select('*').eq('id', membershipId).single(), 'Read membership status')
  };
}
try {
  const owner = await account('owner');
  const first = await account('first');
  const second = await account('second');
  const unlinked = await account('unlinked');
  const wrongCoach = await account('wrong-coach');
  const administrator = await account('admin');
  checked(await db.from('coaches').upsert({ id: owner.id, name: 'Activation owner', email: owner.email, account_type: 'independent', coach_plan: 'paid', next_plan_payment_date: '2099-01-01' }), 'Create owner profile');
  checked(await db.from('coaches').upsert([
    { id: wrongCoach.id, name: 'Other coach', email: wrongCoach.email, role: 'coach' },
    { id: administrator.id, name: 'Administrator', email: administrator.email, role: 'admin' }
  ]), 'Create administrative fixtures');
  const gym = checked(await db.from('gyms').insert({ name: `Activation Gym ${suffix}`, access_code: suffix, owner_id: owner.id }).select('id').single(), 'Create gym');
  gyms.push(gym.id);
  const memberships = [];
  for (const portalUser of [first, second]) {
    const client = checked(await db.from('clients').insert({ name: 'Activation client', email: portalUser.email, age: 30, goal: 'Verify portal activation', user_id: portalUser.id, primary_coach_id: owner.id, portal_status: 'pending' }).select('id').single(), 'Create linked client');
    clients.push(client.id);
    const membership = checked(await db.from('client_gym_memberships').insert({ client_id: client.id, gym_id: gym.id, assigned_coach_id: owner.id, subscription_status: 'pending', next_payment_due_date: '2026-11-10', portal_status: 'pending' }).select('id').single(), 'Create membership');
    memberships.push(membership.id);
    if (portalUser === first) {
      check(checked(await first.api.from('clients').select('id').eq('id', client.id), 'Read before portal self-upsert').length === 0, 'Client without an access row is initially hidden');
      checked(await first.api.from('independent_client_portal_access').upsert({ user_id: first.id, client_id: client.id, coach_id: null }, { onConflict: 'user_id,client_id' }), 'Legitimate first self-upsert');
      check(true, 'A trusted client can perform the original self-upsert with a legacy null coach');
    }
    checked(await owner.api.from('independent_client_portal_access').upsert({ user_id: portalUser.id, client_id: client.id, coach_id: owner.id }, { onConflict: 'user_id,client_id' }), 'Owner links independent portal');
    check(true, 'The real owner can prepare an independent invitation');
    checked(await db.from('client_portal_access').insert({ user_id: portalUser.id, client_gym_membership_id: membership.id }), 'Link gym portal');
  }
  checked(await administrator.api.from('independent_client_portal_access').upsert({ user_id: second.id, client_id: clients[1], coach_id: owner.id }, { onConflict: 'user_id,client_id' }), 'Admin manages legitimate invitation');
  check(true, 'An administrator can manage a legitimate invitation');
  const invalidAdminCoach = await administrator.api.from('independent_client_portal_access').upsert({ user_id: second.id, client_id: clients[1], coach_id: wrongCoach.id }, { onConflict: 'user_id,client_id' });
  check(invalidAdminCoach.error?.code === '42501', 'An administrator cannot write a mismatched invitation coach');
  const forgedInsert = await first.api.from('independent_client_portal_access').insert({ user_id: first.id, client_id: clients[1], coach_id: owner.id });
  check(forgedInsert.error?.code === '42501', 'A client cannot self-link to another client');
  const forgedCoachInsert = await wrongCoach.api.from('independent_client_portal_access').insert({ user_id: wrongCoach.id, client_id: clients[0], coach_id: wrongCoach.id });
  check(forgedCoachInsert.error?.code === '42501', 'Another coach cannot forge ownership');
  const forgedClientUpdate = await first.api.from('independent_client_portal_access').update({ client_id: clients[1] }).eq('client_id', clients[0]).eq('user_id', first.id);
  check(forgedClientUpdate.error?.code === '42501', 'A legitimate access row cannot be moved to another client');
  const forgedIdentityUpdate = await first.api.from('independent_client_portal_access').update({ user_id: second.id }).eq('client_id', clients[0]).eq('user_id', first.id);
  check(forgedIdentityUpdate.error?.code === '42501', 'A client cannot grant its access row to another identity');
  const routine = checked(await db.from('routines').insert({ client_id: clients[1], coach_id: owner.id, name: 'Other client routine', objective: 'Verify isolation', training_days_count: 1, duration_weeks: 4 }).select('id').single(), 'Create isolated routine');
  checked(await db.from('measurements').insert({ client_id: clients[1], date: '2026-10-10', weight: 70, height: 170, bmi: 24.22 }), 'Create isolated measurement');
  const before = await status(clients[0], memberships[0]);
  const otherBefore = await status(clients[1], memberships[1]);
  const anonResult = await anonymous.rpc('activate_current_client_portal_access');
  check(!!anonResult.error, 'Anonymous activation is rejected');
  const unlinkedResult = checked(await unlinked.api.rpc('activate_current_client_portal_access'), 'Unlinked activation');
  assert.deepEqual(unlinkedResult, { independent: 0, gym: 0 });
  check(true, 'An identity without access links changes nothing');

  // Editable metadata cannot select another client's invitation.
  checked(await unlinked.api.auth.updateUser({ data: { client_id: clients[1], coach_id: owner.id, gym_id: gym.id, role: 'gym_client' } }), 'Set adversarial metadata');
  assert.deepEqual(checked(await unlinked.api.rpc('activate_current_client_portal_access'), 'Metadata-only activation'), { independent: 0, gym: 0 });
  check(true, 'Metadata cannot authorize activation');

  // The historical independent access policy permits a self-created link. The
  // activation RPC must also verify the trusted clients.user_id binding.
  checked(await db.from('independent_client_portal_access').insert({ user_id: first.id, client_id: clients[1], coach_id: owner.id }), 'Create adversarial access fixture');
  check(!checked(await first.api.rpc('has_active_independent_client_portal_access', { p_client_id: clients[1], p_user_id: first.id }), 'Check forged access helper'), 'Preexisting forged links do not satisfy the paid-access helper');
  check(checked(await first.api.from('independent_client_portal_access').select('id').eq('client_id', clients[1]), 'Read forged access row').length === 0, 'Preexisting forged links are hidden from their unrelated identity');
  for (const [table, field, id] of [['clients', 'id', clients[1]], ['routines', 'id', routine.id], ['measurements', 'client_id', clients[1]]]) {
    check(checked(await first.api.from(table).select('id').eq(field, id), `Read unrelated ${table}`).length === 0, `Preexisting forged access cannot read unrelated ${table}`);
  }
  const activated = checked(await first.api.rpc('activate_current_client_portal_access'), 'Activate linked contexts');
  assert.deepEqual(activated, { independent: 1, gym: 1 });
  const after = await status(clients[0], memberships[0]);
  check(after.client.portal_status === 'active' && after.membership.portal_status === 'active', 'Both existing portal scopes become active');
  check(after.client.user_id === before.client.user_id && after.client.primary_coach_id === before.client.primary_coach_id, 'Client identity and coach stay unchanged');
  const { portal_status: beforeStatus, updated_at: beforeUpdated, ...beforeBilling } = before.membership;
  const { portal_status: afterStatus, updated_at: afterUpdated, ...afterBilling } = after.membership;
  assert.deepEqual(afterBilling, beforeBilling);
  check(true, 'Membership ownership and billing stay unchanged');
  assert.deepEqual(await status(clients[1], memberships[1]), otherBefore);
  check(true, 'Another identity and forged independent link remain untouched');
  assert.deepEqual(checked(await first.api.rpc('activate_current_client_portal_access'), 'Repeat activation'), { independent: 0, gym: 0 });
  assert.deepEqual(await status(clients[0], memberships[0]), after);
  check(true, 'Repeated activation is idempotent, including updated_at');
  assert.deepEqual(checked(await second.api.rpc('activate_current_client_portal_access'), 'Activate second identity'), { independent: 1, gym: 1 });
  check(true, 'The second identity can activate its own invitations');
  check(checked(await db.from('coaches').select('id').in('id', [first.id, second.id, unlinked.id]), 'Read portal identities').length === 0, 'Activation does not provision coach profiles');
} finally {
  if (clients.length) checked(await db.from('clients').delete().in('id', clients), 'Clean client fixtures');
  if (gyms.length) checked(await db.from('gyms').delete().in('id', gyms), 'Clean gym fixtures');
  if (users.length) checked(await db.from('coaches').delete().in('id', users), 'Clean coach fixtures');
  for (const userId of users) checked(await db.auth.admin.deleteUser(userId), 'Clean Auth fixture');
}
console.log(`Portal activation: ${checks.length} checks passed; local fixtures removed.`);
