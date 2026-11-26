import { BillingRequestError, type CoachBillingHandlerDependencies, type CoachOwner } from "./handler.ts";
import type { OnvoSignedBillingEvent } from "./webhook.ts";

type Json = Record<string, unknown>;
type BillingMode = "simulator" | "onvo_test" | "onvo_live";
type OnvoBankAction = { type: "onvo_3ds"; paymentIntentId: string };
type OpenInvoicePayment = OnvoBankAction | { type: "pending_settlement" };
type SnapshotPayment = { nextAction?: Json | null; paymentPendingSettlement?: boolean };
type Account = {
  coach_id: string;
  mode: BillingMode;
  customer_id: string | null;
  subscription_id: string | null;
  subscription_create_pending: boolean;
  subscription_status: string | null;
  onvo_subscription_updated_at?: string | null;
  payment_method_id: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
  paid_through: string | null;
  plan_price_id: string | null;
  plan_name: string;
  plan_amount: number | null;
  plan_currency: string | null;
  plan_interval: "day" | "week" | "month" | "year" | null;
  plan_interval_count: number | null;
};

const emptySnapshot = (mode: BillingMode, message?: string) => ({
  mode,
  configured: false,
  ...(message ? { configurationMessage: message } : {}),
  publicKey: null,
  nextAction: null,
  plan: { id: null, name: "Pro", amount: null, currency: null, interval: null, intervalCount: null },
  subscription: null,
  paymentMethod: null,
  invoices: [],
  checkout: null,
});

function localOnlySimulatorAllowed(env: Record<string, string>) {
  if (env.COACH_BILLING_MODE !== "simulator" || env.COACH_BILLING_LOCAL_SIMULATOR !== "true") return false;
  if (env.ONVO_SECRET_KEY?.startsWith("onvo_live_") || env.ONVO_PUBLISHABLE_KEY?.startsWith("onvo_live_")) return false;
  if (env.DENO_DEPLOYMENT_ID || /^(prod|production|live)$/i.test(env.ENVIRONMENT ?? "")) return false;
  try {
    const host = new URL(env.SUPABASE_URL ?? "").hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "kong", "supabase_kong", "host.docker.internal"].includes(host);
  } catch {
    return false;
  }
}

function selectMode(env: Record<string, string>): BillingMode {
  if (!env.COACH_BILLING_MODE || env.COACH_BILLING_MODE === "onvo_test") return "onvo_test";
  if (env.COACH_BILLING_MODE === "simulator") return "simulator";
  if (env.COACH_BILLING_MODE === "onvo_live") return "onvo_live";
  throw new BillingRequestError(503, "billing_mode_invalid", "COACH_BILLING_MODE must be simulator, onvo_test, or onvo_live.");
}

function isPublicHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value &&
      /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(url.hostname) &&
      !/\.(local|localhost|internal|lan|home|test|invalid)$/.test(url.hostname);
  } catch {
    return false;
  }
}

