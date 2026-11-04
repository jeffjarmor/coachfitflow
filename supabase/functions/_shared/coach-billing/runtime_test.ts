import {
  createRuntimeDependencies,
  hasActiveLegacyPaidAccess,
  invoiceMatchesSubscription,
  paymentIntentConfirmsInvoice,
} from "./runtime.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("simulator requires explicit local mode and a local or internal Docker Supabase host", () => {
  const local = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321",
    COACH_BILLING_MODE: "simulator",
    COACH_BILLING_LOCAL_SIMULATOR: "true",
  }, fetch);
  assertEquals(local.localSimulatorAllowed, true);
  const remote = createRuntimeDependencies({
    SUPABASE_URL: "https://example.supabase.co",
    COACH_BILLING_MODE: "simulator",
    COACH_BILLING_LOCAL_SIMULATOR: "true",
  }, fetch);
  assertEquals(remote.localSimulatorAllowed, false);
  const deployed = createRuntimeDependencies({
    SUPABASE_URL: "http://kong:8000",
    COACH_BILLING_MODE: "simulator",
    COACH_BILLING_LOCAL_SIMULATOR: "true",
    DENO_DEPLOYMENT_ID: "deployment-1",
  }, fetch);
  assertEquals(deployed.localSimulatorAllowed, false);
  const withLiveKeys = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321",
    COACH_BILLING_MODE: "simulator",
    COACH_BILLING_LOCAL_SIMULATOR: "true",
    ONVO_SECRET_KEY: "onvo_live_secret_key_rejected",
  }, fetch);
  assertEquals(withLiveKeys.localSimulatorAllowed, false);
});

Deno.test("rejects unknown billing modes instead of silently switching drivers", () => {
  let rejected = false;
  try {
    createRuntimeDependencies({ SUPABASE_URL: "http://127.0.0.1:54321", COACH_BILLING_MODE: "live" }, fetch);
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
});

Deno.test("refuses live ONVO keys before any provider request", async () => {
  let providerCalls = 0;
  const deps = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    COACH_BILLING_MODE: "onvo_test",
    ONVO_SECRET_KEY: "onvo_live_secret_key_not-allowed",
    ONVO_PUBLISHABLE_KEY: "onvo_live_publishable_key_not-allowed",
    ONVO_PRICE_ID: "price-test",
  }, async (input) => {
    const url = String(input);
    if (url.endsWith("/rpc/claim_coach_billing_operation")) return new Response(JSON.stringify("claim-1"));
    if (url.endsWith("/rpc/release_coach_billing_operation")) return new Response("true");
    if (url.startsWith("https://api.onvopay.com/")) providerCalls++;
    throw new Error("unexpected network request");
  });
  let rejected = false;
  try {
    await deps.status({ id: "coach-1", email: null, name: null });
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
  assertEquals(providerCalls, 0);
});

Deno.test("active legacy Pro access blocks overlapping billing through its existing paid date", () => {
  assertEquals(hasActiveLegacyPaidAccess("paid", "2026-11-03", "2026-11-03"), true);
  assertEquals(hasActiveLegacyPaidAccess("paid", "2026-11-02", "2026-11-03"), false);
  assertEquals(hasActiveLegacyPaidAccess("standard", "2026-11-30", "2026-11-03"), false);
  assertEquals(hasActiveLegacyPaidAccess("paid", null, "2026-11-03"), false);
});

Deno.test("invoice reconciliation requires matching test subscription, customer, and paid intent", () => {
  const account = { subscription_id: "sub-1", customer_id: "cus-1" } as never;
  const invoice = {
    mode: "test", subscriptionId: "sub-1", customerId: "cus-1",
    paymentIntentId: "pi-1", total: 1000, currency: "CRC",
  };
  const intent = {
    id: "pi-1", mode: "test", status: "succeeded", customerId: "cus-1", amount: 1000, currency: "CRC",
  };
  assertEquals(invoiceMatchesSubscription(invoice, account), true);
  assertEquals(paymentIntentConfirmsInvoice(intent, invoice, account), true);
  assertEquals(invoiceMatchesSubscription({ ...invoice, mode: "live" }, account), false);
  assertEquals(invoiceMatchesSubscription({ ...invoice, subscriptionId: "sub-other" }, account), false);
  assertEquals(paymentIntentConfirmsInvoice({ ...intent, amount: 999 }, invoice, account), false);
  assertEquals(paymentIntentConfirmsInvoice({ ...intent, status: "processing" }, invoice, account), false);
  assertEquals(paymentIntentConfirmsInvoice({ ...intent, customerId: "cus-other" }, invoice, account), false);
});

