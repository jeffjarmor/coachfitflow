import {
  deepStrictEqual as assertEquals,
  rejects as assertRejects,
} from "node:assert/strict";
import { BillingRequestError } from "./handler.ts";
import { createRuntimeDependencies } from "./runtime.ts";

const owner = {
  id: "0f710002-2522-4bfd-9290-10204389b171",
  email: "coach@example.org",
  name: "Coach",
};
const liveEnvironment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-fixture",
  SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
  COACH_BILLING_MODE: "onvo_live",
  COACH_BILLING_LIVE_ENABLED: "true",
  COACH_BILLING_LIVE_COACH_IDS: owner.id,
  ONVO_SECRET_KEY: "onvo_live_secret_key_fixture",
  ONVO_PUBLISHABLE_KEY: "onvo_live_publishable_key_fixture",
  ONVO_PRICE_ID: "price-pro",
  ONVO_WEBHOOK_SECRET: "legacy-test-secret-not-for-live",
  BILLING_ALLOWED_ORIGINS: "https://zummith.com",
};
const catalogPrice = {
  id: "price-pro",
  mode: "live",
  type: "recurring",
  isActive: true,
  unitAmount: 1815,
  currency: "USD",
  recurring: { interval: "month", intervalCount: 1 },
};
const subscription = {
  id: "sub-live",
  mode: "live",
  customerId: "cus-live",
  status: "incomplete",
  items: [{ priceId: "price-pro", quantity: 1 }],
};
const paidInvoice = {
  id: "invoice-live",
  customerId: "cus-live",
  mode: "live",
  subscriptionId: "sub-live",
  status: "paid",
  paymentIntentId: "intent-live",
  total: 1815,
  currency: "USD",
  createdAt: "2099-01-01T00:00:00Z",
  periodStart: "2099-01-01T00:00:00Z",
  periodEnd: "2099-02-01T00:00:00Z",
};
const paymentIntent = {
  id: "intent-live",
  mode: "live",
  status: "succeeded",
  amount: 1815,
  receivedAmount: 1815,
  currency: "USD",
  customer: { id: "cus-live" },
  captureMethod: "automatic",
};
const openInvoice = { ...paidInvoice, status: "open" };
const pendingIntent = {
  ...paymentIntent,
  status: "requires_action",
  receivedAmount: 0,
};
const incompleteAccount = {
  coach_id: owner.id,
  mode: "onvo_live",
  subscription_id: "sub-live",
  subscription_status: "incomplete",
  customer_id: "cus-live",
  paid_through: null,
  plan_price_id: "price-pro",
  plan_amount: 1815,
  plan_currency: "USD",
};

function billingFailure(code: string) {
  return (error: unknown) =>
    error instanceof BillingRequestError && error.code === code;
}

Deno.test("test-mode credentials cannot grant access on Zummith production targets", async () => {
  const testEnvironment = {
    SUPABASE_URL: "https://staging.supabase.co",
    SUPABASE_ANON_KEY: "anon-fixture",
    SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
    ONVO_SECRET_KEY: "onvo_test_secret_key_fixture",
    ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_fixture",
    ONVO_PRICE_ID: "price-test",
    BILLING_ALLOWED_ORIGINS: "https://staging-zummith.com",
    ONVO_WEBHOOK_SECRET: "legacy-test-secret",
  };
  const productionTargets: Record<string, string>[] = [
    { SUPABASE_URL: "https://bzhqprxolseyxuuwodqs.supabase.co" },
    { BILLING_ALLOWED_ORIGINS: "https://www.zummith.com" },
    { ENVIRONMENT: "production" },
    { DENO_DEPLOYMENT_ID: "bzhqprxolseyxuuwodqs_function_version" },
  ];
  for (const productionTarget of productionTargets) {
    const deps = createRuntimeDependencies({
      ...testEnvironment,
      ...productionTarget,
    }, () => {
      throw new Error("Test billing must not access production");
    });
    assertEquals(
      (await deps.status(owner) as { configured: boolean }).configured,
      false,
    );
    await assertRejects(
      () => deps.subscribe(owner),
      billingFailure("billing_not_configured"),
    );
    await assertRejects(
      () => deps.cancel(owner),
      billingFailure("billing_not_configured"),
    );
    await assertRejects(
      () => deps.reconcile(owner),
      billingFailure("billing_not_configured"),
    );
    await assertRejects(
      () => deps.changePaymentMethod(owner, "pm-test"),
      billingFailure("billing_not_configured"),
    );
    await assertRejects(
      () => deps.receiveWebhook("event", "subscription.renewal.succeeded", {}),
      billingFailure("webhook_not_configured"),
    );
  }
  assertEquals(
    createRuntimeDependencies(testEnvironment).webhookSecret,
    "legacy-test-secret",
  );
});

