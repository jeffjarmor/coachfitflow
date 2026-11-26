import {
  createCoachBillingWebhookHandler,
  type OnvoSignedBillingEvent,
} from "./webhook.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeHandler(overrides: Record<string, unknown> = {}) {
  const seen: unknown[][] = [];
  const deps = {
    secret: "webhook_secret_test_value",
    recordWebhook: (...args: unknown[]) => { seen.push(args); return Promise.resolve({ received: true, duplicate: false }); },
    ...overrides,
  };
  return { handler: createCoachBillingWebhookHandler(deps as never), seen };
}

Deno.test("rejects webhook without exact configured secret before processing", async () => {
  const { handler, seen } = makeHandler();
  const response = await handler(new Request("http://local/functions/v1/coach-billing-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "wrong" },
    body: JSON.stringify({ type: "subscription.renewal.succeeded", data: { id: "inv-1" } }),
  }));
  assertEquals(response.status, 401);
  assertEquals(seen.length, 0);
});

Deno.test("processes renewal events with deterministic identity and tolerates replay", async () => {
  const { handler, seen } = makeHandler({ recordWebhook: (key: string, type: string) => {
    seen.push([key, type]);
    return Promise.resolve({ received: true, duplicate: true });
  } });
  const payload = JSON.stringify({
    type: "subscription.renewal.succeeded",
    data: { id: "inv-1", subscriptionId: "sub-1", paymentIntentId: "pi-1", periodStart: "2026-11-01T00:00:00.000Z" },
  });
  const invoke = () => handler(new Request("http://local/functions/v1/coach-billing-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "webhook_secret_test_value" },
    body: payload,
  }));
  const first = await invoke();
  const second = await invoke();
  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals(seen.length, 2);
  assertEquals(seen[0][0], seen[1][0]);
  assertEquals(seen[0][1], "subscription.renewal.succeeded");
});

Deno.test("acknowledges unsupported event types without applying billing state", async () => {
  const { handler, seen } = makeHandler();
  const response = await handler(new Request("http://local/functions/v1/coach-billing-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "webhook_secret_test_value" },
    body: JSON.stringify({ type: "payment-intent.succeeded", data: { id: "pi-1" } }),
  }));
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { received: true, ignored: true });
  assertEquals(seen.length, 0);
});

Deno.test("returns retryable failure if event persistence fails", async () => {
  const { handler } = makeHandler({ recordWebhook: () => Promise.reject(new Error("secret values must not leak")) });
  const response = await handler(new Request("http://local/functions/v1/coach-billing-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "webhook_secret_test_value" },
    body: JSON.stringify({ type: "subscription.renewal.failed", data: { subscriptionId: "sub-1", paymentIntentId: "pi-1" } }),
  }));
  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: { code: "webhook_processing_failed", message: "Webhook processing failed; retry delivery." } });
});

const signedSecret = "whsec_local_subscription_fixture";
const accountId = "clacct0001";
const now = Date.parse("2026-11-25T18:00:00.000Z");
const timestamp = now / 1000;
const webhookUrl = "http://local/functions/v1/coach-billing-webhook";

const renewal = {
  object: "subscription_renewal",
  invoiceId: "inv_1",
  subscriptionId: "sub_1",
  paymentIntentId: "pi_1",
  currency: "CRC",
  total: 1_000_000,
  invoiceStatus: "paid",
  subscriptionStatus: "active",
  periodStart: "2026-11-25T00:00:00.000Z",
  periodEnd: "2026-12-25T00:00:00.000Z",
};

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_renewal_1",
    object: "event",
    type: "subscription_renewal.succeeded",
    accountId,
    mode: "test",
    createdAt: new Date(now).toISOString(),
    data: { object: renewal },
    ...overrides,
  };
}

function signedHandler(
  recordWebhook?: (event: OnvoSignedBillingEvent) => Promise<unknown>,
) {
  const seen: OnvoSignedBillingEvent[] = [];
  let legacyCalls = 0;
  const handler = createCoachBillingWebhookHandler({
    secret: "legacy_test_secret",
    recordWebhook: () => Promise.resolve(++legacyCalls),
    signedWebhook: {
      signingSecret: signedSecret,
      accountId,
      mode: "test",
      now: () => now,
      recordWebhook: recordWebhook ?? ((event) => {
        seen.push(event);
        return Promise.resolve({ received: true });
      }),
    },
  });
  return { handler, seen, legacyCalls: () => legacyCalls };
}

async function signature(body: string, signedAt = timestamp): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${signedAt}.${body}`),
  );
  const hex = Array.from(
    new Uint8Array(bytes),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${signedAt},v1=${hex}`;
}

function signedRequest(body: string, signatureHeader?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (signatureHeader) headers.set("x-onvo-signature", signatureHeader);
  return new Request(webhookUrl, { method: "POST", headers, body });
}

