export type BillingInterval = 'day' | 'week' | 'month' | 'year' | null;
export type BillingMode = 'simulator' | 'onvo_test';
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
  mode: 'onvo_test';
}

export interface CoachBillingSnapshot {
  mode: BillingMode;
  configured: boolean;
  configurationMessage?: string;
  publicKey: string | null;
  nextAction: null | { type: 'redirect_to_url' | 'simulated_bank'; url?: string };
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
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years']
};

export function formatBillingPrice(plan: Pick<CoachBillingPlan, 'amount' | 'currency'>): string {
  if (!Number.isInteger(plan.amount) || plan.amount === null || !plan.currency) return 'Price not configured';
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: plan.currency.toUpperCase(),
      currencyDisplay: 'symbol'
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(plan.amount / (10 ** digits));
  } catch {
    return `${plan.currency.toUpperCase()} ${(plan.amount / 100).toFixed(2)}`;
  }
}

export function formatBillingInterval(plan: Pick<CoachBillingPlan, 'interval' | 'intervalCount'>): string {
  if (!plan.interval) return 'Billing interval not configured';
  const count = Number.isInteger(plan.intervalCount) && Number(plan.intervalCount) > 0
    ? Number(plan.intervalCount)
    : 1;
  const [singular, plural] = intervalNames[plan.interval];
  return count === 1 ? `per ${singular}` : `every ${count} ${plural}`;
}

export function billingState(snapshot: CoachBillingSnapshot): BillingState {
  if (!snapshot.configured) return 'setup';
  const subscription = snapshot.subscription;
  if (!subscription) return 'standard';
  if (snapshot.nextAction?.type === 'simulated_bank' || snapshot.nextAction?.type === 'redirect_to_url') {
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

export function checkoutCallbackAction(kind: 'success' | 'error'): 'reconcile' | 'show_error' {
  void kind;
  return 'reconcile';
}