Deno.test("subscribe rejects legacy Pro before contacting ONVO and releases its operation claim", async () => {
  const calls: string[] = [];
  const deps = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    COACH_BILLING_MODE: "onvo_test",
    ONVO_SECRET_KEY: "onvo_test_secret_key_test",
    ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_test",
    ONVO_PRICE_ID: "price-test",
  }, async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/rpc/claim_coach_billing_operation")) return new Response(JSON.stringify("claim-1"), { status: 200 });
    if (url.includes("/rest/v1/coach_billing_accounts?")) return new Response("[]", { status: 200 });
    if (url.endsWith("/rpc/release_coach_billing_operation")) return new Response("true", { status: 200 });
    throw new Error(`Unexpected request ${url} ${init?.method}`);
  });
  let status = 0;
  let code = "";
  try {
    await deps.subscribe({ id: "coach-legacy", email: null, name: null, coachPlan: "paid", nextPlanPaymentDate: "2099-12-31" });
  } catch (error) {
    status = (error as { status?: number }).status ?? 0;
    code = (error as { code?: string }).code ?? "";
  }
  assertEquals(status, 409);
  assertEquals(code, "legacy_pro_active");
  assertEquals(calls.some((url) => url.startsWith("https://api.onvopay.com/")), false);
  assertEquals(calls.some((url) => url.endsWith("/rpc/release_coach_billing_operation")), true);
});

Deno.test("rejects another customer's ONVO payment method before subscription update or persistence", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const account = {
    coach_id: "coach-1", mode: "onvo_test", customer_id: "cus-owner", subscription_id: "sub-owner",
    subscription_status: "active", payment_method_id: "pm-old", payment_method_brand: "Visa",
    payment_method_last4: "4242", payment_method_exp_month: 12, payment_method_exp_year: 2030,
    cancel_at_period_end: false, paid_through: null, plan_price_id: "price-1", plan_name: "Pro",
    plan_amount: 1000, plan_currency: "CRC", plan_interval: "month", plan_interval_count: 1,
  };
  const deps = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    COACH_BILLING_MODE: "onvo_test", ONVO_SECRET_KEY: "onvo_test_secret_key_test",
    ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_test", ONVO_PRICE_ID: "price-1",
  }, async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/rpc/claim_coach_billing_operation")) return new Response(JSON.stringify("claim-1"));
    if (url.includes("/rest/v1/coach_billing_accounts?")) return new Response(JSON.stringify([account]));
    if (url.endsWith("/prices/price-1")) return new Response(JSON.stringify({ id: "price-1", mode: "test", type: "recurring", isActive: true, unitAmount: 1000, currency: "CRC", recurring: { interval: "month", intervalCount: 1 } }));
    if (url.endsWith("/payment-methods/pm-foreign")) return new Response(JSON.stringify({ id: "pm-foreign", customerId: "cus-other", mode: "test", status: "active", type: "card" }));
    if (url.endsWith("/rpc/release_coach_billing_operation")) return new Response("true");
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  let status = 0;
  try {
    await deps.changePaymentMethod({ id: "coach-1", email: null, name: null }, "pm-foreign");
  } catch (error) {
    status = (error as { status?: number }).status ?? 0;
  }
  assertEquals(status, 403);
  assertEquals(calls.some((call) => call.url.includes("/subscriptions/sub-owner") && call.method === "POST"), false);
  assertEquals(calls.some((call) => call.url.includes("/rest/v1/coach_billing_accounts?") && call.method === "POST"), false);
});

Deno.test("scheduled cancellation updates the existing test subscription at period end", async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const account = {
    coach_id: "coach-1", mode: "onvo_test", customer_id: "cus-owner", subscription_id: "sub-owner",
    subscription_status: "active", payment_method_id: "pm-owner", payment_method_brand: "Visa",
    payment_method_last4: "4242", payment_method_exp_month: 12, payment_method_exp_year: 2030,
    cancel_at_period_end: false, cancel_at: null, canceled_at: null, current_period_start: null,
    current_period_end: "2026-12-01T00:00:00.000Z", paid_through: "2026-12-01", plan_price_id: "price-1",
    plan_name: "Pro", plan_amount: 1000, plan_currency: "CRC", plan_interval: "month", plan_interval_count: 1,
  };
  const deps = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    COACH_BILLING_MODE: "onvo_test", ONVO_SECRET_KEY: "onvo_test_secret_key_test",
    ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_test", ONVO_PRICE_ID: "price-1",
  }, async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.endsWith("/rpc/claim_coach_billing_operation")) return new Response(JSON.stringify("claim-1"));
    if (url.includes("/rest/v1/coach_billing_accounts?") && method === "GET") return new Response(JSON.stringify([account]));
    if (url.endsWith("/prices/price-1")) return new Response(JSON.stringify({ id: "price-1", mode: "test", type: "recurring", isActive: true, unitAmount: 1000, currency: "CRC", recurring: { interval: "month", intervalCount: 1 } }));
    if (url.endsWith("/subscriptions/sub-owner") && method === "POST") return new Response(JSON.stringify({ id: "sub-owner", customerId: "cus-owner", mode: "test", status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: account.current_period_end }));
    if (url.includes("/rest/v1/coach_billing_accounts?") && method === "POST") return new Response(null, { status: 204 });
    if (url.includes("/rest/v1/coach_billing_invoices?")) return new Response("[]");
    if (url.endsWith("/rpc/release_coach_billing_operation")) return new Response("true");
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  const snapshot = await deps.cancel({ id: "coach-1", email: null, name: null }) as { subscription: { cancelAtPeriodEnd: boolean; currentPeriodEnd: string } };
  const update = calls.find((call) => call.url.endsWith("/subscriptions/sub-owner") && call.method === "POST");
  assertEquals(JSON.parse(update?.body ?? "{}"), { cancelAtPeriodEnd: true });
  assertEquals(snapshot.subscription.cancelAtPeriodEnd, true);
  assertEquals(snapshot.subscription.currentPeriodEnd, account.current_period_end);
});

