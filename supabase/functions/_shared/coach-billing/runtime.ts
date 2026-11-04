import { BillingRequestError, type CoachBillingHandlerDependencies, type CoachOwner } from "./handler.ts";

type Json = Record<string, unknown>;
type BillingMode = "simulator" | "onvo_test";
type Account = {
  coach_id: string;
  mode: BillingMode;
  customer_id: string | null;
  subscription_id: string | null;
  subscription_create_pending: boolean;
  subscription_status: string | null;
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
  throw new BillingRequestError(503, "billing_mode_invalid", "COACH_BILLING_MODE must be simulator or onvo_test.");
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
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
  return invoice.mode === "test"
    && invoice.subscriptionId === account.subscription_id
    && invoice.customerId === account.customer_id;
}

export function paymentIntentConfirmsInvoice(intent: Json, invoice: Json, account: Account) {
  return intent.id === invoice.paymentIntentId
    && intent.mode === "test"
    && intent.status === "succeeded"
    && intent.customerId === account.customer_id
    && intent.currency === invoice.currency
    && minorAmount(intent.amount) !== null
    && intent.amount === invoice.total;
}

function minorAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
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
  localSimulatorAllowed: boolean;
  receiveWebhook(eventKey: string, eventType: string, data: Json): Promise<unknown>;
} {
  const mode = selectMode(env);
  const localSimulatorAllowed = localOnlySimulatorAllowed(env);
  const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const anonKey = env.SUPABASE_ANON_KEY ?? env.ANON_KEY ?? "";
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";
  const secretKey = env.ONVO_SECRET_KEY ?? "";
  const publishableKey = env.ONVO_PUBLISHABLE_KEY ?? "";
  const priceId = env.ONVO_PRICE_ID ?? "";
  const webhookSecret = env.ONVO_WEBHOOK_SECRET ?? "";

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

  async function onvo(path: string, method = "GET", body?: unknown): Promise<unknown> {
    if (!secretKey.startsWith("onvo_test_secret_key_") || !publishableKey.startsWith("onvo_test_publishable_key_") || !priceId) {
      throw new BillingRequestError(503, "billing_not_configured", "ONVO test billing needs a test secret key, test publishable key, and recurring price ID.");
    }
    const response = await fetcher(`https://api.onvopay.com/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new BillingRequestError(502, "onvo_request_failed", "ONVO could not complete the billing request.");
    return result;
  }

  async function rows<T>(table: string, query: string): Promise<T[]> {
    const result = await supabase(`/rest/v1/${table}?${query}`, { method: "GET" });
    return Array.isArray(result) ? result as T[] : [];
  }

  async function callRpc(name: string, body: Json): Promise<unknown> {
    return await supabase(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
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
    const price = await onvo(`/prices/${encodeURIComponent(priceId)}`) as Json;
    const recurring = price.recurring && typeof price.recurring === "object" ? price.recurring as Json : {};
    if (price.mode !== "test" || price.type !== "recurring" || price.isActive !== true || !price.id) {
      throw new BillingRequestError(503, "onvo_price_mismatch", "The configured ONVO price is not an active recurring test price.");
    }
    const interval = ["day", "week", "month", "year"].includes(String(recurring.interval))
      ? recurring.interval as Account["plan_interval"] : null;
    const intervalCount = typeof recurring.intervalCount === "number" && recurring.intervalCount > 0
      ? Math.trunc(recurring.intervalCount) : null;
    return {
      id: String(price.id),
      name: typeof price.nickname === "string" && price.nickname ? price.nickname : "Pro",
      amount: minorAmount(price.unitAmount),
      currency: safeString(price.currency),
      interval,
      intervalCount,
    };
  }

  function toSnapshot(account: Account | null, invoices: Array<Record<string, unknown>> = [], plan?: Awaited<ReturnType<typeof ensurePrice>> | null, nextAction?: Json | null) {
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
      publicKey: mode === "onvo_test" ? publishableKey : null,
      nextAction: nextAction ?? null,
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
      checkout: mode === "onvo_test" && account?.subscription_id && account.customer_id
          && account.subscription_status === "incomplete" ? {
            subscriptionId: account.subscription_id,
            customerId: account.customer_id,
            publishableKey,
            mode: "onvo_test" as const,
          } : null,
    };
  }

  async function invoiceRows(coachId: string): Promise<Array<Record<string, unknown>>> {
    const found = await rows<Record<string, unknown>>(
      "coach_billing_invoices",
      `coach_id=eq.${encodeURIComponent(coachId)}&select=*&order=period_end.desc,created_at.desc&limit=100`,
    );
    return found;
  }

  async function getOwnerAccount(owner: CoachOwner) {
    const account = await getAccount(owner.id);
    if (account && account.mode !== mode) throw new BillingRequestError(409, "billing_mode_mismatch", "This account was created in a different local billing mode.");
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
    if (!secretKey && !publishableKey && !priceId) return null;
    if (!secretKey.startsWith("onvo_test_secret_key_") || !publishableKey.startsWith("onvo_test_publishable_key_") || !priceId) {
      throw new BillingRequestError(503, "onvo_configuration_invalid", "ONVO billing configuration must use test keys and a recurring test price.");
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

  async function reconcileOnvo(owner: CoachOwner, account: Account | null) {
    if (!account?.subscription_id || !account.customer_id) return account;
    const remote = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`) as Json;
    if (remote.id !== account.subscription_id || remote.customerId !== account.customer_id || remote.mode !== "test") {
      throw new BillingRequestError(409, "onvo_subscription_mismatch", "ONVO returned a subscription that does not match this account.");
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
          await recordInvoice(owner, { ...invoice, paymentIntentId }, "onvo_test", account.subscription_id);
        } else if (intent.mode !== "test" || intent.customerId !== account.customer_id || intent.id !== paymentIntentId) {
          throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO returned a payment that does not match this renewal.");
        } else if (intent.status !== "succeeded") {
          await recordInvoice(owner, { ...invoice, status: "open" }, "onvo_test", account.subscription_id);
        } else {
          throw new BillingRequestError(409, "onvo_payment_mismatch", "ONVO payment amount does not match this renewal.");
        }
      } else {
        await recordInvoice(owner, invoice, "onvo_test", account.subscription_id);
      }
    }
    const current = await getAccount(owner.id);
    const card = await getPaymentMethodIfOwned(current);
    return await saveAccount(owner.id, {
      customer_id: String(remote.customerId ?? current?.customer_id ?? ""),
      subscription_id: String(remote.id),
      subscription_status: ["incomplete", "active", "past_due", "canceled", "unpaid", "incomplete_expired", "trialing"].includes(String(remote.status)) ? String(remote.status) : "incomplete",
      payment_method_id: safeString(remote.paymentMethodId) ?? current?.payment_method_id ?? null,
      payment_method_brand: card?.brand ?? current?.payment_method_brand ?? null,
      payment_method_last4: card?.last4 ?? current?.payment_method_last4 ?? null,
      payment_method_exp_month: card?.expMonth ?? current?.payment_method_exp_month ?? null,
      payment_method_exp_year: card?.expYear ?? current?.payment_method_exp_year ?? null,
      current_period_start: normalizeTimestamp(remote.currentPeriodStart),
      current_period_end: normalizeTimestamp(remote.currentPeriodEnd),
      cancel_at_period_end: remote.cancelAtPeriodEnd === true,
      cancel_at: normalizeTimestamp(remote.cancelAt),
      canceled_at: normalizeTimestamp(remote.canceledAt),
      paid_through: current?.paid_through ?? null,
    }, current);
  }

  async function getPaymentMethodIfOwned(account: Account | null) {
    if (!account?.payment_method_id || !account.customer_id || mode !== "onvo_test") return null;
    const method = await onvo(`/payment-methods/${encodeURIComponent(account.payment_method_id)}`) as Json;
    if (method.customerId !== account.customer_id || method.mode !== "test" || method.status !== "active") return null;
    return parseCard(method.card);
  }

  async function snapshot(owner: CoachOwner, reconcile = false) {
    if (mode === "simulator") {
      if (!localSimulatorAllowed) return emptySnapshot(mode, "The local simulator is disabled outside local Supabase.");
      const account = await getOwnerAccount(owner);
      const invoices = await invoiceRows(owner.id);
      return { ...toSnapshot(account, invoices), configured: true };
    }
    const plan = await configuredPlan();
    if (!plan) return emptySnapshot(mode, "Configure ONVO test keys and a recurring test price ID to enable billing.");
    let account = await getOwnerAccount(owner);
    if (reconcile) account = await reconcileOnvo(owner, account);
    const invoices = await invoiceRows(owner.id);
    return toSnapshot(account, invoices, plan);
  }

  async function subscribe(owner: CoachOwner) {
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
            return toSnapshot(account, await invoiceRows(owner.id));
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
        return toSnapshot(newAccount, [], undefined, null);
      }
      const plan = await configuredPlan();
      if (!plan) return emptySnapshot(mode, "Configure ONVO test keys and a recurring test price ID to enable billing.");
      if (account?.subscription_id) {
        if (!account.customer_id) throw new BillingRequestError(409, "onvo_subscription_mismatch", "Stored ONVO subscription is missing its customer identity.");
        const existing = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`) as Json;
        if (existing.id !== account.subscription_id || existing.customerId !== account.customer_id || existing.mode !== "test") {
          throw new BillingRequestError(409, "onvo_subscription_mismatch", "ONVO returned a subscription that does not match this account.");
        }
        if (existing.status !== "canceled" && existing.status !== "incomplete_expired") {
          if (existing.cancelAtPeriodEnd === true) {
            const resumed = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`, "POST", { cancelAtPeriodEnd: false }) as Json;
            if (resumed.id !== account.subscription_id || resumed.customerId !== account.customer_id || resumed.mode !== "test" || resumed.cancelAtPeriodEnd !== false) {
              throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not confirm the subscription resume.");
            }
            account = await saveAccount(owner.id, {
              subscription_status: String(resumed.status ?? account.subscription_status),
              cancel_at_period_end: false,
              cancel_at: normalizeTimestamp(resumed.cancelAt),
              current_period_end: normalizeTimestamp(resumed.currentPeriodEnd),
            }, account);
            return toSnapshot(account, await invoiceRows(owner.id), plan);
          }
          account = await reconcileOnvo(owner, account);
          return toSnapshot(account, await invoiceRows(owner.id), plan);
        }
      }
      if (paidAccessRemains) {
        throw new BillingRequestError(409, "legacy_pro_active", "Your current Pro access is already paid through its displayed date. A new subscription can start after that access expires.");
      }
      let customerId = account?.customer_id ?? null;
      if (!customerId) {
        const existingCustomers = owner.email
          ? await onvo(`/customers?email=${encodeURIComponent(owner.email)}&limit=100`) as Json
          : null;
        const existingCustomer = Array.isArray(existingCustomers?.data)
          ? (existingCustomers.data as Json[]).find((item) => item.email === owner.email && item.mode === "test")
          : null;
        const customer = existingCustomer ?? await onvo("/customers", "POST", { email: owner.email, name: owner.name }) as Json;
        customerId = safeString(customer.id);
        if (!customerId || customer.mode !== "test") throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not return a matching test customer.");
      }
      const remoteList = await onvo(`/subscriptions?customerId=${encodeURIComponent(customerId)}&limit=100`) as Json;
      const matching = Array.isArray(remoteList.data) ? (remoteList.data as Json[]).find((item) =>
        item.mode === "test" && item.customerId === customerId && (item.metadata as Json | undefined)?.coachId === owner.id
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
      if (!subscriptionId || subscription.customerId !== customerId || subscription.mode !== "test") throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not return a matching test subscription.");
      account = await saveAccount(owner.id, {
        customer_id: customerId,
        subscription_id: subscriptionId,
        subscription_create_pending: false,
        subscription_status: String(subscription.status ?? "incomplete"),
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
      return toSnapshot(account, await invoiceRows(owner.id), plan);
    } finally {
      await release(owner.id, claimId);
    }
  }

  async function cancel(owner: CoachOwner) {
    const claimId = await claim(owner.id);
    try {
      const account = await getOwnerAccount(owner);
      if (!account?.subscription_id) throw new BillingRequestError(409, "subscription_missing", "There is no subscription to cancel.");
      if (mode === "simulator") {
        if (!localSimulatorAllowed) throw new BillingRequestError(403, "simulator_not_allowed", "The local simulator is available only with local Supabase.");
        const updated = await saveAccount(owner.id, { cancel_at_period_end: true, cancel_at: account.current_period_end }, account);
        return toSnapshot(updated, await invoiceRows(owner.id));
      }
      const plan = await configuredPlan();
      if (!plan) throw new BillingRequestError(503, "billing_not_configured", "ONVO test billing is not configured.");
      const remote = await onvo(`/subscriptions/${encodeURIComponent(account.subscription_id)}`, "POST", { cancelAtPeriodEnd: true }) as Json;
      if (remote.id !== account.subscription_id || remote.customerId !== account.customer_id || remote.mode !== "test" || remote.cancelAtPeriodEnd !== true) {
        throw new BillingRequestError(502, "onvo_invalid_response", "ONVO did not confirm the scheduled cancellation.");
      }
      const updated = await saveAccount(owner.id, {
        subscription_status: String(remote.status ?? account.subscription_status),
        cancel_at_period_end: true,
        cancel_at: normalizeTimestamp(remote.cancelAt),
        current_period_end: normalizeTimestamp(remote.currentPeriodEnd),
        canceled_at: normalizeTimestamp(remote.canceledAt),
      }, account);
      return toSnapshot(updated, await invoiceRows(owner.id), plan);
    } finally {
      await release(owner.id, claimId);
    }
  }

  async function changePaymentMethod(owner: CoachOwner, paymentMethodId: string) {
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
        return toSnapshot(updated, await invoiceRows(owner.id));
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
      return toSnapshot(updated, await invoiceRows(owner.id), plan);
    } finally {
      await release(owner.id, claimId);
    }
  }

  async function reconcileUnlocked(owner: CoachOwner) {
    if (mode === "simulator") return await snapshot(owner);
    const plan = await configuredPlan();
    if (!plan) return emptySnapshot(mode, "Configure ONVO test keys and a recurring test price ID to enable billing.");
    const account = await reconcileOnvo(owner, await getOwnerAccount(owner));
    return toSnapshot(account, await invoiceRows(owner.id), plan);
  }

  async function reconcile(owner: CoachOwner) {
    return await withCoachLock(owner, () => reconcileUnlocked(owner));
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
    return { ...toSnapshot(updated, await invoiceRows(owner.id), undefined, nextAction), configured: true };
  }

  async function simulate(owner: CoachOwner, scenario: "success" | "decline" | "requires_action" | "renewal_failed") {
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
        if (intent.mode !== "test" || intent.customerId !== account.customer_id || intent.id !== invoice.paymentIntentId) {
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

  return {
    authenticate: authUser,
    allowedOrigins: (env.BILLING_ALLOWED_ORIGINS ?? "http://localhost:4300,http://127.0.0.1:4300,http://localhost:4200,http://127.0.0.1:4200").split(",").map((value) => value.trim()).filter(Boolean),
    status: (owner: CoachOwner) => withCoachLock(owner, () => snapshot(owner, mode === "onvo_test")),
    subscribe,
    reconcile,
    cancel,
    changePaymentMethod,
    simulate,
    receiveWebhook,
    webhookSecret,
    localSimulatorAllowed,
  };
}
