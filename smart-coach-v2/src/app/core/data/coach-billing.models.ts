export type BillingInterval = 'day' | 'week' | 'month' | 'year' | null;
export type OnvoBillingMode = 'onvo_test' | 'onvo_live';
export type BillingMode = 'simulator' | OnvoBillingMode;

interface BillingEnvironment {
  production: boolean;
  onvoLiveBillingEnabled?: boolean;
  supabase: { url: string };
}
export type BillingSubscriptionStatus =
  | 'incomplete'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete_expired'
  | 'trialing';

export interface CoachBillingPlan {
  id: string | null;
  name: string;
  amount: number | null;
  currency: string | null;
  interval: BillingInterval;
  intervalCount: number | null;
}

export interface CoachBillingSubscription {
  id: string;
  status: BillingSubscriptionStatus;
  customerId: string;
  paymentMethodId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  paidThrough: string | null;
}

export interface CoachBillingPaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface CoachBillingInvoice {
  id: string;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
}

export interface CoachBillingCheckout {
  subscriptionId: string;
  customerId: string;
  publishableKey: string;
  mode: OnvoBillingMode;
}

export interface CoachBillingSnapshot {
  mode: BillingMode;
  configured: boolean;
  canSubscribe?: boolean;
  configurationMessage?: string;
  publicKey: string | null;
  nextAction: null | { type: 'redirect_to_url'; url?: string } | { type: 'simulated_bank' }
    | { type: 'onvo_3ds'; paymentIntentId: string };
  plan: CoachBillingPlan;
  subscription: CoachBillingSubscription | null;
  paymentMethod: CoachBillingPaymentMethod | null;
  invoices: CoachBillingInvoice[];
  checkout: CoachBillingCheckout | null;
}

export type BillingState =
  | 'setup'
  | 'standard'
  | 'active'
  | 'canceling'
  | 'canceled'
  | 'past_due'
  | 'payment_pending'
  | 'action_required';

const intervalNames: Record<Exclude<BillingInterval, null>, [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años']
};

export function formatBillingPrice(plan: Pick<CoachBillingPlan, 'amount' | 'currency'>): string {
  if (!Number.isInteger(plan.amount) || plan.amount === null || !plan.currency) return 'Precio sin configurar';
  try {
    const formatter = new Intl.NumberFormat('es-CR', {
      style: 'currency',
      currency: plan.currency.toUpperCase(),
      currencyDisplay: 'symbol'
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(plan.amount / (10 ** digits));
  } catch {
    return `${plan.currency.toUpperCase()} ${new Intl.NumberFormat('es-CR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(plan.amount / 100)}`;
  }
}

export function formatBillingInterval(plan: Pick<CoachBillingPlan, 'interval' | 'intervalCount'>): string {
  if (!plan.interval) return 'Frecuencia de cobro sin configurar';
  const count = Number.isInteger(plan.intervalCount) && Number(plan.intervalCount) > 0
    ? Number(plan.intervalCount)
    : 1;
  const [singular, plural] = intervalNames[plan.interval];
  return count === 1 ? `por ${singular}` : `cada ${count} ${plural}`;
}

export function billingState(snapshot: CoachBillingSnapshot): BillingState {
  if (!snapshot.configured) return 'setup';
  const subscription = snapshot.subscription;
  if (!subscription) return 'standard';
  if (snapshot.nextAction) {
    return 'action_required';
  }
  if (subscription.cancelAtPeriodEnd && (subscription.status === 'active' || subscription.status === 'trialing')) {
    return 'canceling';
  }
  switch (subscription.status) {
    case 'active':
    case 'trialing': return 'active';
    case 'past_due':
    case 'unpaid': return 'past_due';
    case 'canceled': return 'canceled';
    case 'incomplete':
    case 'incomplete_expired': return 'payment_pending';
  }
}

export function isLocalBillingEndpoint(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

export function billingClientMode(config: BillingEnvironment): 'local' | 'live' | 'disabled' {
  const local = isLocalBillingEndpoint(config.supabase.url);
  if (!config.production && local) return 'local';
  if (!config.production || local || config.onvoLiveBillingEnabled !== true) return 'disabled';

  try {
    const endpoint = new URL(config.supabase.url);
    return endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password ? 'live' : 'disabled';
  } catch {
    return 'disabled';
  }
}

export function matchesOnvoPublishableKey(mode: OnvoBillingMode, key: unknown): key is string {
  const prefix = `${mode}_publishable_key_`;
  return typeof key === 'string' && key.startsWith(prefix) && key.length > prefix.length && !/\s/.test(key);
}

export function getOnvoBillingCheckout(snapshot: CoachBillingSnapshot | null): CoachBillingCheckout | null {
  if (!snapshot?.configured || snapshot.mode === 'simulator' || snapshot.subscription?.status !== 'incomplete') return null;
  if (snapshot.mode === 'onvo_live' && snapshot.canSubscribe !== true) return null;

  const checkout = snapshot.checkout;
  return checkout && checkout.mode === snapshot.mode && matchesOnvoPublishableKey(snapshot.mode, checkout.publishableKey)
    && checkout.publishableKey === snapshot.publicKey && !!checkout.subscriptionId && !!checkout.customerId
    && checkout.subscriptionId === snapshot.subscription.id && checkout.customerId === snapshot.subscription.customerId
    ? checkout : null;
}

export function getOnvoBankAction(snapshot: CoachBillingSnapshot | null): { paymentIntentId: string; publishableKey: string } | null {
  const checkout = getOnvoBillingCheckout(snapshot);
  const action = snapshot?.nextAction;
  if (!checkout || action?.type !== 'onvo_3ds' || typeof action.paymentIntentId !== 'string'
    || !/^[A-Za-z0-9_-]{1,200}$/.test(action.paymentIntentId)) return null;

  return { paymentIntentId: action.paymentIntentId, publishableKey: checkout.publishableKey };
}

export function checkoutCallbackAction(kind: 'success' | 'error'): 'reconcile' | 'show_error' {
  void kind;
  return 'reconcile';
}
