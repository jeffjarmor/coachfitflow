import { createCoachBillingHandler } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertStringIncludes(actual: string, expected: string) {
  if (!actual.includes(expected)) throw new Error(`Expected ${actual} to include ${expected}`);
}

const coach = { id: "coach-1", email: "coach@example.test", name: "Coach One" };

function makeHandler(overrides: Record<string, unknown> = {}) {
  const calls: Array<[string, unknown]> = [];
  const deps = {
    authenticate: async (request: Request) => request.headers.get("authorization") === "Bearer valid"
      ? coach
      : null,
    status: async (owner: typeof coach) => { calls.push(["status", owner.id]); return { configured: false }; },
    subscribe: async (owner: typeof coach) => { calls.push(["subscribe", owner.id]); return { configured: false }; },
    reconcile: async (owner: typeof coach) => { calls.push(["reconcile", owner.id]); return { configured: false }; },
    cancel: async (owner: typeof coach) => { calls.push(["cancel", owner.id]); return { configured: false }; },
    changePaymentMethod: async (owner: typeof coach, paymentMethodId: string) => {
      calls.push(["change-payment-method", [owner.id, paymentMethodId]]);
      return { configured: false };
    },
    simulate: async (owner: typeof coach, scenario: string) => {
      calls.push(["simulate", [owner.id, scenario]]);
      return { configured: false };
    },
    ...overrides,
  };
  return { handler: createCoachBillingHandler(deps as never), calls };
}

Deno.test("rejects anonymous requests without calling billing operations", async () => {
  const { handler, calls } = makeHandler();
  const response = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  }));
  assertEquals(response.status, 401);
  assertEquals(await response.json(), { error: { code: "unauthorized", message: "Authentication required." } });
  assertEquals(calls.length, 0);
});

Deno.test("rejects client-supplied coach identity and derives owner from session", async () => {
  const { handler, calls } = makeHandler();
  const spoofed = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "status", coachId: "victim" }),
  }));
  assertEquals(spoofed.status, 400);
  assertEquals(calls.length, 0);
  const response = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  }));
  assertEquals(response.status, 200);
  assertEquals(calls, [["status", "coach-1"]]);
});

Deno.test("browser success callbacks cannot activate Pro; only reconcile is accepted", async () => {
  const { handler, calls } = makeHandler();
  const callback = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "success", subscriptionId: "sub-fake", status: "paid" }),
  }));
  assertEquals(callback.status, 400);
  assertEquals(calls.length, 0);
  const reconciliation = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "reconcile" }),
  }));
  assertEquals(reconciliation.status, 200);
  assertEquals(calls, [["reconcile", "coach-1"]]);
});

Deno.test("payment method mutation requires only a provider method id and routes through ownership check", async () => {
  const { handler, calls } = makeHandler();
  const response = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "change-payment-method", paymentMethodId: "pm-owned" }),
  }));
  assertEquals(response.status, 200);
  assertEquals(calls, [["change-payment-method", ["coach-1", "pm-owned"]]]);
  const rawCard = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "change-payment-method", paymentMethodId: "pm", card: { number: "4111111111111111", cvv: "123" } }),
  }));
  assertEquals(rawCard.status, 400);
  assertEquals(calls.length, 1);
});

Deno.test("local simulator outcomes remain explicit actions, not browser callback claims", async () => {
  const { handler, calls } = makeHandler();
  const response = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "simulate", scenario: "success" }),
  }));
  assertEquals(response.status, 200);
  assertEquals(calls, [["simulate", ["coach-1", "success"]]]);
  const invalid = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: JSON.stringify({ action: "simulate", scenario: "active" }),
  }));
  assertEquals(invalid.status, 400);
  assertEquals(calls.length, 1);
});

Deno.test("reports stable JSON errors for malformed request bodies", async () => {
  const { handler } = makeHandler();
  const response = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "POST",
    headers: { authorization: "Bearer valid", "content-type": "application/json" },
    body: "{",
  }));
  assertEquals(response.status, 400);
  assertStringIncludes(await response.text(), '"code":"invalid_request"');
});

Deno.test("local Supabase function preflight allows its SDK bearer and API-key headers", async () => {
  const { handler } = makeHandler({ allowedOrigins: ["http://127.0.0.1:4300"] });
  const response = await handler(new Request("http://local/functions/v1/coach-billing", {
    method: "OPTIONS",
    headers: { origin: "http://127.0.0.1:4300", "access-control-request-headers": "authorization, apikey, content-type, x-client-info" },
  }));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:4300");
  assertStringIncludes(response.headers.get("access-control-allow-headers") ?? "", "apikey");
  assertStringIncludes(response.headers.get("access-control-allow-headers") ?? "", "x-client-info");
});
