import {
  deepStrictEqual as assertEquals,
  rejects as assertRejects,
} from "node:assert/strict";
import { BillingRequestError } from "./handler.ts";
import { createRuntimeDependencies } from "./runtime.ts";
import type { OnvoSignedBillingEvent } from "./webhook.ts";

const environment = {
  SUPABASE_URL: "https://staging.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-fixture",
  ONVO_SECRET_KEY: "onvo_test_secret_key_fixture",
  ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_fixture",
  ONVO_PRICE_ID: "price-pro",
  ONVO_SUBSCRIPTION_WEBHOOK_SIGNING_SECRET: "signing-fixture",
  ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID: "acct-test",
};

const start = "2026-10-01T00:00:00.000Z";
const end = "2026-11-01T00:00:00.000Z";
const billingAccount = {
  coach_id: "coach-1",
  customer_id: "cus-1",
  subscription_id: "sub-1",
  mode: "onvo_test",
  subscription_status: "incomplete",
  subscription_create_pending: false,
  plan_price_id: "price-pro",
};
const payment = {
  id: "intent-1",
  accountId: "acct-test",
  mode: "test",
  status: "succeeded",
  customerId: "cus-1",
  currency: "CRC",
  amount: 1_800_000,
  receivedAmount: 1_800_000,
  paymentMethod: { type: "card" },
};
const invoice = {
  id: "invoice-1",
  accountId: "acct-test",
  mode: "test",
  status: "paid",
  customerId: "cus-1",
  subscriptionId: "sub-1",
  paymentIntentId: payment.id,
  currency: payment.currency,
  total: payment.amount,
  createdAt: start,
  periodStart: start,
  periodEnd: end,
  attemptCount: 2,
};
const subscription = {
  id: "sub-1",
  mode: "test",
  status: "active",
  customerId: "cus-1",
  currentPeriodStart: start,
  currentPeriodEnd: end,
  updatedAt: start,
  items: [{ priceId: "price-pro", quantity: 1 }],
};
const paymentEvent: OnvoSignedBillingEvent = {
  id: "evt_payment",
  accountId: "acct-test",
  mode: "test",
  createdAt: start,
  type: "payment_intent.succeeded",
  data: { id: payment.id, customerId: payment.customerId },
};
const failureEvent: OnvoSignedBillingEvent = {
  ...paymentEvent,
  id: "evt_failure",
  type: "subscription_renewal.failed",
  data: {
    invoiceId: invoice.id,
    subscriptionId: subscription.id,
    paymentIntentId: "earlier-intent",
    attemptCount: 1,
    nextPaymentAttempt: end,
  },
};