Deno.test("ambiguous ONVO create response remains pending and never creates a second subscription", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  let account: Record<string, unknown> | null = null;
  let subscriptionPosts = 0;
  let claimId = 0;
  const deps = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    COACH_BILLING_MODE: "onvo_test", ONVO_SECRET_KEY: "onvo_test_secret_key_test",
    ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_test", ONVO_PRICE_ID: "price-1",
  }, async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/rpc/claim_coach_billing_operation")) return new Response(JSON.stringify(`claim-${++claimId}`));
    if (url.endsWith("/rpc/release_coach_billing_operation")) return new Response("true");
    if (url.includes("/rest/v1/coach_billing_accounts?")) {
      if (method === "GET") return new Response(JSON.stringify(account ? [account] : []));
      const patch = JSON.parse(String(init?.body));
      account = { ...(account ?? {}), ...patch };
      return new Response(null, { status: 204 });
    }
    if (url.endsWith("/prices/price-1")) return new Response(JSON.stringify({ id: "price-1", mode: "test", type: "recurring", isActive: true, unitAmount: 1000, currency: "CRC", recurring: { interval: "month", intervalCount: 1 } }));
    if (url.includes("/customers?email=")) return new Response(JSON.stringify({ data: [] }));
    if (url.endsWith("/customers") && method === "POST") return new Response(JSON.stringify({ id: "cus-owner", email: "owner@example.test", mode: "test" }));
    if (url.includes("/subscriptions?customerId=")) return new Response(JSON.stringify({ data: [] }));
    if (url.endsWith("/subscriptions") && method === "POST") {
      subscriptionPosts++;
      if (subscriptionPosts === 1) throw new Error("response lost after ONVO may have accepted the request");
      return new Response(JSON.stringify({ id: "sub-duplicate", customerId: "cus-owner", mode: "test", status: "incomplete" }));
    }
    throw new Error(`Unexpected request ${method} ${url}`);
  });
  const owner = { id: "coach-1", email: "owner@example.test", name: "Owner" };
  for (let attempt = 0; attempt < 2; attempt++) {
    let code = "";
    try { await deps.subscribe(owner); }
    catch (error) { code = (error as { code?: string }).code ?? ""; }
    assertEquals(code, attempt === 0 ? "" : "subscription_creation_pending");
  }
  assertEquals(subscriptionPosts, 1);
  const savedAccount = account as Record<string, unknown> | null;
  assertEquals(savedAccount?.subscription_create_pending, true);
  assertEquals(savedAccount?.customer_id, "cus-owner");
  assertEquals(calls.filter((call) => call.url.endsWith("/rpc/release_coach_billing_operation")).length, 2);
});