Deno.test("live requires enabled mode, exact HTTPS hosts and matching keys before accessing any network", async () => {
  for (
    const override of [
      { COACH_BILLING_LIVE_ENABLED: "false" },
      { SUPABASE_URL: "http://127.0.0.1:54321" },
      { SUPABASE_URL: "https://127.0.0.1:54321" },
      { BILLING_ALLOWED_ORIGINS: "" },
      { BILLING_ALLOWED_ORIGINS: "https://zummith.com,http://localhost:4200" },
      { ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_fixture" },
      { ONVO_SECRET_KEY: "onvo_test_secret_key_fixture" },
      { ONVO_PRICE_ID: "" },
    ]
  ) {
    const deps = createRuntimeDependencies(
      { ...liveEnvironment, ...override },
      () => {
        throw new Error("Disabled billing must not access the network");
      },
    );
    assertEquals(
      (await deps.status(owner) as { configured: boolean }).configured,
      false,
    );
    await assertRejects(
      () => deps.subscribe(owner),
      billingFailure("billing_not_configured"),
    );
    await assertRejects(
      () => deps.cancel(owner),
      billingFailure("billing_not_configured"),
    );
    await assertRejects(
      () => deps.reconcile(owner),
      billingFailure("billing_not_configured"),
    );
  }
});

function liveFixture(
  invited: boolean,
  initialAccount: Record<string, unknown> | null = null,
) {
  let account = initialAccount;
  let price: unknown = catalogPrice;
  let intent: unknown = paymentIntent;
  let invoices: unknown[] = [];
  let remote = subscription;
  const calls: string[] = [];
  const recorded: Record<string, unknown>[] = [];
  const deps = createRuntimeDependencies({
    ...liveEnvironment,
    COACH_BILLING_LIVE_COACH_IDS: invited ? owner.id : "",
  }, (input, request) => {
    const url = new URL(String(input));
    const method = request?.method ?? "GET";
    const body = request?.body ? JSON.parse(String(request.body)) : null;
    const json = (data: unknown, status = 200) =>
      Promise.resolve(Response.json(data, { status }));
    calls.push(`${method} ${url.pathname}`);
    if (url.hostname === "api.onvopay.com") {
      assertEquals(
        new Headers(request?.headers).get("authorization"),
        `Bearer ${liveEnvironment.ONVO_SECRET_KEY}`,
      );
      assertEquals(request?.redirect, "error");
    }
    switch (`${method} ${url.pathname}`) {
      case "POST /rest/v1/rpc/claim_coach_billing_operation":
        return json("operation-claim");
      case "POST /rest/v1/rpc/release_coach_billing_operation":
        return json(true);
      case "GET /rest/v1/coach_billing_accounts":
        return json(account ? [account] : []);
      case "POST /rest/v1/coach_billing_accounts":
        account = { ...account, ...body };
        return Promise.resolve(new Response(null, { status: 201 }));
      case "GET /rest/v1/coach_billing_invoices":
        assertEquals(url.searchParams.get("provider"), "eq.onvo_live");
        return json([]);
      case "POST /rest/v1/rpc/record_coach_billing_invoice":
        recorded.push(body);
        if (account && body.p_status === "paid") {
          account.paid_through = body.p_period_end.slice(0, 10);
        }
        return json(true);
      case "GET /v1/prices/price-pro":
        return json(price);
      case "POST /v1/customers":
        return json({ id: "cus-live", mode: "live" }, 201);
      case "GET /v1/subscriptions":
        return json({ data: [] });
      case "POST /v1/subscriptions":
        assertEquals(body.paymentBehavior, "allow_incomplete");
        assertEquals(body.items, [{ priceId: "price-pro", quantity: 1 }]);
        assertEquals(body.paymentMethodId, undefined);
        assertEquals(account?.customer_id, "cus-live");
        assertEquals(account?.subscription_create_pending, true);
        return json(remote, 201);
      case "GET /v1/subscriptions/sub-live":
        return json(remote);
      case "POST /v1/subscriptions/sub-live":
        assertEquals(body, { cancelAtPeriodEnd: true });
        return json({ ...remote, cancelAtPeriodEnd: true });
      case "GET /v1/invoices":
        return json({ data: invoices });
      case "GET /v1/payment-intents/intent-live":
        return json(intent);
      default:
        throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    }
  });
  return {
    deps,
    calls,
    recorded,
    setPrice: (value: unknown) => {
      price = value;
    },
    setPayment: (value: unknown, rows: unknown[]) => {
      intent = value;
      invoices = rows;
    },
    setStatus: (status: string) => {
      remote = { ...remote, status };
    },
  };
}

Deno.test("a live invitation gates checkout while an existing customer can cancel with sales paused", async () => {
  const fixture = liveFixture(false, {
    coach_id: owner.id,
    mode: "onvo_live",
    subscription_id: "sub-live",
    subscription_status: "incomplete",
    customer_id: "cus-live",
    plan_price_id: "price-pro",
    plan_amount: 1815,
    plan_currency: "USD",
  });
  assertEquals(fixture.deps.webhookSecret, "");
  await assertRejects(
    () =>
      fixture.deps.receiveWebhook(
        "event",
        "subscription.renewal.succeeded",
        {},
      ),
    billingFailure("webhook_not_configured"),
  );
  await assertRejects(
    () => fixture.deps.subscribe(owner),
    billingFailure("billing_invite_required"),
  );
  assertEquals(fixture.calls.length, 0);
  const snapshot = await fixture.deps.status(owner) as {
    configured: boolean;
    canSubscribe: boolean;
    checkout: unknown;
  };
  assertEquals(
    [snapshot.configured, snapshot.canSubscribe, snapshot.checkout],
    [true, false, null],
  );
  const canceled = await fixture.deps.cancel(owner) as {
    subscription: { cancelAtPeriodEnd: boolean };
  };
  assertEquals(canceled.subscription.cancelAtPeriodEnd, true);
  assertEquals(fixture.calls.filter((call) => call.includes("/prices/")), []);
  const newOwner = liveFixture(false);
  assertEquals(
    (await newOwner.deps.status(owner) as { configured: boolean }).configured,
    false,
  );
  assertEquals(newOwner.calls.some((call) => call.includes(" /v1/")), false);
});

Deno.test("live checkout uses the verified monthly price, saves only live payment proof, and isolates sandbox data", async () => {
  const fixture = liveFixture(true);
  for (
    const price of [{ ...catalogPrice, mode: "test" }, {
      ...catalogPrice,
      unitAmount: 0,
    }]
  ) {
    fixture.setPrice(price);
    await assertRejects(
      () => fixture.deps.subscribe(owner),
      billingFailure("onvo_price_mismatch"),
    );
  }
  assertEquals(fixture.calls.includes("POST /v1/customers"), false);
  fixture.setPrice(catalogPrice);
  const result = await fixture.deps.subscribe(owner) as {
    canSubscribe: boolean;
    checkout: unknown;
  };
  assertEquals(result.canSubscribe, true);
  assertEquals(result.checkout, {
    customerId: "cus-live",
    subscriptionId: "sub-live",
    mode: "onvo_live",
    publishableKey: liveEnvironment.ONVO_PUBLISHABLE_KEY,
  });
  assertEquals(fixture.recorded.length, 0);
  fixture.setStatus("active");
  fixture.setPayment({ ...paymentIntent, mode: "test" }, [paidInvoice]);
  await assertRejects(
    () => fixture.deps.reconcile(owner),
    billingFailure("onvo_payment_mismatch"),
  );
  fixture.setPayment({ ...paymentIntent, receivedAmount: 100 }, [paidInvoice]);
  await assertRejects(
    () => fixture.deps.reconcile(owner),
    billingFailure("onvo_payment_mismatch"),
  );
  assertEquals(fixture.recorded.length, 0);
  fixture.setPayment(paymentIntent, [paidInvoice]);
  const settled = await fixture.deps.reconcile(owner) as {
    subscription: { paidThrough: string };
  };
  assertEquals(settled.subscription.paidThrough, "2099-02-01");
  assertEquals(fixture.recorded[0]?.p_provider, "onvo_live");

  const sandboxAccount = liveFixture(true, {
    coach_id: owner.id,
    mode: "onvo_test",
  });
  await assertRejects(
    () => sandboxAccount.deps.subscribe(owner),
    billingFailure("billing_mode_mismatch"),
  );
  assertEquals(
    sandboxAccount.calls.some((call) => call.includes(" /v1/")),
    false,
  );
});

Deno.test("explicit live reconciliation lets the invited coach resume the same unpaid bank challenge", async () => {
  const fixture = liveFixture(true, incompleteAccount);
  fixture.setPayment(pendingIntent, [openInvoice]);

  const overview = await fixture.deps.status(owner) as { nextAction: unknown };
  assertEquals(overview.nextAction, null);
  assertEquals(fixture.calls.includes("GET /v1/payment-intents/intent-live"), false);

  const reconciled = await fixture.deps.reconcile(owner) as {
    nextAction: unknown;
    subscription: { status: string; paidThrough: string | null };
  };
  assertEquals(reconciled.nextAction, { type: "onvo_3ds", paymentIntentId: "intent-live" });
  assertEquals(reconciled.subscription.status, "incomplete");
  assertEquals(reconciled.subscription.paidThrough, null);
  assertEquals(fixture.recorded.every((invoice) => invoice.p_status === "open"), true);
  assertEquals(fixture.calls.filter((call) => call.startsWith("POST /v1/")), []);
});

Deno.test("live reconciliation hides actions that do not match one unpaid first invoice", async () => {
  for (const intent of [
    paymentIntent,
    { ...pendingIntent, customer: { id: "cus-other" } },
    { ...pendingIntent, id: "intent-other" },
    { ...pendingIntent, invoiceId: "invoice-other" },
    { ...pendingIntent, subscriptionId: "sub-other" },
    { ...pendingIntent, mode: "test" },
    { ...pendingIntent, amount: 1915 },
    { ...pendingIntent, currency: "CRC" },
    { ...pendingIntent, receivedAmount: 1815 },
  ]) {
    const fixture = liveFixture(true, incompleteAccount);
    fixture.setPayment(intent, [openInvoice]);
    const result = await fixture.deps.reconcile(owner) as { nextAction: unknown };
    assertEquals(result.nextAction, null);
  }

  for (const invoices of [
    [openInvoice, { ...openInvoice, id: "invoice-other" }],
    [{ ...openInvoice, total: 1915 }],
  ]) {
    const fixture = liveFixture(true, incompleteAccount);
    fixture.setPayment(pendingIntent, invoices);
    const result = await fixture.deps.reconcile(owner) as { nextAction: unknown };
    assertEquals(result.nextAction, null);
    assertEquals(fixture.calls.includes("GET /v1/payment-intents/intent-live"), false);
  }

  const uninvited = liveFixture(false, incompleteAccount);
  uninvited.setPayment(pendingIntent, [openInvoice]);
  const result = await uninvited.deps.reconcile(owner) as { nextAction: unknown };
  assertEquals(result.nextAction, null);
  assertEquals(uninvited.calls.includes("GET /v1/payment-intents/intent-live"), false);

  const alreadyPaid = liveFixture(true, { ...incompleteAccount, paid_through: "2099-02-01" });
  alreadyPaid.setPayment(pendingIntent, [openInvoice]);
  const paidResult = await alreadyPaid.deps.reconcile(owner) as { nextAction: unknown };
  assertEquals(paidResult.nextAction, null);
  assertEquals(alreadyPaid.calls.includes("GET /v1/payment-intents/intent-live"), false);
});
