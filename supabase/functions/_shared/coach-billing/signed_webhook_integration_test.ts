import {
  deepStrictEqual as assertEquals,
  ok as assert,
} from "node:assert/strict";
import { createRuntimeDependencies } from "./runtime.ts";
import { createCoachBillingWebhookHandler } from "./webhook.ts";

const deliveryTime = Date.parse("2026-11-25T18:00:00.000Z");
const periodStart = "2026-11-25T00:00:00.000Z";
const periodEnd = "2026-12-25T00:00:00.000Z";
const signingSecret = "whsec_local_e2e_fixture";
const accountId = "acct_local_e2e";
const coachId = "08000000-0000-4000-8000-000000001001";
const subscriptionId = "sub_local_e2e";
const invoiceId = "inv_local_e2e";
const paymentIntentId = "pi_local_e2e";
const customerId = "cus_local_e2e";
const supabaseUrl = "https://supabase.example.org";
const serviceKey = "service-role-local-e2e";
const onvoSecretKey = "onvo_test_secret_key_local_e2e";

type AppliedEvent = {
  p_event_key: string;
  p_event_type: string;
  p_coach_id: string;
  p_provider_object_id: string;
  p_provider: string;
  p_subscription_id: string;
  p_invoice: { status: string; period_end: string } | null;
  p_subscription: { status: string } | null;
  p_attempt_count: number | null;
  p_next_payment_attempt: string | null;
};

