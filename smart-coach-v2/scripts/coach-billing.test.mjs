import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingState,
  formatBillingPrice,
  formatBillingInterval,
  isLocalBillingEndpoint,
  checkoutCallbackAction,
  billingClientMode,
  getOnvoBillingCheckout
} from '../src/app/core/data/coach-billing.models.ts';

const snapshot = (overrides = {}) => ({
  mode: 'onvo_test',
  configured: true,
  configurationMessage: undefined,
  publicKey: 'onvo_test_publishable_key_example',
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
  const expectedPrice = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'USD' }).format(12.99);
  assert.equal(formatBillingPrice(data.plan), expectedPrice);
  assert.equal(formatBillingInterval(data.plan), 'por mes');
  assert.equal(formatBillingInterval({ ...data.plan, intervalCount: 3 }), 'cada 3 meses');
  assert.equal(formatBillingPrice(snapshot({ plan: { ...data.plan, amount: null, currency: null } }).plan), 'Precio sin configurar');
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

test('real checkout requires a production HTTPS backend with the live switch on', () => {
  const hosted = { url: 'https://example.supabase.co' };
  const local = { url: 'http://127.0.0.1:54321' };
  assert.equal(billingClientMode({ production: true, supabase: hosted }), 'disabled');
  assert.equal(billingClientMode({ production: false, onvoLiveBillingEnabled: true, supabase: hosted }), 'disabled');
  assert.equal(billingClientMode({ production: true, onvoLiveBillingEnabled: true, supabase: hosted }), 'live');
  assert.equal(billingClientMode({ production: true, onvoLiveBillingEnabled: true, supabase: { url: 'http://example.supabase.co' } }), 'disabled');
  assert.equal(billingClientMode({ production: true, onvoLiveBillingEnabled: true, supabase: local }), 'disabled');
  assert.equal(billingClientMode({ production: false, supabase: local }), 'local');
});

test('the real SDK mounts only for an invited coach with matching live payment details', () => {
  const checkout = {
    mode: 'onvo_live', subscriptionId: 'live-sub', customerId: 'live-customer', publishableKey: 'onvo_live_publishable_key_example'
  };
  const live = snapshot({ mode: 'onvo_live', canSubscribe: true, publicKey: checkout.publishableKey, checkout,
    subscription: { id: checkout.subscriptionId, customerId: checkout.customerId, status: 'incomplete' } });
  assert.deepEqual(getOnvoBillingCheckout(live), checkout);
  assert.equal(getOnvoBillingCheckout({ ...live, canSubscribe: false }), null);
  assert.equal(getOnvoBillingCheckout({ ...live, configured: false }), null);
  assert.equal(getOnvoBillingCheckout({ ...live, mode: 'onvo_test' }), null);
  assert.equal(getOnvoBillingCheckout({ ...live, subscription: { ...live.subscription, status: 'active' } }), null);
  assert.equal(getOnvoBillingCheckout({ ...live, checkout: { ...checkout, customerId: 'different-customer' } }), null);
  assert.equal(getOnvoBillingCheckout({ ...live, checkout: { ...checkout, publishableKey: 'onvo_test_publishable_key_example' } }), null);
  const testKey = 'onvo_test_publishable_key_example';
  const testCheckout = { ...checkout, mode: 'onvo_test', publishableKey: testKey };
  assert.deepEqual(getOnvoBillingCheckout({ ...live, mode: 'onvo_test', canSubscribe: undefined, checkout: testCheckout, publicKey: testKey }), testCheckout);
});