export function targetsProduction(env: Record<string, string>, supabaseUrl: string, origins: string[]) {
  const productionProject = "bzhqprxolseyxuuwodqs";
  if (/^(prod|production|live)$/i.test(env.ENVIRONMENT ?? "") ||
      env.DENO_DEPLOYMENT_ID?.startsWith(`${productionProject}_`)) return true;

  return [supabaseUrl, ...origins].some((value) => {
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
      return [`${productionProject}.supabase.co`, "zummith.com", "www.zummith.com"].includes(host);
    } catch {
      return false;
    }
  });
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function objectValue(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function providerId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function datePart(value: string | null): string | null {
  return value?.slice(0, 10) ?? null;
}

export function hasActiveLegacyPaidAccess(coachPlan: string | null | undefined, paidThrough: string | null | undefined, today = new Date().toISOString().slice(0, 10)) {
  return coachPlan === "paid" && typeof paidThrough === "string" && paidThrough.slice(0, 10) >= today;
}

export function invoiceMatchesSubscription(invoice: Json, account: Account) {
  return account.mode !== "simulator" && invoice.mode === (account.mode === "onvo_live" ? "live" : "test")
    && invoice.subscriptionId === account.subscription_id
    && invoice.customerId === account.customer_id;
}

export function paymentIntentConfirmsInvoice(intent: Json, invoice: Json, account: Account) {
  const amount = minorAmount(intent.amount);
  return intent.id === invoice.paymentIntentId
    && account.mode !== "simulator" && intent.mode === (account.mode === "onvo_live" ? "live" : "test")
    && intent.status === "succeeded"
    && paymentIntentCustomerMatches(intent, account)
    && intent.currency === invoice.currency
    && amount !== null && amount === invoice.total
    && (account.mode !== "onvo_live" || (
      amount > 0 &&
      (intent.captureMethod === "automatic" || intent.captureMethod == null) &&
      (intent.receivedAmount == null || intent.receivedAmount === invoice.total)
    ));
}

function paymentIntentCustomerId(intent: Json) {
  const direct = safeString(intent.customerId);
  const expanded = safeString(objectValue(intent.customer)?.id);
  if (intent.customerId != null && !direct) return null;
  if (intent.customer != null && !expanded) return null;
  if (direct && expanded && direct !== expanded) return null;
  return direct ?? expanded;
}

function paymentIntentCustomerMatches(intent: Json, account: Account) {
  return Boolean(account.customer_id && paymentIntentCustomerId(intent) === account.customer_id);
}

function minorAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function subscriptionUsesPrice(subscription: Json, priceId: string | null) {
  const items = subscription.items;
  if (!priceId || !Array.isArray(items) || items.length !== 1) return false;
  const item = items[0] as Json | null;
  return item?.priceId === priceId && item.quantity === 1;
}

function signedTestAmountMatchesInvoice(intent: Json, invoice: Json) {
  const captured = minorAmount(intent.receivedAmount) ?? (intent.receivedAmount == null &&
    (intent.captureMethod == null || intent.captureMethod === "automatic") ? minorAmount(intent.amount) : null);
  return intent.currency === invoice.currency && intent.amount === invoice.total && captured === invoice.total;
}

function fiscalEvidence(event: OnvoSignedBillingEvent, intent: Json, remote: Json, account: Account, amountMatches: boolean) {
  const priceId = providerId(account.plan_price_id);
  const method = objectValue(intent.paymentMethod)?.type === "card" ? "02" : null;
  let reviewReason: string | null = null;
  if (!amountMatches) {
    reviewReason = "onvo_amount_mismatch";
  } else if (!subscriptionUsesPrice(remote, priceId)) {
    reviewReason = "onvo_price_mismatch";
  } else if (!method) {
    reviewReason = "onvo_payment_method_unverified";
  }

  return {
    account_id: event.accountId,
    event_id: event.id,
    paid_at: normalizeTimestamp(event.createdAt),
    price_id: priceId,
    payment_method: method,
    review_reason: reviewReason,
  };
}

function parseCard(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const card = value as Json;
  const brand = safeString(card.brand);
  const last4 = typeof card.last4 === "string" && /^\d{4}$/.test(card.last4) ? card.last4 : null;
  const expMonth = typeof card.expMonth === "number" && card.expMonth >= 1 && card.expMonth <= 12 ? card.expMonth : null;
  const expYear = typeof card.expYear === "number" && card.expYear >= new Date().getUTCFullYear() ? card.expYear : null;
  return brand && last4 && expMonth && expYear ? { brand, last4, expMonth, expYear } : null;
}

export function createRuntimeDependencies(
  env: Record<string, string> = Deno.env.toObject(),
  fetcher: typeof fetch = fetch,
): CoachBillingHandlerDependencies & {
  webhookSecret: string;
  signedWebhook: { signingSecret: string; accountId: string; mode: "test" | "live" } | null;
  localSimulatorAllowed: boolean;
  receiveWebhook(eventKey: string, eventType: string, data: Json): Promise<unknown>;
  receiveSignedWebhook(event: OnvoSignedBillingEvent): Promise<unknown>;
} {
  const mode = selectMode(env);
  const isLive = mode === "onvo_live";
  const providerMode: "test" | "live" = isLive ? "live" : "test";
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const anonKey = env.SUPABASE_ANON_KEY ?? env.ANON_KEY ?? "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  const secretKey = env.ONVO_SECRET_KEY ?? "";
  const publishableKey = env.ONVO_PUBLISHABLE_KEY ?? "";
  const priceId = env.ONVO_PRICE_ID ?? "";
  const origins = (env.BILLING_ALLOWED_ORIGINS ?? (isLive ? "" : "http://localhost:4300,http://127.0.0.1:4300,http://localhost:4200,http://127.0.0.1:4200"))
    .split(",").map((value) => value.trim()).filter(Boolean);
  const nonLiveOnProduction = !isLive && targetsProduction(env, supabaseUrl, origins);
  const bonfireEnabled = mode === "onvo_test" && !nonLiveOnProduction && env.BONFIRE_FACTURA_ENABLED === "true";
  const localSimulatorAllowed = !nonLiveOnProduction && localOnlySimulatorAllowed(env);
  // This legacy intake is intentionally scoped to isolated ONVO test events.
  const webhookSecret = mode === "onvo_test" && !nonLiveOnProduction ? env.ONVO_WEBHOOK_SECRET ?? "" : "";
  const allowedOrigins = isLive ? origins.filter(isPublicHttpsOrigin) : origins;
  const invitedCoaches = new Set((env.COACH_BILLING_LIVE_COACH_IDS ?? "").split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)));
  const canSubscribe = (owner: CoachOwner) => !isLive || invitedCoaches.has(owner.id.toLowerCase());
  const liveConfigReady = isLive && env.COACH_BILLING_LIVE_ENABLED === "true" && isPublicHttpsOrigin(supabaseUrl)
    && allowedOrigins.length > 0 && allowedOrigins.length === origins.length && Boolean(anonKey && serviceKey);
  const onvoKeysConfigured = mode !== "simulator" &&
    secretKey.startsWith(`onvo_${providerMode}_secret_key_`) &&
    publishableKey.startsWith(`onvo_${providerMode}_publishable_key_`) &&
    /^[A-Za-z0-9_-]{1,200}$/.test(priceId);
  const signingSecret = env.ONVO_SUBSCRIPTION_WEBHOOK_SIGNING_SECRET?.trim();
  const signedAccountId = providerId(env.ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID?.trim());
  const signedWebhook = signingSecret && signedAccountId && supabaseUrl && serviceKey && onvoKeysConfigured
    && !nonLiveOnProduction && (!isLive || liveConfigReady)
    ? { signingSecret, accountId: signedAccountId, mode: providerMode } : null;
  const liveDisabledSnapshot = () => emptySnapshot(mode, "La facturación de Pro todavía no está habilitada para tu cuenta.");
  const configurationMissing = () => emptySnapshot(mode, "Configure ONVO test keys and a recurring test price ID to enable billing.");

  function requireBillingReady() {
    if (nonLiveOnProduction || (isLive && (!liveConfigReady || !onvoKeysConfigured))) {
      throw new BillingRequestError(503, "billing_not_configured", "La facturación de Pro aún no está habilitada.");
    }
  }

  async function supabase(path: string, options: RequestInit = {}, privileged = true): Promise<unknown> {
    if (!supabaseUrl || !(privileged ? serviceKey : anonKey)) throw new BillingRequestError(503, "billing_not_configured", "Billing service is not configured.");
    const key = privileged ? serviceKey : anonKey;
    const response = await fetcher(`${supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: key,
        authorization: options.headers instanceof Headers
          ? options.headers.get("authorization") ?? `Bearer ${key}`
          : (options.headers as Record<string, string> | undefined)?.authorization ?? `Bearer ${key}`,
        "content-type": "application/json",
        ...(options.headers instanceof Headers ? Object.fromEntries(options.headers.entries()) : options.headers ?? {}),
      },
    });
    if (!response.ok) throw new BillingRequestError(502, "billing_storage_unavailable", "Billing data could not be saved. Try again.");
    if (response.status === 204 || response.status === 205) return null;
    const responseText = await response.text();
    if (!responseText.trim()) return null;
    try {
      return JSON.parse(responseText);
    } catch {
      throw new BillingRequestError(502, "billing_storage_invalid_response", "Billing storage returned an invalid response.");
    }
  }

  async function onvo(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<unknown> {
    requireBillingReady();
    if (!onvoKeysConfigured) {
      throw new BillingRequestError(503, "billing_not_configured", "ONVO needs matching secret and publishable keys, and a recurring price ID.");
    }
    const response = await fetcher(`https://api.onvopay.com/v1${path}`, {
      method,
      redirect: "error",
      headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new BillingRequestError(502, "onvo_request_failed", "ONVO could not complete the billing request.");
    return result;
  }

  async function rows<T>(table: string, query: string, signal?: AbortSignal): Promise<T[]> {
    const result = await supabase(`/rest/v1/${table}?${query}`, { method: "GET", signal });
    return Array.isArray(result) ? result as T[] : [];
  }

  async function callRpc(name: string, body: Json, signal?: AbortSignal): Promise<unknown> {
    return await supabase(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body), signal });
  }

  async function getAccount(coachId: string): Promise<Account | null> {
    const found = await rows<Account>("coach_billing_accounts", `coach_id=eq.${encodeURIComponent(coachId)}&select=*`);
    return found[0] ?? null;
  }

  async function saveAccount(coachId: string, patch: Partial<Account> & Record<string, unknown>, current?: Account | null) {
    const value = { ...patch, coach_id: coachId, mode, updated_at: new Date().toISOString() };
    await supabase("/rest/v1/coach_billing_accounts?on_conflict=coach_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(value),
    });
    return { ...(current ?? {}), ...patch, coach_id: coachId, mode } as Account;
  }

  async function claim(coachId: string): Promise<string> {
    const result = await callRpc("claim_coach_billing_operation", { p_coach_id: coachId, p_action: "subscribe" });
    if (typeof result !== "string") throw new BillingRequestError(409, "billing_operation_in_progress", "A billing operation is already claimed. If it stopped unexpectedly, an operator must investigate and release that exact claim before retrying.");
    return result;
  }

  async function release(coachId: string, claimId: string) {
    await callRpc("release_coach_billing_operation", { p_coach_id: coachId, p_action: "subscribe", p_claim_id: claimId });
  }

  async function withCoachLock<T>(owner: CoachOwner, operation: () => Promise<T>): Promise<T> {
    const claimId = await claim(owner.id);
    try { return await operation(); }
    finally { await release(owner.id, claimId); }
  }

  async function ensurePrice() {
    const price = await onvo(`/prices/${encodeURIComponent(priceId)}`) as Json | null;
    const recurring = price?.recurring && typeof price.recurring === "object" ? price.recurring as Json : {};
    if (price?.mode !== providerMode || price.type !== "recurring" || price.isActive !== true || price.id !== priceId) {
      throw new BillingRequestError(503, "onvo_price_mismatch", "The configured ONVO price is not active and recurring in this billing mode.");
    }
    const interval = ["day", "week", "month", "year"].includes(String(recurring.interval))
      ? recurring.interval as Account["plan_interval"] : null;
    const intervalCount = typeof recurring.intervalCount === "number" && recurring.intervalCount > 0
      ? Math.trunc(recurring.intervalCount) : null;
    const amount = minorAmount(price.unitAmount);
    const currency = safeString(price.currency);
    if (isLive && (!amount || !currency || !/^[A-Z]{3}$/.test(currency) || interval !== "month" || recurring.intervalCount !== 1)) {
      throw new BillingRequestError(503, "onvo_price_mismatch", "The live Pro price must be a positive monthly amount with a valid currency.");
    }
    return {
      id: String(price.id),
      name: typeof price.nickname === "string" && price.nickname ? price.nickname : "Pro",
      amount,
      currency,
      interval,
      intervalCount,
    };
  }

  function toSnapshot(owner: CoachOwner, account: Account | null, invoices: Array<Record<string, unknown>> = [], plan?: Awaited<ReturnType<typeof ensurePrice>> | null, payment?: SnapshotPayment) {
    const checkoutAllowed = canSubscribe(owner);
    const actualPlan = plan ?? {
      id: account?.plan_price_id ?? null,
      name: account?.plan_name ?? "Pro",
      amount: account?.plan_amount ?? null,
      currency: account?.plan_currency ?? null,
      interval: account?.plan_interval ?? null,
      intervalCount: account?.plan_interval_count ?? null,
    };
    return {
      mode,
      configured: true,
      publicKey: mode === "simulator" ? null : publishableKey,
      ...(isLive ? { canSubscribe: checkoutAllowed } : {}),
      ...(payment?.paymentPendingSettlement ? { paymentPendingSettlement: true } : {}),
      nextAction: payment?.nextAction ?? null,
      plan: actualPlan,
      subscription: account?.subscription_id ? {
        id: account.subscription_id,
        status: account.subscription_status ?? "incomplete",
        customerId: account.customer_id ?? "",
        paymentMethodId: account.payment_method_id,
        currentPeriodStart: account.current_period_start,
        currentPeriodEnd: account.current_period_end,
        cancelAtPeriodEnd: account.cancel_at_period_end,
        cancelAt: account.cancel_at,
        canceledAt: account.canceled_at,
        paidThrough: account.paid_through,
      } : null,
      paymentMethod: account?.payment_method_id && account.payment_method_brand && account.payment_method_last4
        && account.payment_method_exp_month && account.payment_method_exp_year ? {
          id: account.payment_method_id,
          brand: account.payment_method_brand,
          last4: account.payment_method_last4,
          expMonth: account.payment_method_exp_month,
          expYear: account.payment_method_exp_year,
        } : null,
      invoices: invoices.map((invoice) => ({
        id: invoice.provider_invoice_id,
        status: invoice.status,
        amount: invoice.amount,
        currency: invoice.currency,
        createdAt: invoice.created_at,
        periodStart: invoice.period_start,
        periodEnd: invoice.period_end,
      })),
      checkout: mode !== "simulator" && checkoutAllowed && !payment?.paymentPendingSettlement && account?.subscription_id && account.customer_id
          && account.subscription_status === "incomplete" ? {
            subscriptionId: account.subscription_id,
            customerId: account.customer_id,
            publishableKey,
            mode,
          } : null,
    };
  }

  async function invoiceRows(coachId: string): Promise<Array<Record<string, unknown>>> {
    const found = await rows<Record<string, unknown>>(
      "coach_billing_invoices",
      `coach_id=eq.${encodeURIComponent(coachId)}&provider=eq.${mode}&select=*&order=period_end.desc,created_at.desc&limit=100`,
    );
    return found;
  }

  async function getOwnerAccount(owner: CoachOwner) {
    const account = await getAccount(owner.id);
    if (account && account.mode !== mode) throw new BillingRequestError(409, "billing_mode_mismatch", "This account was created in a different billing mode.");
    return account;
  }

  async function authUser(request: Request): Promise<CoachOwner | null> {
    if (!supabaseUrl || !anonKey || !serviceKey) return null;
    const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!accessToken) return null;
    let response: Response;
    try {
      response = await fetcher(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` },
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    const user = await response.json().catch(() => null) as Json | null;
    const userId = safeString(user?.id);
    if (!userId) return null;
    const coaches = await rows<Json>(
      "coaches",
      `id=eq.${encodeURIComponent(userId)}&role=eq.coach&account_type=eq.independent&select=id,email,name,coach_plan,next_plan_payment_date&limit=1`,
    );
    const profile = coaches[0];
    if (!profile || profile.id !== userId) return null;
    return {
      id: userId,
      email: safeString(profile.email),
      name: safeString(profile.name),
      coachPlan: safeString(profile.coach_plan),
      nextPlanPaymentDate: safeString(profile.next_plan_payment_date),
    };
  }

  async function configuredPlan() {
    if (mode === "simulator") return null;
    requireBillingReady();
    if (!secretKey && !publishableKey && !priceId) return null;
    if (!onvoKeysConfigured) {
      throw new BillingRequestError(503, "onvo_configuration_invalid", "ONVO test configuration must use test keys and a recurring test price.");
    }
    return await ensurePrice();
  }

  async function listProviderInvoices(account: Account) {
    const invoices = await onvo(`/invoices?subscriptionId=${encodeURIComponent(account.subscription_id!)}&limit=100&expand=payment_intent`) as Json;
    return Array.isArray(invoices.data) ? invoices.data as Json[] : [];
  }

  async function recordInvoice(owner: CoachOwner, invoice: Json, provider: BillingMode, subscriptionId: string) {
    const invoiceId = safeString(invoice.id);
    const periodEnd = normalizeTimestamp(invoice.periodEnd);
    const createdAt = normalizeTimestamp(invoice.createdAt);
    const amount = minorAmount(invoice.total);
    const periodStart = normalizeTimestamp(invoice.periodStart);
    const status = ["draft", "open", "paid", "void", "uncollectible"].includes(String(invoice.status))
      ? String(invoice.status) : null;
    const currency = safeString(invoice.currency);
    if (!invoiceId || !createdAt || amount === null || !currency || !status
      || (status === "paid" && (!periodStart || !periodEnd))) {
      throw new BillingRequestError(503, "onvo_invoice_incomplete", "ONVO renewal details are incomplete; retry reconciliation.");
    }
    const paymentIntentId = safeString(invoice.paymentIntentId);
    await callRpc("record_coach_billing_invoice", {
      p_provider: provider,
      p_provider_invoice_id: invoiceId,
      p_coach_id: owner.id,
      p_subscription_id: subscriptionId,
      p_payment_intent_id: paymentIntentId,
      p_status: status,
      p_amount: amount,
      p_currency: currency,
      p_created_at: createdAt,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
  }

  async function inspectOpenInvoicePayment(account: Account, invoices: Json[]): Promise<OpenInvoicePayment | null> {
    if (invoices.length !== 1) return null;
    const invoice = invoices[0];
    const invoiceId = providerId(invoice.id);
    const paymentIntentId = providerId(invoice.paymentIntentId);
    const amount = minorAmount(invoice.total);
    if (!invoiceId || !paymentIntentId || invoice.status !== "open" || amount === null || amount <= 0 ||
      amount !== account.plan_amount || !account.plan_currency || invoice.currency !== account.plan_currency) return null;

    const intent = objectValue(await onvo(`/payment-intents/${encodeURIComponent(paymentIntentId)}`));
    if (!intent || intent.id !== paymentIntentId || intent.mode !== providerMode ||
      !paymentIntentCustomerMatches(intent, account) || intent.amount !== amount || intent.currency !== invoice.currency ||
      (intent.invoiceId != null && intent.invoiceId !== invoiceId) ||
      (intent.subscriptionId != null && intent.subscriptionId !== account.subscription_id)) return null;

    if (intent.status === "succeeded" && intent.receivedAmount === amount) return { type: "pending_settlement" };
    return intent.status === "requires_action" && intent.receivedAmount === 0
      ? { type: "onvo_3ds", paymentIntentId }
      : null;
  }

  async function reconcileOnvo(owner: CoachOwner, account: Account | null, includeBankAction = false): Promise<SnapshotPayment & { account: Account | null }> {
    if (!account?.subscription_id || !account.customer_id) return { account, nextAction: null };
    const remote = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`) as Json;
    if (remote.id !== account.subscription_id || remote.customerId !== account.customer_id || remote.mode !== providerMode) {
      throw new BillingRequestError(409, "onvo_subscription_mismatch", "ONVO returned a subscription that does not match this account.");
    }
    if (isLive && remote.status === "incomplete" && !subscriptionUsesPrice(remote, account.plan_price_id)) {
      throw new BillingRequestError(409, "onvo_price_mismatch", "The live checkout price no longer matches this subscription.");
    }
    const invoices = await listProviderInvoices(account);
    for (const invoice of invoices) {
      if (!invoiceMatchesSubscription(invoice, account)) {
        throw new BillingRequestError(409, "onvo_invoice_mismatch", "ONVO returned a renewal that does not match this subscription.");
      }
      const paymentIntentId = safeString(invoice.paymentIntentId);
      if (invoice.status === "paid" && !paymentIntentId) {
        throw new BillingRequestError(503, "payment_not_available", "ONVO payment confirmation is not available yet; retry reconciliation.");
      }
      if (invoice.status === "paid" && paymentIntentId) {
        const intent = await onvo(`/payment-intents/${encodeURIComponent(paymentIntentId)}`) as Json;
        if (paymentIntentConfirmsInvoice(intent, invoice, account)) {
          await recordInvoice(owner, { ...invoice, paymentIntentId }, mode, account.subscription_id);
        } else if (intent.mode !== providerMode || !paymentIntentCustomerMatches(intent, account) || intent.id !== paymentIntentId) {
          throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO returned a payment that does not match this renewal.");
        } else if (intent.status !== "succeeded") {
          await recordInvoice(owner, { ...invoice, status: "open" }, mode, account.subscription_id);
        } else {
          throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO payment amount does not match this renewal.");
        }
      } else {
        await recordInvoice(owner, invoice, mode, account.subscription_id);
      }
    }
    const current = await getOwnerAccount(owner);
    const remoteUpdatedAt = normalizeTimestamp(remote.updatedAt);
    const lastProviderUpdate = normalizeTimestamp(current?.onvo_subscription_updated_at);
    const openPayment = isLive && canSubscribe(owner) && remote.status === "incomplete" &&
        !account.paid_through && !current?.paid_through && !hasActiveLegacyPaidAccess(owner.coachPlan, owner.nextPlanPaymentDate)
      ? await inspectOpenInvoicePayment(account, invoices)
      : null;
    const paymentPendingSettlement = openPayment?.type === "pending_settlement";
    if (remoteUpdatedAt && lastProviderUpdate && remoteUpdatedAt < lastProviderUpdate) {
      return { account: current, nextAction: null, paymentPendingSettlement };
    }
    const remoteMethodId = safeString(remote.paymentMethodId) ?? current?.payment_method_id ?? null;
    const card = await getPaymentMethodIfOwned({ ...(current ?? account), payment_method_id: remoteMethodId });
    const sameCard = remoteMethodId === current?.payment_method_id;
    const updated = await saveAccount(owner.id, {
      customer_id: String(remote.customerId ?? current?.customer_id ?? ""),
      subscription_id: String(remote.id),
      subscription_status: ["incomplete", "active", "past_due", "canceled", "unpaid", "incomplete_expired", "trialing"].includes(String(remote.status)) ? String(remote.status) : "incomplete",
      payment_method_id: remoteMethodId,
      payment_method_brand: card?.brand ?? (sameCard ? current?.payment_method_brand : null) ?? null,
      payment_method_last4: card?.last4 ?? (sameCard ? current?.payment_method_last4 : null) ?? null,
      payment_method_exp_month: card?.expMonth ?? (sameCard ? current?.payment_method_exp_month : null) ?? null,
      payment_method_exp_year: card?.expYear ?? (sameCard ? current?.payment_method_exp_year : null) ?? null,
      current_period_start: normalizeTimestamp(remote.currentPeriodStart),
      current_period_end: normalizeTimestamp(remote.currentPeriodEnd),
      cancel_at_period_end: remote.cancelAtPeriodEnd === true,
      cancel_at: normalizeTimestamp(remote.cancelAt),
      canceled_at: normalizeTimestamp(remote.canceledAt),
      ...(remoteUpdatedAt ? { onvo_subscription_updated_at: remoteUpdatedAt } : {}),
    }, current);
    const nextAction = includeBankAction && openPayment?.type === "onvo_3ds"
      ? openPayment
      : null;
    return { account: updated, nextAction, paymentPendingSettlement };
  }

  async function getPaymentMethodIfOwned(account: Account | null) {
    if (!account?.payment_method_id || !account.customer_id || mode === "simulator") return null;
    const method = await onvo(`/payment-methods/${encodeURIComponent(account.payment_method_id)}`) as Json;
    if (method.id !== account.payment_method_id || method.customerId !== account.customer_id || method.mode !== providerMode || method.status !== "active") return null;
    return parseCard(method.card);
  }

  async function snapshot(owner: CoachOwner, includeBankAction = false) {
    if (mode === "simulator") {
      if (!localSimulatorAllowed) return emptySnapshot(mode, "The local simulator is disabled outside local Supabase.");
      const account = await getOwnerAccount(owner);
      const invoices = await invoiceRows(owner.id);
      return { ...toSnapshot(owner, account, invoices), configured: true };
    }
    const testPlan = isLive ? null : await configuredPlan();
    if (!isLive && !testPlan) return configurationMissing();
    const account = await getOwnerAccount(owner);
    if (isLive && !account?.subscription_id && !canSubscribe(owner)) return liveDisabledSnapshot();
    // Existing subscribers remain able to check status and cancel if a catalog price is retired.
    const plan = isLive && !account?.subscription_id ? await configuredPlan() : testPlan;
    const reconciled = await reconcileOnvo(owner, account, includeBankAction);
    const invoices = await invoiceRows(owner.id);
    return toSnapshot(owner, reconciled.account, invoices, plan, reconciled);
  }

  async function subscribe(owner: CoachOwner) {
    requireBillingReady();
    if (!canSubscribe(owner)) throw new BillingRequestError(403, "billing_invite_required", "La suscripción Pro aún no está disponible para tu cuenta.");
    const claimId = await claim(owner.id);
    try {
      let account = await getOwnerAccount(owner);
      const reusableSubscription = Boolean(account?.subscription_id)
        && account?.subscription_status !== "canceled"
        && account?.subscription_status !== "incomplete_expired";
      const paidAccessRemains = hasActiveLegacyPaidAccess(owner.coachPlan, owner.nextPlanPaymentDate)
        || hasActiveLegacyPaidAccess("paid", account?.paid_through);
      if (paidAccessRemains && !reusableSubscription) {
        throw new BillingRequestError(409, "legacy_pro_active", "Your current Pro access is already paid through its displayed date. A new subscription can start after that access expires.");
      }
      if (mode === "simulator") {
        if (!localSimulatorAllowed) throw new BillingRequestError(403, "simulator_not_allowed", "The local simulator is available only with local Supabase.");
        if (account?.subscription_id) {
          if (account.cancel_at_period_end) {
            account = await saveAccount(owner.id, { cancel_at_period_end: false, cancel_at: null }, account);
            return toSnapshot(owner, account, await invoiceRows(owner.id));
          }
          return await snapshot(owner);
        }
        const newAccount = await saveAccount(owner.id, {
          subscription_id: `sim-sub-${owner.id}`,
          customer_id: `sim-customer-${owner.id}`,
          subscription_status: "incomplete",
          payment_method_id: null,
          plan_name: "Pro (local simulation)",
          plan_amount: null,
          plan_currency: null,
          plan_interval: null,
          plan_interval_count: null,
        }, account);
        return toSnapshot(owner, newAccount);
      }
      const testPlan = isLive ? null : await configuredPlan();
      if (!isLive && !testPlan) return configurationMissing();
      if (account?.subscription_id) {
        if (!account.customer_id) throw new BillingRequestError(409, "onvo_subscription_mismatch", "Stored ONVO subscription is missing its customer identity.");
        const existing = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`) as Json;
        if (existing.id !== account.subscription_id || existing.customerId !== account.customer_id || existing.mode !== providerMode) {
          throw new BillingRequestError(409, "onvo_subscription_mismatch", "ONVO returned a subscription that does not match this account.");
        }
        if (existing.status !== "canceled" && existing.status !== "incomplete_expired") {
          if (existing.cancelAtPeriodEnd !== true || (isLive && existing.status === "incomplete")) {
            const reconciled = await reconcileOnvo(owner, account);
            if (existing.cancelAtPeriodEnd !== true || reconciled.paymentPendingSettlement) {
              return toSnapshot(owner, reconciled.account, await invoiceRows(owner.id), testPlan, reconciled);
            }
          }
          const resumed = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`, "POST", { cancelAtPeriodEnd: false }) as Json;
          if (resumed.id !== account.subscription_id || resumed.customerId !== account.customer_id || resumed.mode !== providerMode || resumed.cancelAtPeriodEnd !== false) {
            throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not confirm the subscription resume.");
          }
          const resumedAt = normalizeTimestamp(resumed.updatedAt);
          account = await saveAccount(owner.id, {
            subscription_status: String(resumed.status ?? account.subscription_status),
            cancel_at_period_end: false,
            cancel_at: normalizeTimestamp(resumed.cancelAt),
            current_period_end: normalizeTimestamp(resumed.currentPeriodEnd),
            ...(resumedAt ? { onvo_subscription_updated_at: resumedAt } : {}),
          }, account);
          return toSnapshot(owner, account, await invoiceRows(owner.id), testPlan);
        }
      }
      if (paidAccessRemains) {
        throw new BillingRequestError(409, "legacy_pro_active", "Your current Pro access is already paid through its displayed date. A new subscription can start after that access expires.");
      }
      const plan = testPlan ?? await configuredPlan();
      if (!plan) return configurationMissing();
      let customerId = account?.customer_id ?? null;
      if (!customerId) {
        // An email address alone does not prove ownership of an existing live customer.
        const existingCustomers = !isLive && owner.email
          ? await onvo(`/customers?email=${encodeURIComponent(owner.email)}&limit=100`) as Json
          : null;
        const existingCustomer = Array.isArray(existingCustomers?.data)
          ? (existingCustomers.data as Json[]).find((item) => item.email === owner.email && item.mode === "test")
          : null;
        const customer = existingCustomer ?? await onvo("/customers", "POST", { email: owner.email, name: owner.name }) as Json;
        customerId = safeString(customer.id);
        if (!customerId || customer.mode !== providerMode) throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not return a customer in the expected billing mode.");
        if (isLive) account = await saveAccount(owner.id, { customer_id: customerId }, account);
      }
      const remoteList = await onvo(`/subscriptions?customerId=${encodeURIComponent(customerId)}&limit=100`) as Json;
      const matching = Array.isArray(remoteList.data) ? (remoteList.data as Json[]).find((item) =>
        item.mode === providerMode && item.customerId === customerId && (item.metadata as Json | undefined)?.coachId === owner.id
          && (!isLive || (item.metadata as Json | undefined)?.purpose === "trainer-pro")
          && item.status !== "canceled" && item.status !== "incomplete_expired"
      ) : null;
      let subscription: Json;
      if (matching) subscription = matching;
      else {
        if (account?.subscription_create_pending) {
          throw new BillingRequestError(409, "subscription_creation_pending", "A prior subscription request is still being reconciled. No second subscription was created.");
        }
        account = await saveAccount(owner.id, { customer_id: customerId, subscription_create_pending: true }, account);
        // ONVO has no documented idempotency key. Preserve this marker on any error
        // because the remote POST may have succeeded before its response was lost.
        subscription = await onvo("/subscriptions", "POST", {
          customerId,
          paymentBehavior: "allow_incomplete",
          items: [{ priceId: plan.id, quantity: 1 }],
          metadata: { coachId: owner.id, purpose: "trainer-pro" },
        }) as Json;
      }
      const subscriptionId = safeString(subscription.id);
      if (!subscriptionId || subscription.customerId !== customerId || subscription.mode !== providerMode) throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not return a matching subscription in the expected billing mode.");
      if (isLive && !subscriptionUsesPrice(subscription, plan.id)) {
        throw new BillingRequestError(409, "onvo_price_mismatch", "ONVO returned a subscription with a different price.");
      }
      account = await saveAccount(owner.id, {
        customer_id: customerId,
        subscription_id: subscriptionId,
        subscription_create_pending: false,
        subscription_status: String(subscription.status ?? "incomplete"),
        onvo_subscription_updated_at: normalizeTimestamp(subscription.updatedAt),
        payment_method_id: safeString(subscription.paymentMethodId),
        current_period_start: normalizeTimestamp(subscription.currentPeriodStart),
        current_period_end: normalizeTimestamp(subscription.currentPeriodEnd),
        cancel_at_period_end: subscription.cancelAtPeriodEnd === true,
        cancel_at: normalizeTimestamp(subscription.cancelAt),
        canceled_at: normalizeTimestamp(subscription.canceledAt),
        plan_price_id: plan.id,
        plan_name: plan.name,
        plan_amount: plan.amount,
        plan_currency: plan.currency,
        plan_interval: plan.interval,
        plan_interval_count: plan.intervalCount,
      }, account);
      if (isLive && matching && account.subscription_status === "incomplete") {
        const reconciled = await reconcileOnvo(owner, account);
        return toSnapshot(owner, reconciled.account, await invoiceRows(owner.id), plan, reconciled);
      }
      return toSnapshot(owner, account, await invoiceRows(owner.id), plan);
    } finally {
      await release(owner.id, claimId);
    }
  }

  async function cancel(owner: CoachOwner) {
    requireBillingReady();
    const claimId = await claim(owner.id);
    try {
      const account = await getOwnerAccount(owner);
      if (!account?.subscription_id) throw new BillingRequestError(409, "subscription_missing", "There is no subscription to cancel.");
      if (mode === "simulator") {
        if (!localSimulatorAllowed) throw new BillingRequestError(403, "simulator_not_allowed", "The local simulator is available only with local Supabase.");
        const updated = await saveAccount(owner.id, { cancel_at_period_end: true, cancel_at: account.current_period_end }, account);
        return toSnapshot(owner, updated, await invoiceRows(owner.id));
      }
      const plan = isLive ? null : await configuredPlan();
      if (isLive) {
        const existing = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`) as Json;
        if (!account.customer_id || existing.id !== account.subscription_id || existing.customerId !== account.customer_id || existing.mode !== providerMode) {
          throw new BillingRequestError(409, "onvo_subscription_mismatch", "ONVO returned a subscription that does not match this account.");
        }
      } else if (!plan) {
        throw new BillingRequestError(503, "billing_not_configured", "ONVO test billing is not configured.");
      }
      const remote = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`, "POST", { cancelAtPeriodEnd: true }) as Json;
      if (remote.id !== account.subscription_id || remote.customerId !== account.customer_id || remote.mode !== providerMode || remote.cancelAtPeriodEnd !== true) {
        throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not confirm the scheduled cancellation.");
      }
      const cancellationUpdatedAt = normalizeTimestamp(remote.updatedAt);
      const updated = await saveAccount(owner.id, {
        subscription_status: String(remote.status ?? account.subscription_status),
        cancel_at_period_end: true,
        cancel_at: normalizeTimestamp(remote.cancelAt),
        current_period_end: normalizeTimestamp(remote.currentPeriodEnd),
        canceled_at: normalizeTimestamp(remote.canceledAt),
        ...(cancellationUpdatedAt ? { onvo_subscription_updated_at: cancellationUpdatedAt } : {}),
      }, account);
      return toSnapshot(owner, updated, await invoiceRows(owner.id), plan);
    } finally {
      await release(owner.id, claimId);
    }
  }

  async function changePaymentMethod(owner: CoachOwner, paymentMethodId: string) {
    requireBillingReady();
    if (isLive) throw new BillingRequestError(403, "billing_payment_method_contact_support", "Contactá a soporte para cambiar el método de pago de Pro.");
    const claimId = await claim(owner.id);
    try {
      const account = await getOwnerAccount(owner);
      if (!account?.subscription_id || !account.customer_id) throw new BillingRequestError(409, "subscription_missing", "There is no subscription to update.");
      if (mode === "simulator") {
        if (!localSimulatorAllowed) throw new BillingRequestError(403, "simulator_not_allowed", "The local simulator is available only with local Supabase.");
        if (paymentMethodId !== "sim-pm-replacement") {
          throw new BillingRequestError(403, "payment_method_not_owned", "The simulated payment method is not recognized for this trainer.");
        }
        const updated = await saveAccount(owner.id, {
          payment_method_id: `sim-pm-${owner.id}-replacement`,
          payment_method_brand: "Visa",
          payment_method_last4: "4242",
          payment_method_exp_month: 12,
          payment_method_exp_year: new Date().getUTCFullYear() + 2,
        }, account);
        return toSnapshot(owner, updated, await invoiceRows(owner.id));
      }
      const plan = await configuredPlan();
      if (!plan) throw new BillingRequestError(503, "billing_not_configured", "ONVO test billing is not configured.");
      const remoteMethod = await onvo(`/payment-methods/${encodeURIComponent(paymentMethodId)}`) as Json;
      if (remoteMethod.customerId !== account.customer_id || remoteMethod.mode !== "test" || remoteMethod.status !== "active" || remoteMethod.type !== "card") {
        throw new BillingRequestError(403, "payment_method_not_owned", "The payment method is not active on this trainer account.");
      }
      const updatedSub = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`, "POST", { paymentMethodId }) as Json;
      if (updatedSub.id !== account.subscription_id || updatedSub.customerId !== account.customer_id || updatedSub.mode !== "test" || updatedSub.paymentMethodId !== paymentMethodId) {
        throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not confirm the payment method update.");
      }
      const card = parseCard(remoteMethod.card);
      const updated = await saveAccount(owner.id, {
        payment_method_id: paymentMethodId,
        payment_method_brand: card?.brand ?? null,
        payment_method_last4: card?.last4 ?? null,
        payment_method_exp_month: card?.expMonth ?? null,
        payment_method_exp_year: card?.expYear ?? null,
      }, account);
      return toSnapshot(owner, updated, await invoiceRows(owner.id), plan);
    } finally {
      await release(owner.id, claimId);
    }
  }

  async function reconcile(owner: CoachOwner) {
    requireBillingReady();
    return await withCoachLock(owner, () => snapshot(owner, true));
  }

  async function simulateUnlocked(owner: CoachOwner, scenario: "success" | "decline" | "requires_action" | "renewal_failed") {
    if (!localSimulatorAllowed) throw new BillingRequestError(403, "simulator_not_allowed", "The local simulator is available only with local Supabase.");
    const account = await getOwnerAccount(owner);
    const subId = account?.subscription_id ?? `sim-sub-${owner.id}`;
    const customerId = account?.customer_id ?? `sim-customer-${owner.id}`;
    const today = new Date();
    const periodStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
    let status = "incomplete";
    let nextAction: Json | null = null;
    if (scenario === "success") status = "active";
    if (scenario === "renewal_failed") status = "past_due";
    if (scenario === "requires_action") nextAction = { type: "simulated_bank" };
    const invoiceId = `sim-invoice-${owner.id}-${periodStart.toISOString().slice(0, 10)}`;
    if (scenario === "success" || scenario === "renewal_failed") {
      await callRpc("record_coach_billing_invoice", {
        p_provider: "simulator",
        p_provider_invoice_id: invoiceId,
        p_coach_id: owner.id,
        p_subscription_id: subId,
        p_payment_intent_id: `sim-pi-${invoiceId}`,
        p_status: scenario === "success" ? "paid" : "failed",
        p_amount: 0,
        p_currency: "CRC",
        p_created_at: new Date().toISOString(),
        p_period_start: periodStart.toISOString(),
        p_period_end: periodEnd.toISOString(),
      });
    }
    const updated = await saveAccount(owner.id, {
      customer_id: customerId,
      subscription_id: subId,
      subscription_status: status,
      ...(scenario === "success" ? {
        payment_method_id: `sim-pm-${owner.id}-initial`,
        payment_method_brand: "Visa",
        payment_method_last4: "4242",
        payment_method_exp_month: 12,
        payment_method_exp_year: new Date().getUTCFullYear() + 2,
      } : {}),
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      paid_through: scenario === "success" ? datePart(periodEnd.toISOString()) : account?.paid_through ?? null,
      plan_name: "Pro (local simulation)",
      plan_amount: null,
      plan_currency: null,
      plan_interval: null,
      plan_interval_count: null,
    }, account);
    return { ...toSnapshot(owner, updated, await invoiceRows(owner.id), undefined, { nextAction }), configured: true };
  }

  async function simulate(owner: CoachOwner, scenario: "success" | "decline" | "requires_action" | "renewal_failed") {
    if (!localSimulatorAllowed) throw new BillingRequestError(403, "simulator_not_allowed", "The local simulator is available only with local Supabase.");
    return await withCoachLock(owner, () => simulateUnlocked(owner, scenario));
  }

  async function recordWebhook(owner: CoachOwner, eventKey: string, eventType: string, data: Json) {
    const account = await getOwnerAccount(owner);
    if (!account?.subscription_id || !account.customer_id) throw new BillingRequestError(409, "subscription_missing", "Webhook did not match a stored trainer subscription.");
    if (data.subscriptionId !== account.subscription_id) throw new BillingRequestError(403, "webhook_owner_mismatch", "Webhook subscription did not match the trainer account.");
    const objectId = safeString(data.id) ?? safeString(data.paymentIntentId) ?? account.subscription_id;
    const priorEvents = await rows<{ event_key: string }>(
      "coach_billing_events",
      `event_key=eq.${encodeURIComponent(eventKey)}&select=event_key&limit=1`,
    );
    if (priorEvents.length) return { received: true, duplicate: true };
    const invoices = await listProviderInvoices(account);
    const invoiceId = safeString(data.id);
    const invoice = invoices.find((item) => item.id === invoiceId || item.paymentIntentId === data.paymentIntentId);
    if (!invoice) throw new BillingRequestError(503, "renewal_not_available", "ONVO renewal is not available yet; retry webhook delivery.");
    if (!invoiceMatchesSubscription(invoice, account)) {
      throw new BillingRequestError(409, "onvo_invoice_mismatch", "ONVO returned a renewal that does not match this subscription.");
    }
    if (invoice.status === "paid") {
      if (!invoice.paymentIntentId) throw new BillingRequestError(503, "payment_not_available", "ONVO payment confirmation is not available yet; retry webhook delivery.");
      const intent = await onvo(`/payment-intents/${encodeURIComponent(String(invoice.paymentIntentId))}`) as Json;
      if (!paymentIntentConfirmsInvoice(intent, invoice, account)) {
        if (intent.mode !== "test" || !paymentIntentCustomerMatches(intent, account) || intent.id !== invoice.paymentIntentId) {
          throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO returned a payment that does not match this renewal.");
        }
        if (intent.status === "succeeded") throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO payment amount does not match this renewal.");
        throw new BillingRequestError(503, "payment_not_available", "ONVO payment is not confirmed yet; retry webhook delivery.");
      }
      await recordInvoice(owner, invoice, "onvo_test", account.subscription_id);
    } else {
      await recordInvoice(owner, invoice, "onvo_test", account.subscription_id);
    }
    await reconcileOnvo(owner, account);
    const recorded = await callRpc("claim_coach_billing_event", {
      p_event_key: eventKey,
      p_coach_id: owner.id,
      p_event_type: eventType,
      p_provider_object_id: objectId,
    });
    return { received: true, duplicate: recorded !== true, reconciled: true };
  }

  async function receiveWebhook(eventKey: string, eventType: string, data: Json) {
    if (mode !== "onvo_test" || !webhookSecret) throw new BillingRequestError(503, "webhook_not_configured", "Webhook verification is not configured.");
    const subscriptionId = safeString(data.subscriptionId);
    if (!subscriptionId) throw new BillingRequestError(400, "invalid_webhook", "Webhook has no subscription identity.");
    const matches = await rows<Account>(
      "coach_billing_accounts",
      `subscription_id=eq.${encodeURIComponent(subscriptionId)}&mode=eq.onvo_test&select=*`,
    );
    const account = matches[0];
    if (!account) throw new BillingRequestError(404, "subscription_missing", "Webhook subscription was not found.");
    const coaches = await rows<Json>(
      "coaches",
      `id=eq.${encodeURIComponent(account.coach_id)}&role=eq.coach&account_type=eq.independent&select=id,email,name&limit=1`,
    );
    if (!coaches[0] || coaches[0].id !== account.coach_id) throw new BillingRequestError(404, "coach_missing", "Webhook owner was not found.");
    const owner = { id: account.coach_id, email: safeString(coaches[0].email), name: safeString(coaches[0].name) };
    return await withCoachLock(owner, () => recordWebhook(owner, eventKey, eventType, data));
  }

  async function getSignedProviderObject(path: string, signal: AbortSignal): Promise<Json> {
    const result = objectValue(await onvo(path, "GET", undefined, signal));
    if (!result) throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not return a billing object.");
    return result;
  }

  function signedProviderMatches(object: Json, event: OnvoSignedBillingEvent) {
    return object.mode === event.mode && (object.accountId == null || object.accountId === event.accountId);
  }

  async function findSignedAccount(field: "customer_id" | "subscription_id", id: string, signal: AbortSignal) {
    const accounts = await rows<Account>("coach_billing_accounts", `${field}=eq.${encodeURIComponent(id)}&mode=eq.${mode}&select=*&limit=2`, signal);
    if (accounts.length > 1) throw new BillingRequestError(409, "webhook_owner_mismatch", "ONVO billing identity belongs to more than one account.");
    const account = accounts[0];
    if (account && (account[field] !== id || account.mode !== mode)) {
      throw new BillingRequestError(409, "webhook_owner_mismatch", "ONVO billing identity does not match the account.");
    }
    return account;
  }

  async function receiveSignedWebhook(event: OnvoSignedBillingEvent) {
    if (!signedWebhook) throw new BillingRequestError(503, "webhook_not_configured", "Signed webhook verification is not configured.");
    if (event.mode !== signedWebhook.mode || event.accountId !== signedWebhook.accountId || !providerId(event.id)) {
      throw new BillingRequestError(403, "webhook_owner_mismatch", "Signed webhook does not match this ONVO environment.");
    }
    const signal = AbortSignal.timeout(7_500);
    const eventKey = `onvo-signed:${mode}:${event.accountId}:${event.id}`;
    const recorded = await rows<{ event_key: string }>("coach_billing_events", `event_key=eq.${encodeURIComponent(eventKey)}&select=event_key&limit=1`, signal);
    if (recorded.length) return { received: true, duplicate: true };

    const initialPayment = event.type === "payment_intent.succeeded";
    const failedRenewal = event.type === "subscription_renewal.failed";
    const paymentIntentId = providerId(initialPayment ? event.data.id : event.data.paymentIntentId);
    const eventInvoiceId = providerId(event.data.invoiceId);
    const eventSubscriptionId = providerId(event.data.subscriptionId);
    if ((initialPayment && !paymentIntentId) ||
      (!initialPayment && (!eventInvoiceId || !eventSubscriptionId ||
        (!paymentIntentId && (!failedRenewal || event.data.paymentIntentId != null))))) {
      throw new BillingRequestError(400, "invalid_webhook", "Signed webhook is missing a billing identity.");
    }

    let account: Account | undefined;
    let initialIntent: Json | null = null;
    if (initialPayment) {
      initialIntent = await getSignedProviderObject(`/payment-intents/${encodeURIComponent(paymentIntentId!)}`, signal);
      if (initialIntent.id !== paymentIntentId || !signedProviderMatches(initialIntent, event)) {
        throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO payment does not match the signed event.");
      }
      const customerId = providerId(paymentIntentCustomerId(initialIntent));
      if (event.data.customerId != null && event.data.customerId !== customerId) {
        throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO payment customer does not match the signed event.");
      }
      if (!customerId) return { received: true, ignored: true };
      account = await findSignedAccount("customer_id", customerId, signal);
    } else {
      account = await findSignedAccount("subscription_id", eventSubscriptionId!, signal);
    }
    if (!account) return { received: true, ignored: true };
    if (account.subscription_create_pending) {
      throw new BillingRequestError(503, "subscription_not_available", "ONVO subscription is being saved; retry webhook delivery.");
    }
    if (!account.subscription_id || !account.customer_id) return { received: true, ignored: true };
    const subscriptionId = account.subscription_id;
    let invoice: Json | null;
    if (initialPayment) {
      const query = new URLSearchParams({ subscriptionId, paymentIntentId: paymentIntentId!, customerId: account.customer_id, limit: "2" });
      const result = await getSignedProviderObject(`/invoices?${query}`, signal);
      if (!Array.isArray(result.data)) throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not return billing invoices.");
      const matches = (result.data as Json[]).filter((item) => item?.paymentIntentId === paymentIntentId);
      if (matches.length > 1) throw new BillingRequestError(409, "onvo_invoice_mismatch", "ONVO returned more than one invoice for a payment.");
      invoice = matches[0] ?? null;
      // Payment events also cover one-off charges. An unfinished checkout may still be settling.
      if (!invoice && account.subscription_status !== "incomplete" && account.paid_through) {
        return { received: true, ignored: true };
      }
    } else {
      invoice = await getSignedProviderObject(`/invoices/${encodeURIComponent(eventInvoiceId!)}`, signal);
    }
    if (!invoice) throw new BillingRequestError(503, "renewal_not_available", "ONVO invoice is not available yet; retry webhook delivery.");
    if (!invoiceMatchesSubscription(invoice, account) || !signedProviderMatches(invoice, event) ||
      (!initialPayment && invoice.id !== eventInvoiceId)) {
      throw new BillingRequestError(409, "onvo_invoice_mismatch", "ONVO invoice does not match the stored subscription and signed event.");
    }

    const attemptCount = minorAmount(event.data.attemptCount);
    const invoiceAttemptCount = minorAmount(invoice.attemptCount);
    // Record earlier failed attempts without applying a newer invoice on their behalf.
    const supersededFailure = failedRenewal && (invoice.status === "paid" ||
      (attemptCount !== null && invoiceAttemptCount !== null && invoiceAttemptCount > attemptCount));
    if (!supersededFailure && (invoice.paymentIntentId ?? null) !== paymentIntentId) {
      throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO invoice payment does not match the signed event.");
    }
    const status = safeString(invoice.status);
    const invoiceId = providerId(invoice.id);
    const amount = minorAmount(invoice.total);
    const currency = safeString(invoice.currency);
    const createdAt = normalizeTimestamp(invoice.createdAt);
    const periodStart = normalizeTimestamp(invoice.periodStart);
    const periodEnd = normalizeTimestamp(invoice.periodEnd);
    if (!invoiceId || !createdAt || amount === null || !currency || !status ||
      !["draft", "open", "paid", "void", "uncollectible"].includes(status) ||
      (!failedRenewal && (status !== "paid" || amount === 0 || !periodStart || !periodEnd || periodStart >= periodEnd))) {
      throw new BillingRequestError(503, "onvo_invoice_incomplete", "ONVO invoice or payment is not yet confirmed; retry webhook delivery.");
    }

    const invoiceSnapshot = supersededFailure ? null : {
      id: invoiceId,
      payment_intent_id: paymentIntentId,
      status,
      amount,
      currency,
      created_at: createdAt,
      period_start: periodStart,
      period_end: periodEnd,
    };
    let subscription: Json | null = null;
    let fiscal: ReturnType<typeof fiscalEvidence> | null = null;
    if (!supersededFailure) {
      const [remote, intent] = await Promise.all([
        getSignedProviderObject(`/subscriptions/${encodeURIComponent(subscriptionId)}`, signal),
        failedRenewal ? null : initialIntent ?? getSignedProviderObject(`/payment-intents/${encodeURIComponent(paymentIntentId!)}`, signal),
      ]);
      if (remote.id !== subscriptionId || remote.customerId !== account.customer_id || !signedProviderMatches(remote, event)) {
        throw new BillingRequestError(409, "onvo_subscription_mismatch", "ONVO subscription does not match the stored account.");
      }
      if (!failedRenewal) {
        if (!intent || !signedProviderMatches(intent, event) || intent.id !== paymentIntentId ||
          intent.status !== "succeeded" || !paymentIntentCustomerMatches(intent, account)) {
          throw new BillingRequestError(503, "payment_not_available", "ONVO has not confirmed that the invoice was paid; retry webhook delivery.");
        }
        const amountMatches = isLive || signedTestAmountMatchesInvoice(intent, invoice);
        if (bonfireEnabled) fiscal = fiscalEvidence(event, intent, remote, account, amountMatches);
        if (fiscal?.review_reason === "onvo_amount_mismatch") {
          const recorded = await callRpc("record_coach_billing_fiscal_review", {
            p_coach_id: account.coach_id,
            p_provider: mode,
            p_subscription_id: subscriptionId,
            p_invoice: invoiceSnapshot,
            p_fiscal: fiscal,
          }, signal);
          if (typeof recorded !== "boolean") throw new BillingRequestError(502, "billing_storage_invalid_response", "Billing storage did not confirm the fiscal review.");
          return { received: true, duplicate: !recorded, fiscalReview: true };
        }
        if (!amountMatches || !paymentIntentConfirmsInvoice(intent, invoice, account)) {
          throw new BillingRequestError(503, "payment_not_available", "ONVO has not confirmed that the invoice was paid; retry webhook delivery.");
        }
      }
      if (isLive && !failedRenewal && account.subscription_status === "incomplete" && !subscriptionUsesPrice(remote, account.plan_price_id)) {
        throw new BillingRequestError(409, "onvo_price_mismatch", "The live checkout price does not match this subscription.");
      }
      const subscriptionStatus = safeString(remote.status);
      if (!subscriptionStatus || !["incomplete", "active", "past_due", "canceled", "unpaid", "incomplete_expired", "trialing"].includes(subscriptionStatus) ||
        (!failedRenewal && subscriptionStatus === "incomplete")) {
        throw new BillingRequestError(503, "subscription_not_available", "ONVO subscription state is not available yet; retry webhook delivery.");
      }
      subscription = {
        status: subscriptionStatus,
        current_period_start: normalizeTimestamp(remote.currentPeriodStart),
        current_period_end: normalizeTimestamp(remote.currentPeriodEnd),
        cancel_at_period_end: remote.cancelAtPeriodEnd === true,
        cancel_at: normalizeTimestamp(remote.cancelAt),
        canceled_at: normalizeTimestamp(remote.canceledAt),
        updated_at: normalizeTimestamp(remote.updatedAt),
      };
    }
    const inserted = await callRpc(fiscal ? "record_coach_billing_signed_event_with_fiscal" : "record_coach_billing_signed_event", {
      p_event_key: eventKey,
      p_coach_id: account.coach_id,
      p_event_type: event.type,
      p_provider_object_id: invoiceId,
      p_provider: mode,
      p_subscription_id: subscriptionId,
      p_invoice: invoiceSnapshot,
      p_subscription: subscription,
      p_attempt_count: failedRenewal && attemptCount !== null && attemptCount <= 2_147_483_647 ? attemptCount : null,
      p_next_payment_attempt: failedRenewal ? normalizeTimestamp(event.data.nextPaymentAttempt) : null,
      ...(fiscal ? { p_fiscal: fiscal } : {}),
    }, signal);
    if (typeof inserted !== "boolean") throw new BillingRequestError(502, "billing_storage_invalid_response", "Billing storage did not confirm the webhook.");
    return { received: true, duplicate: !inserted };
  }

  return {
    authenticate: authUser,
    allowedOrigins,
    status: (owner: CoachOwner) => nonLiveOnProduction || (isLive && (!liveConfigReady || !onvoKeysConfigured))
      ? Promise.resolve(liveDisabledSnapshot())
      : withCoachLock(owner, () => snapshot(owner)),
    subscribe,
    reconcile,
    cancel,
    changePaymentMethod,
    simulate,
    receiveWebhook,
    receiveSignedWebhook,
    webhookSecret,
    signedWebhook,
    localSimulatorAllowed,
  };
}
