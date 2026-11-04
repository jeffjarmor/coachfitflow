import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingState,
  formatBillingPrice,
  formatBillingInterval,
  isLocalBillingEndpoint,
  checkoutCallbackAction
} from '../src/app/core/data/coach-billing.models.ts';

const snapshot = (overrides = {}) => ({
  mode: 'onvo_test',
  configured: true,
  configurationMessage: undefined,
  publicKey: 'onvo_test_public',
  nextAction: null,
  plan: { id: 'price_1', name: 'Zummith Pro', amount: 1299, currency: 'USD', interval: 'month', intervalCount: 1 },
  subscription: null,
  paymentMethod: null,
  invoices: [],
  checkout: null,
  ...overrides
});

test('price and interval format the configured provider terms without substituting local pricing', () => {
  const data = snapshot();
  assert.equal(formatBillingPrice(data.plan), '$12.99');
  assert.equal(formatBillingInterval(data.plan), 'per month');
  assert.equal(formatBillingPrice(snapshot({ plan: { ...data.plan, amount: null, currency: null } }).plan), 'Price not configured');
});

test('server snapshot state stays distinct for setup, action required, active, cancellation, and failed renewal', () => {
  assert.equal(billingState(snapshot({ configured: false })), 'setup');
  assert.equal(billingState(snapshot({
    nextAction: { type: 'simulated_bank' },
    subscription: { id: 'sub_1', status: 'incomplete', cancelAtPeriodEnd: false }
  })), 'action_required');
  assert.equal(billingState(snapshot({ subscription: { id: 'sub_1', status: 'active', cancelAtPeriodEnd: false } })), 'active');
  assert.equal(billingState(snapshot({ subscription: { id: 'sub_1', status: 'active', cancelAtPeriodEnd: true } })), 'canceling');
  assert.equal(billingState(snapshot({ subscription: { id: 'sub_1', status: 'past_due', cancelAtPeriodEnd: false } })), 'past_due');
});

test('local simulator gate rejects hosted Supabase and all SDK callbacks require server reconciliation', () => {
  assert.equal(isLocalBillingEndpoint('http://127.0.0.1:54321'), true);
  assert.equal(isLocalBillingEndpoint('http://localhost:54321'), true);
  assert.equal(isLocalBillingEndpoint('https://example.supabase.co'), false);
  assert.equal(checkoutCallbackAction('success'), 'reconcile');
  assert.equal(checkoutCallbackAction('error'), 'reconcile');
});