async function signedHeader(body: string, secondsAfterFirstDelivery: number) {
  const encoder = new TextEncoder();
  const signedAt = deliveryTime / 1000 + secondsAfterFirstDelivery;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${signedAt}.${body}`),
  );
  return `t=${signedAt},v1=${new Uint8Array(signature).toHex()}`;
}

const subscriptionStatuses = {
  paid: "active",
  open: "past_due",
  uncollectible: "unpaid",
} as const;

type InvoiceStatus = keyof typeof subscriptionStatuses;

function eventBody(
  id: string,
  type: string,
  resource: Record<string, unknown>,
) {
  return JSON.stringify({
    id,
    object: "event",
    createdAt: new Date(deliveryTime).toISOString(),
    mode: "test",
    accountId,
    type,
    data: { object: resource },
  });
}

function renewalBody(id: string, attempt: number, status: InvoiceStatus) {
  return eventBody(
    id,
    `subscription_renewal.${status === "paid" ? "succeeded" : "failed"}`,
    {
      object: "subscription_renewal",
      invoiceId,
      subscriptionId,
      paymentIntentId,
      currency: "CRC",
      total: 1_800_000,
      attemptCount: attempt,
      invoiceStatus: status,
      subscriptionStatus: subscriptionStatuses[status],
      periodStart,
      periodEnd,
      nextPaymentAttempt: status === "open" ? "2026-11-26T18:00:00.000Z" : null,
      ...(status === "paid" ? {} : { error: { code: "declined" } }),
    },
  );
}

function signedWebhookFixture({ raceTwoInitialDeliveries = false } = {}) {
  const attempts: AppliedEvent[] = [];
  const bothLookupsStarted = raceTwoInitialDeliveries
    ? Promise.withResolvers<void>()
    : null;
  let writesUnavailable = false;
  let invoiceStatus: InvoiceStatus = "open";
  let requests = 0;
  let providerRequests = 0;
  let eventReads = 0;
  let eventWrites = 0;
  const ownerAccount = {
    coach_id: coachId,
    mode: "onvo_test",
    customer_id: customerId,
    subscription_id: subscriptionId,
    plan_price_id: "price_local_pro",
  };
  const runtime = createRuntimeDependencies({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: "anon-local-e2e",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    COACH_BILLING_MODE: "onvo_test",
    ONVO_SECRET_KEY: onvoSecretKey,
    ONVO_PUBLISHABLE_KEY: "onvo_test_publishable_key_local_e2e",
    ONVO_PRICE_ID: "price_local_pro",
    ONVO_SUBSCRIPTION_WEBHOOK_SIGNING_SECRET: signingSecret,
    ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID: accountId,
    BONFIRE_FACTURA_ENABLED: "true",
  }, (input, options) => {
    const url = new URL(String(input));
    const auth = new Headers(options?.headers).get("authorization");
    requests++;
    let response: Response;
    if (url.origin === "https://api.onvopay.com") {
      assertEquals(auth, `Bearer ${onvoSecretKey}`);
      providerRequests++;
      switch (url.pathname) {
        case `/v1/subscriptions/${subscriptionId}`:
          response = Response.json({
            id: subscriptionId,
            mode: "test",
            customerId,
            status: subscriptionStatuses[invoiceStatus],
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            updatedAt: new Date(deliveryTime).toISOString(),
            items: [{ priceId: "price_local_pro", quantity: 1 }],
          });
          break;
        case `/v1/invoices/${invoiceId}`:
        case "/v1/invoices": {
          const invoice = {
            id: invoiceId,
            mode: "test",
            subscriptionId,
            customerId,
            paymentIntentId,
            status: invoiceStatus,
            total: 1_800_000,
            currency: "CRC",
            createdAt: periodStart,
            periodStart,
            periodEnd,
          };
          if (url.pathname === "/v1/invoices") {
            assertEquals(
              url.searchParams.get("subscriptionId"),
              subscriptionId,
            );
            assertEquals(
              url.searchParams.get("paymentIntentId"),
              paymentIntentId,
            );
            assertEquals(url.searchParams.get("customerId"), customerId);
            response = Response.json({ data: [invoice] });
          } else {
            response = Response.json(invoice);
          }
          break;
        }
        case `/v1/payment-intents/${paymentIntentId}`:
          assertEquals(
            invoiceStatus,
            "paid",
            "Only a successful renewal should need payment intent confirmation",
          );
          response = Response.json({
            id: paymentIntentId,
            mode: "test",
            customerId,
            status: "succeeded",
            amount: 1_800_000,
            receivedAmount: 1_800_000,
            currency: "CRC",
            captureMethod: "automatic",
            paymentMethod: { type: "card" },
          });
          break;
        default:
          throw new Error(`Unexpected ONVO request ${url.pathname}`);
      }
      return Promise.resolve(response);
    }

    assertEquals(url.origin, supabaseUrl);
    assertEquals(auth, `Bearer ${serviceKey}`);
    switch (url.pathname) {
      case "/rest/v1/coach_billing_accounts":
        assertEquals(url.searchParams.get("mode"), "eq.onvo_test");
        assert(
          url.searchParams.get("subscription_id") === `eq.${subscriptionId}` ||
            url.searchParams.get("customer_id") === `eq.${customerId}`,
          "The billing account should be identified by the trusted subscription or customer ID",
        );
        response = Response.json([ownerAccount]);
        break;
      case "/rest/v1/coach_billing_events": {
        const key = url.searchParams.get("event_key");
        response = Response.json(
          attempts.filter((event) => `eq.${event.p_event_key}` === key).map((
            event,
          ) => ({ event_key: event.p_event_key })),
        );
        if (bothLookupsStarted && ++eventReads <= 2) {
          if (eventReads === 2) bothLookupsStarted.resolve();
          return bothLookupsStarted.promise.then(() => response);
        }
        break;
      }
      case "/rest/v1/rpc/record_coach_billing_signed_event_with_fiscal":
      case "/rest/v1/rpc/record_coach_billing_signed_event": {
        eventWrites++;
        const event = JSON.parse(String(options?.body)) as AppliedEvent;
        assertEquals(event.p_coach_id, coachId);
        assertEquals(event.p_subscription_id, subscriptionId);
        assertEquals(event.p_provider, "onvo_test");
        assertEquals(event.p_provider_object_id, invoiceId);
        assertEquals(Object.hasOwn(event, "p_fiscal"), event.p_event_type !== "subscription_renewal.failed");
        if (writesUnavailable) {
          return Promise.resolve(new Response(null, { status: 503 }));
        }
        const duplicate = attempts.some(({ p_event_key }) =>
          p_event_key === event.p_event_key
        );
        if (!duplicate) attempts.push(event);
        response = Response.json(!duplicate);
        break;
      }
      default:
        throw new Error(`Unexpected Supabase request ${url.pathname}`);
    }
    return Promise.resolve(response);
  });
  assert(runtime.signedWebhook);
  const handler = createCoachBillingWebhookHandler({
    secret: runtime.webhookSecret,
    recordWebhook: runtime.receiveWebhook,
    signedWebhook: {
      ...runtime.signedWebhook,
      now: () => deliveryTime,
      recordWebhook: runtime.receiveSignedWebhook,
    },
  });

  return {
    attempts,
    send: async (
      body: string,
      secondsAfterFirstDelivery = 0,
      tampered = false,
    ) => {
      const signature = await signedHeader(body, secondsAfterFirstDelivery);
      const response = await handler(
        new Request(`${supabaseUrl}/functions/v1/coach-billing-webhook`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-onvo-signature": signature,
          },
          body: tampered ? `${body}\n` : body,
        }),
      );
      return { status: response.status, body: await response.json() };
    },
    setInvoiceStatus: (status: InvoiceStatus) => {
      invoiceStatus = status;
    },
    setStorageUnavailable: (value: boolean) => {
      writesUnavailable = value;
    },
    requests: () => requests,
    providerRequests: () => providerRequests,
    eventWrites: () => eventWrites,
  };
}

Deno.test("signed subscription HTTP requests apply failures, confirmed renewal, and duplicated deliveries", async () => {
  const fixture = signedWebhookFixture();
  const failure = renewalBody("evt_renewal_attempt_1", 1, "open");

  assertEquals((await fixture.send(failure, 0, true)).status, 401);
  assertEquals(fixture.requests(), 0);
  assertEquals((await fixture.send(failure)).status, 200);
  assertEquals(fixture.attempts[0].p_invoice?.status, "open");
  assertEquals(fixture.attempts[0].p_subscription?.status, "past_due");
  assertEquals(fixture.attempts[0].p_attempt_count, 1);
  assertEquals(
    fixture.attempts[0].p_next_payment_attempt,
    "2026-11-26T18:00:00.000Z",
  );

  const providerCalls = fixture.providerRequests();
  const duplicateFailure = await fixture.send(failure, 1);
  assertEquals(duplicateFailure.status, 200);
  assertEquals(duplicateFailure.body.duplicate, true);
  assertEquals(fixture.providerRequests(), providerCalls);
  assertEquals(
    (await fixture.send(renewalBody("evt_renewal_attempt_2", 2, "open")))
      .status,
    200,
  );
  assertEquals(fixture.attempts.map((event) => event.p_attempt_count), [1, 2]);

  fixture.setInvoiceStatus("paid");
  const renewal = renewalBody("evt_renewal_paid", 3, "paid");
  assertEquals((await fixture.send(renewal)).status, 200);
  assertEquals(fixture.attempts[2].p_invoice?.status, "paid");
  assertEquals(fixture.attempts[2].p_invoice?.period_end, periodEnd);
  assertEquals(fixture.attempts[2].p_subscription?.status, "active");
  const duplicateRenewal = await fixture.send(renewal, 2);
  assertEquals(duplicateRenewal.status, 200);
  assertEquals(duplicateRenewal.body.duplicate, true);

  assertEquals(
    (await fixture.send(
      renewalBody("evt_renewal_delayed_failure", 2, "open"),
      3,
    ))
      .status,
    200,
  );
  assertEquals(fixture.attempts.length, 4);
  assertEquals(fixture.attempts[3].p_attempt_count, 2);
  assertEquals(fixture.attempts[3].p_invoice, null);
  assertEquals(fixture.attempts[3].p_subscription, null);
});

Deno.test("a failed webhook write is retried with a fresh signature and recorded once", async () => {
  const fixture = signedWebhookFixture();
  const failure = renewalBody("evt_renewal_retry", 1, "open");
  fixture.setStorageUnavailable(true);
  assertEquals((await fixture.send(failure)).status, 503);
  assertEquals(fixture.attempts.length, 0);

  fixture.setStorageUnavailable(false);
  assertEquals((await fixture.send(failure, 1)).status, 200);
  assertEquals((await fixture.send(failure, 2)).body.duplicate, true);
  assertEquals(fixture.attempts.length, 1);
});

Deno.test("a final renewal failure records an uncollectible invoice without a scheduled retry", async () => {
  const fixture = signedWebhookFixture();
  assertEquals(
    (await fixture.send(renewalBody("evt_previous_failure", 2, "open"))).status,
    200,
  );

  fixture.setInvoiceStatus("uncollectible");
  assertEquals(
    (await fixture.send(renewalBody("evt_final_failure", 3, "uncollectible")))
      .status,
    200,
  );
  assertEquals(fixture.attempts[1].p_invoice?.status, "uncollectible");
  assertEquals(fixture.attempts[1].p_subscription?.status, "unpaid");
  assertEquals(fixture.attempts[1].p_next_payment_attempt, null);
});

Deno.test("concurrent replays deduplicate and a separate payment notice refers to the same invoice", async () => {
  const fixture = signedWebhookFixture({ raceTwoInitialDeliveries: true });
  fixture.setInvoiceStatus("paid");
  const renewal = renewalBody("evt_paid_once", 1, "paid");
  const deliveries = await Promise.all([
    fixture.send(renewal),
    fixture.send(renewal, 1),
  ]);
  assertEquals(deliveries.map(({ status }) => status), [200, 200]);
  assertEquals(deliveries.map(({ body }) => body.duplicate).sort(), [
    false,
    true,
  ]);
  assertEquals(fixture.eventWrites(), 2);
  assertEquals(fixture.attempts.length, 1);

  const payment = eventBody("evt_same_payment", "payment_intent.succeeded", {
    object: "payment_intent",
    id: paymentIntentId,
    customerId,
    status: "succeeded",
  });
  assertEquals((await fixture.send(payment, 2)).status, 200);
  assertEquals(fixture.attempts.length, 2);
  assertEquals(fixture.attempts[1].p_event_type, "payment_intent.succeeded");
  assertEquals(fixture.attempts[1].p_invoice, fixture.attempts[0].p_invoice);
});
