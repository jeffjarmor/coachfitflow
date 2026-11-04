import { createCoachBillingWebhookHandler } from "./webhook.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeHandler(overrides: Record<string, unknown> = {}) {
  const seen: unknown[][] = [];
  const deps = {
    secret: "webhook_secret_test_value",
    recordWebhook: async (...args: unknown[]) => { seen.push(args); return { received: true, duplicate: false }; },
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
  const { handler, seen } = makeHandler({ recordWebhook: async (key: string, type: string) => {
    seen.push([key, type]);
    return { received: true, duplicate: true };
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
  const { handler } = makeHandler({ recordWebhook: async () => { throw new Error("secret values must not leak"); } });
  const response = await handler(new Request("http://local/functions/v1/coach-billing-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "webhook_secret_test_value" },
    body: JSON.stringify({ type: "subscription.renewal.failed", data: { subscriptionId: "sub-1", paymentIntentId: "pi-1" } }),
  }));
  assertEquals(response.status, 503);
  assertEquals(await response.json(), { error: { code: "webhook_processing_failed", message: "Webhook processing failed; retry delivery." } });
});
