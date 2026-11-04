import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { billingEnvFile, localApiUrl, parseBillingEnvironment, readLocalStatus } from './billing-local-config.mjs';

// This runner uses actual local Auth/PostgREST/functions and only synthetic users.
if (process.argv.includes('--help')) {
  console.log('Usage: npm run test:billing-http\nRequires standard local Docker, applied billing migrations and npm start in explicit simulator mode.\nCreates temporary local trainers, verifies HTTP/security/lifecycle behavior, and removes only its own fixtures.');
  process.exit(0);
}
assert.equal(process.argv.length, 2, 'No remote target or alternate command options are accepted.');
assert.equal(parseBillingEnvironment(readFileSync(billingEnvFile, 'utf8')).mode, 'simulator',
  'This runner requires explicit local simulation before creating any fixtures or calling billing.');
const status = readLocalStatus();
assert.equal(status.API_URL, localApiUrl);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fixtures = [];
let checks = 0;
const checked = (condition, description) => {
  assert.ok(condition, description);
  checks++;
  console.log(`PASS ${description}`);
};

async function trainer(label, manualPro = false) {
  const email = `billing-http-${label}-${randomUUID()}@zummith.test`;
  const password = `LocalTest!${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Billing HTTP fixture' } });
  assert.equal(created.error, null, 'Local Auth fixture creation failed.');
  const record = { id: created.data.user.id, client: null, token: null };
  fixtures.push(record);
  const until = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const saved = await admin.from('coaches').upsert({
    id: record.id, email, name: 'Billing HTTP fixture', role: 'coach', account_type: 'independent',
    coach_plan: manualPro ? 'paid' : 'standard', next_plan_payment_date: manualPro ? until : null
  }, { onConflict: 'id' });
  assert.equal(saved.error, null, 'Local coach fixture creation failed.');
  record.client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const session = await record.client.auth.signInWithPassword({ email, password });
  assert.equal(session.error, null, 'Local fixture sign-in failed.');
  record.token = session.data.session.access_token;
  return record;
}

async function request(user, body, { origin = 'http://127.0.0.1:4200', webhook = false, secret } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: status.ANON_KEY, Origin: origin };
  if (user) headers.Authorization = `Bearer ${user.token}`;
  if (secret) headers['X-Webhook-Secret'] = secret;
  const response = await fetch(`${localApiUrl}/functions/v1/${webhook ? 'coach-billing-webhook' : 'coach-billing'}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(`Local function returned non-JSON HTTP ${response.status}.`); }
  return { status: response.status, data };
}

async function billing(user, body) {
  const response = await request(user, body);
  assert.equal(response.status, 200, `Billing action ${body.action} failed: ${response.data.error?.code || response.status}.`);
  assert.equal(response.data.mode, 'simulator', 'This runner refuses to exercise an actual ONVO account.');
  assert.equal(response.data.configured, true, 'Local simulator must be explicitly configured.');
  assert.ok(!/onvo_(?:live|test)_secret_key|SERVICE_ROLE_KEY/.test(JSON.stringify(response.data)), 'Snapshot exposed a backend credential.');
  return response.data;
}

async function plan(user) {
  const result = await user.client.from('coaches').select('coach_plan,next_plan_payment_date').eq('id', user.id).single();
  assert.equal(result.error, null, 'Owner profile read must remain available.');
  return result.data;
}

async function rejectedWithoutPlanChange(user, body, options) {
  const before = await plan(user);
  const records = {};
  for (const table of ['coach_billing_accounts', 'coach_billing_invoices', 'coach_billing_events', 'coach_billing_operations']) {
    const result = await admin.from(table).select('*').eq('coach_id', user.id);
    assert.equal(result.error, null, 'Billing fixture state could not be inspected.');
    records[table] = result.data;
  }
  const result = await request(user, body, options);
  assert.ok(result.status >= 400 && result.status < 500,
    `Rejected billing requests need a client/auth error, not HTTP ${result.status} (${result.data.error?.code || 'no error code'}).`);
  assert.deepEqual(await plan(user), before, 'Rejected billing request changed the persisted plan.');
  for (const [table, rows] of Object.entries(records)) {
    const after = await admin.from(table).select('*').eq('coach_id', user.id);
    assert.equal(after.error, null);
    assert.deepEqual(after.data, rows, 'Rejected billing request changed stored billing data.');
  }
  return result;
}