Deno.test("signed billing authenticates raw bytes and accepts either signature during rotation", async () => {
  const { handler, seen } = signedHandler();
  const event = envelope({
    data: {
      object: { ...renewal, subscriptionMetadata: { note: "renovación" } },
    },
  });
  const payload = JSON.stringify(event, null, 2);
  const authenticated = await signature(payload);
  const expectedSignature = `t=${timestamp}, v1=${"0".repeat(64)}, ${
    authenticated.split(",")[1]
  }`;
  const response = await handler(signedRequest(payload, expectedSignature));
  assertEquals(response.status, 200);
  assertEquals(seen, [{
    id: event.id,
    type: event.type,
    accountId,
    mode: "test",
    createdAt: event.createdAt,
    data: (event.data as { object: unknown }).object,
  }]);

  const tampered = await handler(
    signedRequest(JSON.stringify(event), expectedSignature),
  );
  assertEquals(tampered.status, 401);
  assertEquals(seen.length, 1);
});

Deno.test("signed billing rejects invalid signatures and never falls back to the legacy secret", async () => {
  const { handler, seen, legacyCalls } = signedHandler();
  const body = JSON.stringify(envelope());
  for (
    const header of [
      undefined,
      `t=${timestamp},v1=${"0".repeat(64)}`,
      await signature(body, timestamp - 301),
      await signature(body, timestamp + 301),
      `${await signature(body)},t=${timestamp}`,
    ]
  ) {
    const request = signedRequest(body, header);
    request.headers.set("x-webhook-secret", "legacy_test_secret");
    assertEquals((await handler(request)).status, 401);
  }
  assertEquals(legacyCalls(), 0);
  assertEquals(seen.length, 0);
});

Deno.test("signed billing rejects events from a different account or mode", async () => {
  const { handler, seen } = signedHandler();
  for (const overrides of [{ accountId: "clacct0002" }, { mode: "live" }]) {
    const body = JSON.stringify(envelope(overrides));
    assertEquals(
      (await handler(signedRequest(body, await signature(body)))).status,
      403,
    );
  }
  assertEquals(seen.length, 0);
});

Deno.test("signed billing accepts the provider's 1 MiB body limit", async () => {
  const { handler, seen } = signedHandler();
  const valid = JSON.stringify(envelope()).padEnd(1_048_576);
  const oversized = valid + " ";
  assertEquals(
    (await handler(signedRequest(valid, await signature(valid)))).status,
    200,
  );
  assertEquals(
    (await handler(signedRequest(oversized, await signature(oversized)))).status,
    400,
  );
  assertEquals(seen.length, 1);
});

Deno.test("signed billing rejects malformed signed envelopes", async () => {
  const { handler, seen } = signedHandler();
  for (
    const body of [
      "{",
      JSON.stringify(envelope({ id: undefined })),
      JSON.stringify(envelope({ createdAt: "invalid date" })),
      JSON.stringify(envelope({ data: { object: "subscription_renewal" } })),
    ]
  ) {
    assertEquals(
      (await handler(signedRequest(body, await signature(body)))).status,
      400,
    );
  }
  assertEquals(seen.length, 0);
});

Deno.test("signed renewal failures keep ONVO event identity across retries and attempts", async () => {
  const { handler, seen } = signedHandler();
  const failedRenewal = {
    ...renewal,
    invoiceStatus: "open",
    error: { code: "declined" },
  };
  for (
    const [id, attemptCount, signedAt] of [
      ["evt_failure_1", 1, timestamp],
      ["evt_failure_1", 1, timestamp + 1],
      ["evt_failure_2", 2, timestamp],
    ] as const
  ) {
    const body = JSON.stringify(envelope({
      id,
      type: "subscription_renewal.failed",
      data: { object: { ...failedRenewal, attemptCount } },
    }));
    assertEquals(
      (await handler(signedRequest(body, await signature(body, signedAt))))
        .status,
      200,
    );
  }
  assertEquals(seen.map(({ id }) => id), [
    "evt_failure_1",
    "evt_failure_1",
    "evt_failure_2",
  ]);
  assertEquals(seen.map(({ data }) => data.attemptCount), [1, 1, 2]);
});

Deno.test("signed billing records payment success and acknowledges connection tests without writes", async () => {
  const { handler, seen } = signedHandler();
  const send = async (type: string, resource: Record<string, unknown>) => {
    const body = JSON.stringify(envelope({ type, data: { object: resource } }));
    const response = await handler(signedRequest(body, await signature(body)));
    assertEquals(response.status, 200);
    return response.json();
  };

  const payment = { object: "payment_intent", id: "pi_1", status: "succeeded" };
  assertEquals(await send("payment_intent.succeeded", payment), {
    received: true,
  });
  assertEquals(await send("payment_intent.failed", payment), {
    received: true,
    ignored: true,
  });
  assertEquals(
    await send("webhook_endpoint.test", {
      object: "webhook_endpoint",
      id: "wh_1",
    }),
    {
      received: true,
      test: true,
    },
  );
  assertEquals(seen.map(({ data }) => data), [payment]);
});

Deno.test("signed billing reports a retryable error when processing fails", async () => {
  const { handler } = signedHandler(() =>
    Promise.reject(new Error("Internal details"))
  );
  const body = JSON.stringify(envelope());
  const response = await handler(signedRequest(body, await signature(body)));
  assertEquals(response.status, 503);
  assertEquals(await response.json(), {
    error: {
      code: "webhook_processing_failed",
      message: "Webhook processing failed; retry delivery.",
    },
  });
});