function fixture(
  options: {
    payment?: unknown;
    invoice?: unknown;
    accounts?: readonly unknown[];
    stored?: string[];
    saveStatus?: number;
  } = {},
  runtimeEnv: Record<string, string> = {
    ...environment,
    BONFIRE_FACTURA_ENABLED: "true",
  },
) {
  const calls: string[] = [];
  const saved: Record<string, unknown>[] = [];
  const deps = createRuntimeDependencies(runtimeEnv, (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method} ${url.pathname}`);
    if (!init?.signal) throw new Error("Webhook fetch must have a time limit.");
    const json = (value: unknown, status = 200) =>
      Promise.resolve(Response.json(value, { status }));
    if (url.hostname === "api.onvopay.com") {
      assertEquals(
        new Headers(init.headers).get("Authorization"),
        `Bearer ${environment.ONVO_SECRET_KEY}`,
      );
    }
    switch (url.pathname) {
      case "/rest/v1/coach_billing_events":
        return json(
          (options.stored ?? []).filter((key) =>
            url.searchParams.get("event_key") === `eq.${key}`
          ).map((event_key) => ({ event_key })),
        );
      case "/rest/v1/coach_billing_accounts":
        assertEquals(url.searchParams.get("mode"), "eq.onvo_test");
        assertEquals(
          url.searchParams.get("customer_id") ??
            url.searchParams.get("subscription_id"),
          url.searchParams.has("customer_id") ? "eq.cus-1" : "eq.sub-1",
        );
        return json(options.accounts ?? [billingAccount]);
      case "/v1/payment-intents/intent-1":
        return json(options.payment ?? payment);
      case "/v1/invoices":
        assertEquals(Object.fromEntries(url.searchParams), {
          subscriptionId: "sub-1",
          paymentIntentId: "intent-1",
          customerId: "cus-1",
          limit: "2",
        });
        return json({
          data: options.invoice === null ? [] : [options.invoice ?? invoice],
        });
      case "/v1/invoices/invoice-1":
        return json(options.invoice ?? invoice);
      case "/v1/subscriptions/sub-1":
        return json(subscription);
      case "/rest/v1/rpc/record_coach_billing_fiscal_review":
      case "/rest/v1/rpc/record_coach_billing_signed_event_with_fiscal":
      case "/rest/v1/rpc/record_coach_billing_signed_event": {
        const body = JSON.parse(String(init.body));
        const status = options.saveStatus ?? 200;
        if (status === 200) {
          saved.push(body);
          if (body.p_event_key) options.stored?.push(body.p_event_key);
        }
        return json(true, status);
      }
      default:
        throw new Error(`Unexpected webhook request to ${url.pathname}`);
    }
  });
  return { deps, calls, saved };
}

function billingError(code: string) {
  return (error: unknown) =>
    error instanceof BillingRequestError && error.code === code;
}

Deno.test("signed configuration respects the billing mode and its production safeguards", async () => {
  const noNetwork = () => {
    throw new Error("Misconfigured webhook must not contact billing services.");
  };
  const sandbox = createRuntimeDependencies(environment, noNetwork);
  assertEquals(sandbox.signedWebhook?.mode, "test");
  await assertRejects(
    () => sandbox.receiveSignedWebhook({ ...paymentEvent, mode: "live" }),
    billingError("webhook_owner_mismatch"),
  );
  const production = {
    ...environment,
    SUPABASE_URL: "https://bzhqprxolseyxuuwodqs.supabase.co",
    SUPABASE_ANON_KEY: "anon-fixture",
    BILLING_ALLOWED_ORIGINS: "https://zummith.com",
  };
  assertEquals(
    createRuntimeDependencies(production, noNetwork).signedWebhook,
    null,
  );
  const live = {
    ...production,
    COACH_BILLING_MODE: "onvo_live",
    ONVO_SECRET_KEY: "onvo_live_secret_key_fixture",
    ONVO_PUBLISHABLE_KEY: "onvo_live_publishable_key_fixture",
  };
  assertEquals(createRuntimeDependencies(live, noNetwork).signedWebhook, null);
  assertEquals(
    createRuntimeDependencies({
      ...live,
      COACH_BILLING_LIVE_ENABLED: "true",
      ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID: "acct-live",
    }, noNetwork).signedWebhook,
    { signingSecret: "signing-fixture", accountId: "acct-live", mode: "live" },
  );
});

Deno.test("signed first payment matches the verified customer invoice and is deduplicated before provider reads", async () => {
  const { deps, calls, saved } = fixture({ stored: [] });
  assertEquals(await deps.receiveSignedWebhook(paymentEvent), {
    received: true,
    duplicate: false,
  });
  assertEquals(saved[0], {
    p_event_key: "onvo-signed:onvo_test:acct-test:evt_payment",
    p_coach_id: "coach-1",
    p_event_type: "payment_intent.succeeded",
    p_provider_object_id: "invoice-1",
    p_provider: "onvo_test",
    p_subscription_id: "sub-1",
    p_invoice: {
      id: "invoice-1",
      payment_intent_id: "intent-1",
      status: "paid",
      amount: 1_800_000,
      currency: "CRC",
      created_at: start,
      period_start: start,
      period_end: end,
    },
    p_subscription: {
      status: "active",
      current_period_start: start,
      current_period_end: end,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      updated_at: start,
    },
    p_attempt_count: null,
    p_next_payment_attempt: null,
    p_fiscal: {
      account_id: "acct-test",
      event_id: "evt_payment",
      paid_at: start,
      price_id: "price-pro",
      payment_method: "02",
      review_reason: null,
    },
  });
  calls.length = 0;
  assertEquals(await deps.receiveSignedWebhook(paymentEvent), {
    received: true,
    duplicate: true,
  });
  assertEquals(calls, ["GET /rest/v1/coach_billing_events"]);
});

Deno.test("a paused Bonfire connector leaves signed payments independent of the fiscal migration", async () => {
  const renewalEvent: OnvoSignedBillingEvent = {
    ...paymentEvent,
    id: "evt_renewal",
    type: "subscription_renewal.succeeded",
    data: {
      invoiceId: invoice.id,
      subscriptionId: subscription.id,
      paymentIntentId: payment.id,
    },
  };
  for (
    const runtimeEnv of [environment, {
      ...environment,
      BONFIRE_FACTURA_ENABLED: "false",
    }]
  ) {
    const { deps, calls, saved } = fixture({}, runtimeEnv);
    assertEquals(await deps.receiveSignedWebhook(paymentEvent), {
      received: true,
      duplicate: false,
    });
    assertEquals(
      calls.at(-1),
      "POST /rest/v1/rpc/record_coach_billing_signed_event",
    );
    assertEquals(await deps.receiveSignedWebhook(renewalEvent), {
      received: true,
      duplicate: false,
    });
    assertEquals(
      calls.at(-1),
      "POST /rest/v1/rpc/record_coach_billing_signed_event",
    );
    assertEquals(
      saved.every((event) => !Object.hasOwn(event, "p_fiscal")),
      true,
    );

    const partial = fixture(
      { payment: { ...payment, receivedAmount: 500 } },
      runtimeEnv,
    );
    await assertRejects(
      () => partial.deps.receiveSignedWebhook(paymentEvent),
      billingError("payment_not_available"),
    );
    assertEquals(partial.saved.length, 0);
  }
});

Deno.test("signed first payment cannot grant access when account, mode, subscription, amount or invoice is unconfirmed", async () => {
  for (
    const [options, code] of [
      [{ payment: { ...payment, mode: "live" } }, "onvo_payment_mismatch"],
      [
        { payment: { ...payment, accountId: "acct-other" } },
        "onvo_payment_mismatch",
      ],
      [
        { payment: { ...payment, customerId: "cus-other" } },
        "onvo_payment_mismatch",
      ],
      [
        { invoice: { ...invoice, subscriptionId: "sub-other" } },
        "onvo_invoice_mismatch",
      ],
      [{ invoice: null }, "renewal_not_available"],
      [
        { accounts: [billingAccount, billingAccount] },
        "webhook_owner_mismatch",
      ],
    ] as const
  ) {
    const { deps, saved } = fixture({ ...options });
    await assertRejects(
      () => deps.receiveSignedWebhook(paymentEvent),
      billingError(code),
    );
    assertEquals(saved.length, 0);
  }
});

Deno.test("a verified amount or currency discrepancy is held for fiscal review without a billing settlement", async () => {
  for (
    const mismatched of [{ ...payment, amount: 20 }, {
      ...payment,
      currency: "USD",
    }, { ...payment, receivedAmount: 500 }]
  ) {
    const { deps, calls, saved } = fixture({ payment: mismatched });
    assertEquals(await deps.receiveSignedWebhook(paymentEvent), {
      received: true,
      duplicate: false,
      fiscalReview: true,
    });
    assertEquals(
      calls.at(-1),
      "POST /rest/v1/rpc/record_coach_billing_fiscal_review",
    );
    assertEquals(
      (saved[0].p_fiscal as Record<string, unknown>).review_reason,
      "onvo_amount_mismatch",
    );
  }
});

Deno.test("a fully paid invoice with an unconfirmed fiscal method is held for review in the billing transaction", async () => {
  const { deps, calls, saved } = fixture({
    payment: { ...payment, paymentMethod: { type: "crypto" } },
  });
  assertEquals(await deps.receiveSignedWebhook(paymentEvent), {
    received: true,
    duplicate: false,
  });
  assertEquals(
    calls.at(-1),
    "POST /rest/v1/rpc/record_coach_billing_signed_event_with_fiscal",
  );
  assertEquals(
    (saved[0].p_fiscal as Record<string, unknown>).review_reason,
    "onvo_payment_method_unverified",
  );
});

Deno.test("late signed failure preserves the paid invoice and records each failed attempt once", async () => {
  const { deps, calls, saved } = fixture({ stored: [] });
  assertEquals(await deps.receiveSignedWebhook(failureEvent), {
    received: true,
    duplicate: false,
  });
  assertEquals(await deps.receiveSignedWebhook(failureEvent), {
    received: true,
    duplicate: true,
  });
  assertEquals(
    await deps.receiveSignedWebhook({
      ...failureEvent,
      id: "evt_failure_first",
      data: { ...failureEvent.data, attemptCount: 0 },
    }),
    { received: true, duplicate: false },
  );
  assertEquals(
    saved.map((
      event,
    ) => [event.p_attempt_count, event.p_invoice, event.p_subscription]),
    [[1, null, null], [0, null, null]],
  );
  assertEquals(saved.every((event) => !Object.hasOwn(event, "p_fiscal")), true);
  assertEquals(
    calls.filter((call) =>
      /\/v1\/(subscriptions|payment-intents)\//.test(call)
    ),
    [],
  );
});

Deno.test("signed webhook does not acknowledge an atomic write failure and can recover on redelivery", async () => {
  const options = { saveStatus: 500, stored: [] };
  const { deps, saved } = fixture(options);
  await assertRejects(
    () => deps.receiveSignedWebhook(paymentEvent),
    billingError("billing_storage_unavailable"),
  );
  assertEquals(saved.length, 0);
  options.saveStatus = 200;
  assertEquals(await deps.receiveSignedWebhook(paymentEvent), {
    received: true,
    duplicate: false,
  });
  assertEquals(saved.length, 1);
});