try {
  const owner = await trainer('owner');
  const other = await trainer('other');
  const manual = await trainer('manual', true);
  const anonymous = await request(null, { action: 'status' });
  checked(anonymous.status === 401, 'anonymous billing access is rejected');

  const initial = await billing(owner, { action: 'status' });
  checked(initial.subscription === null && (await plan(owner)).coach_plan === 'standard', 'new trainer starts with no provider subscription or Pro grant');
  await rejectedWithoutPlanChange(owner, { action: 'status' }, { origin: 'https://untrusted.example' });
  checked(true, 'untrusted browser origin is rejected without changing the plan');
  await rejectedWithoutPlanChange(owner, { action: 'subscribe', coachId: other.id });
  await rejectedWithoutPlanChange(owner, { action: 'subscribe', card: { number: '4242424242424242', cvv: '123' } });
  checked(true, 'client-selected owner and raw card payloads are rejected without mutation');

  const unauthorizedClaim = await owner.client.rpc('claim_coach_billing_operation', { p_coach_id: owner.id, p_action: 'subscribe' });
  checked(Boolean(unauthorizedClaim.error), 'browser cannot invoke the privileged billing operation RPC');
  const operation = await admin.rpc('claim_coach_billing_operation', { p_coach_id: owner.id, p_action: 'subscribe' });
  assert.equal(operation.error, null);
  assert.ok(operation.data, 'Trusted operation claim was not created.');
  const expired = await admin.from('coach_billing_operations').update({ lease_until: '2020-01-01T00:00:00.000Z' }).eq('coach_id', owner.id);
  assert.equal(expired.error, null);
  const busy = await rejectedWithoutPlanChange(owner, { action: 'status' });
  assert.equal(busy.status, 409);
  const release = await admin.rpc('release_coach_billing_operation', { p_coach_id: owner.id, p_action: 'subscribe', p_claim_id: operation.data });
  checked(release.error === null && release.data === true, 'expired diagnostic lease cannot be stolen and only the original claim can release it');

  const legacyBefore = await plan(manual);
  assert.equal(legacyBefore.coach_plan, 'paid', 'Legacy fixture did not retain its trusted manual Pro grant.');
  const legacy = await rejectedWithoutPlanChange(manual, { action: 'subscribe' });
  checked(legacy.status === 409 && (await plan(manual)).next_plan_payment_date === legacyBefore.next_plan_payment_date, 'manual Pro is preserved and overlapping checkout is blocked');

  const claims = await Promise.all([request(owner, { action: 'subscribe' }), request(owner, { action: 'subscribe' })]);
  assert.ok(claims.every(item => item.status === 200 || item.status === 409), 'Concurrent checkout caused an unexpected response.');
  const created = await billing(owner, { action: 'status' });
  assert.ok(created.subscription?.id, 'Checkout did not create its subscription.');
  checked(claims.filter(item => item.status === 200).every(item => item.data.subscription?.id === created.subscription.id), 'concurrent checkout resolves to one subscription');
  const again = await billing(owner, { action: 'subscribe' });
  checked(again.subscription.id === created.subscription.id && (await plan(owner)).coach_plan === 'standard', 'repeated checkout reuses the incomplete subscription and never grants Pro');

  const action = await billing(owner, { action: 'simulate', scenario: 'requires_action' });
  checked(action.nextAction?.type === 'simulated_bank' && (await plan(owner)).coach_plan === 'standard', 'bank verification is a pending action, not paid access');
  const declined = await billing(owner, { action: 'simulate', scenario: 'decline' });
  checked(declined.subscription.status === 'incomplete' && (await plan(owner)).coach_plan === 'standard', 'declined first payment does not activate Pro');

  const paid = await billing(owner, { action: 'simulate', scenario: 'success' });
  const paidPlan = await plan(owner);
  checked(paid.subscription.status === 'active' && paid.invoices.some(invoice => invoice.status === 'paid') && paidPlan.coach_plan === 'paid' && Boolean(paidPlan.next_plan_payment_date), 'confirmed local payment persists an active Pro plan and paid renewal');
  const reconciled = await billing(owner, { action: 'reconcile' });
  checked(reconciled.subscription.id === paid.subscription.id && reconciled.invoices.length === paid.invoices.length, 'reconciliation preserves subscription identity and does not duplicate history');
  const outsider = await billing(other, { action: 'status' });
  checked(outsider.subscription === null && outsider.invoices.length === 0, 'a second trainer cannot read another subscription or invoice history');
  for (const table of ['coach_billing_accounts', 'coach_billing_invoices']) {
    const foreign = await other.client.from(table).select('coach_id').eq('coach_id', owner.id);
    assert.equal(foreign.error, null);
    assert.deepEqual(foreign.data, []);
  }
  checked(true, 'billing tables enforce owner-scoped reads through actual PostgREST RLS');

  const protectedUpdate = await owner.client.from('coaches').update({ next_plan_payment_date: '2099-01-01' }).eq('id', owner.id);
  assert.ok(protectedUpdate.error, 'Browser was allowed to alter paid access directly.');
  checked(JSON.stringify(await plan(owner)) === JSON.stringify(paidPlan), 'existing direct plan-write protection remains enforced');
  await rejectedWithoutPlanChange(owner, { action: 'change-payment-method', paymentMethodId: `sim-pm-${other.id}-replacement` });
  checked(true, 'foreign or forged payment method is refused');
  const replacement = await billing(owner, { action: 'change-payment-method', paymentMethodId: 'sim-pm-replacement' });
  checked(Boolean(replacement.paymentMethod?.id) && replacement.invoices.length === paid.invoices.length, 'verified card replacement does not create a charge');

  const canceled = await billing(owner, { action: 'cancel' });
  checked(canceled.subscription.cancelAtPeriodEnd === true && JSON.stringify(await plan(owner)) === JSON.stringify(paidPlan), 'period-end cancellation preserves the already-paid access');
  const repeatedCancel = await billing(owner, { action: 'cancel' });
  checked(repeatedCancel.subscription.id === paid.subscription.id && repeatedCancel.invoices.length === paid.invoices.length, 'repeated cancellation does not create a charge or duplicate subscription');
  const resumed = await billing(owner, { action: 'subscribe' });
  checked(resumed.subscription.id === paid.subscription.id && resumed.subscription.cancelAtPeriodEnd === false && resumed.invoices.length === paid.invoices.length, 'scheduled cancellation resumes the same subscription without a new charge');

  const failed = await billing(owner, { action: 'simulate', scenario: 'renewal_failed' });
  checked(failed.subscription.status === 'past_due' && JSON.stringify(await plan(owner)) === JSON.stringify(paidPlan), 'failed renewal never extends the verified paid period');
  const wrongSecret = await request(null, { type: 'subscription.renewal.succeeded', data: { subscriptionId: paid.subscription.id } }, { webhook: true, secret: 'wrong-local-secret' });
  checked(wrongSecret.status === 401 && JSON.stringify(await plan(owner)) === JSON.stringify(paidPlan), 'forged webhook is rejected without changing the plan');

  const webhookSecret = readFileSync(billingEnvFile, 'utf8').match(/^ONVO_WEBHOOK_SECRET=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
  assert.ok(webhookSecret, 'Local webhook secret is missing.');
  const invoice = paid.invoices.find(item => item.status === 'paid');
  const replay = { type: 'subscription.renewal.succeeded', data: { id: invoice.id, subscriptionId: paid.subscription.id, customerId: paid.subscription.customerId, mode: 'test', status: 'paid', periodStart: invoice.periodStart, periodEnd: '2099-01-01T00:00:00.000Z' } };
  for (let index = 0; index < 2; index++) {
    const response = await request(null, replay, { webhook: true, secret: webhookSecret });
    assert.equal(response.status, 503, 'Simulator must not admit provider webhooks.');
    assert.equal(response.data.error?.code, 'webhook_processing_failed');
  }
  checked(JSON.stringify(await plan(owner)) === JSON.stringify(paidPlan), 'provider webhooks remain disabled in the simulator and cannot extend access');
  console.log(`Billing HTTP checks passed: ${checks}. Real local Docker requests; no ONVO or hosted Supabase calls.`);
} finally {
  const cleanupErrors = [];
  for (const fixture of fixtures.reverse()) {
    try {
      if (fixture.client) await fixture.client.auth.signOut();
      const result = await admin.auth.admin.deleteUser(fixture.id);
      if (result.error) cleanupErrors.push(fixture.id);
    } catch { cleanupErrors.push(fixture.id); }
  }
  assert.equal(cleanupErrors.length, 0, 'Some local HTTP test fixtures could not be cleaned up.');
  console.log('Only this runner’s synthetic Auth/trainer fixtures were removed.');
}