Deno.test("simulator preserves legacy Pro, handles empty PostgREST 201 upserts, and resumes scheduled cancellation", async () => {
  let account: Record<string, unknown> | null = null;
  let claimId = 0;
  const writes: Record<string, unknown>[] = [];
  const deps = createRuntimeDependencies({
    SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    COACH_BILLING_MODE: "simulator", COACH_BILLING_LOCAL_SIMULATOR: "true",
  }, async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/rpc/claim_coach_billing_operation")) return new Response(JSON.stringify(`claim-${++claimId}`));
    if (url.endsWith("/rpc/release_coach_billing_operation")) return new Response("true");
    if (url.includes("/rest/v1/coach_billing_accounts?")) {
      if (method === "GET") return new Response(JSON.stringify(account ? [account] : []));
      const patch = JSON.parse(String(init?.body));
      writes.push(patch);
      account = { ...(account ?? {}), ...patch };
      return new Response(null, { status: 201 });
    }
    if (url.includes("/rest/v1/coach_billing_invoices?")) return new Response("[]");
    throw new Error(`Unexpected request ${method} ${url}`);
  });

  let legacyCode = "";
  try {
    await deps.subscribe({ id: "coach-legacy-sim", email: null, name: null, coachPlan: "paid", nextPlanPaymentDate: "2099-12-31" });
  } catch (error) { legacyCode = (error as { code?: string }).code ?? ""; }
  assertEquals(legacyCode, "legacy_pro_active");
  assertEquals(writes.length, 0);

  const created = await deps.subscribe({ id: "coach-sim", email: null, name: null }) as { nextAction: unknown; subscription: { id: string; cancelAtPeriodEnd: boolean } };
  assertEquals(created.nextAction, null);
  assertEquals(created.subscription.id, "sim-sub-coach-sim");
  const beforeCancel = writes.length;
  await deps.cancel({ id: "coach-sim", email: null, name: null });
  assertEquals((account as Record<string, unknown> | null)?.cancel_at_period_end, true);
  const resumed = await deps.subscribe({ id: "coach-sim", email: null, name: null }) as { nextAction: unknown; subscription: { id: string; cancelAtPeriodEnd: boolean } };
  assertEquals(resumed.subscription.id, created.subscription.id);
  assertEquals(resumed.subscription.cancelAtPeriodEnd, false);
  assertEquals(resumed.nextAction, null);
  assertEquals(writes.length, beforeCancel + 2);
});

for (const scenario of ["missing_intent", "stale_canceled"] as const) {
  Deno.test(`ONVO ${scenario} rejects without granting access or creating overlapping billing`, async () => {
    const owner = {
      id: "coach-1", email: "owner@example.test", name: "Test",
      coachPlan: scenario === "missing_intent" ? "standard" : "paid",
      nextPlanPaymentDate: scenario === "missing_intent" ? null : "2099-12-01",
    };
    let account = {
      coach_id: owner.id, mode: "onvo_test", customer_id: "cus-1", subscription_id: "sub-1",
      subscription_status: "active", paid_through: owner.nextPlanPaymentDate, payment_method_id: null,
    };
    const before = JSON.stringify(account);
    const writes: unknown[] = [];
    let creates = 0;
    let released = false;
    const deps = createRuntimeDependencies({
      SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
      COACH_BILLING_MODE: "onvo_test", ONVO_SECRET_KEY: "onvo_test_secret_key_fixture",
      ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_fixture", ONVO_PRICE_ID: "price-1",
    }, async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const json = (value: unknown) => new Response(JSON.stringify(value));
      if (path.endsWith("/rpc/claim_coach_billing_operation")) return json("claim-1");
      if (path.endsWith("/rpc/release_coach_billing_operation")) { released = true; return json(true); }
      if (path === "/rest/v1/coach_billing_accounts") {
        if (init?.method === "POST") { account = { ...account, ...body }; writes.push(body); return new Response(null, { status: 201 }); }
        return json([account]);
      }
      if (path === "/rest/v1/coach_billing_invoices") return json([]);
      if (path.endsWith("/prices/price-1")) return json({ id: "price-1", mode: "test", type: "recurring", isActive: true, unitAmount: 1000, currency: "CRC", recurring: { interval: "month", intervalCount: 1 } });
      if (path.endsWith("/subscriptions/sub-1")) return json({ id: "sub-1", customerId: "cus-1", mode: "test", status: scenario === "stale_canceled" ? "canceled" : "active" });
      if (path === "/v1/invoices") return json({ data: [{ id: "inv-1", customerId: "cus-1", subscriptionId: "sub-1", mode: "test", status: "paid", total: 1000, currency: "CRC", createdAt: "2099-11-01T00:00:00Z", periodStart: "2099-11-01T00:00:00Z", periodEnd: "2099-12-01T00:00:00Z" }] });
      if (path.endsWith("/rpc/record_coach_billing_invoice")) { writes.push(body); return json(true); }
      if (path === "/v1/subscriptions" && init?.method !== "POST") return json({ data: [] });
      if (path === "/v1/subscriptions" && init?.method === "POST") { creates++; return json({ id: "sub-2", customerId: "cus-1", mode: "test", status: "incomplete" }); }
      throw new Error(`Unexpected provider or storage request: ${path}`);
    });
    let failure: { status?: number; code?: string } | null = null;
    try {
      if (scenario === "missing_intent") await deps.reconcile(owner);
      else await deps.subscribe(owner);
    } catch (error) { failure = error as { status?: number; code?: string }; }
    assertEquals(failure?.status, scenario === "missing_intent" ? 503 : 409);
    assertEquals(failure?.code, scenario === "missing_intent" ? "payment_not_available" : "legacy_pro_active");
    assertEquals(writes, []);
    assertEquals(creates, 0);
    assertEquals(JSON.stringify(account), before);
    assertEquals(released, true);
  });
}
