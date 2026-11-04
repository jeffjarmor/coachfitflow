type JsonObject = Record<string, unknown>;

export interface CoachBillingWebhookDependencies {
  secret: string;
  recordWebhook(eventKey: string, type: string, data: JsonObject): Promise<unknown>;
}

function secureEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return mismatch === 0;
}

async function eventKey(type: string, data: JsonObject): Promise<string | null> {
  const objectId = typeof data.id === "string" ? data.id
    : typeof data.paymentIntentId === "string" ? data.paymentIntentId
    : typeof data.subscriptionId === "string" ? data.subscriptionId : null;
  if (!objectId) return null;
  const stable = `${type}:${objectId}:${typeof data.periodStart === "string" ? data.periodStart : ""}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stable));
  return `onvo:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function createCoachBillingWebhookHandler(deps: CoachBillingWebhookDependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: { code: "method_not_allowed", message: "Use POST for webhook events." } });
    if (!deps.secret) return json(503, { error: { code: "webhook_not_configured", message: "Webhook verification is not configured." } });
    const supplied = request.headers.get("x-webhook-secret") ?? "";
    if (!secureEqual(supplied, deps.secret)) return json(401, { error: { code: "invalid_webhook_secret", message: "Webhook verification failed." } });
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return json(415, { error: { code: "invalid_content_type", message: "Send a JSON webhook body." } });
    }
    let payload: unknown;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 65_536) throw new Error("too_large");
      payload = JSON.parse(raw);
    } catch {
      return json(400, { error: { code: "invalid_webhook", message: "Webhook body must be valid JSON within the size limit." } });
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return json(400, { error: { code: "invalid_webhook", message: "Webhook body is invalid." } });
    }
    const event = payload as JsonObject;
    const type = typeof event.type === "string" ? event.type : "";
    const data = event.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return json(400, { error: { code: "invalid_webhook", message: "Webhook event data is invalid." } });
    }
    if (!new Set(["subscription.renewal.succeeded", "subscription.renewal.failed"]).has(type)) {
      return json(200, { received: true, ignored: true });
    }
    const key = await eventKey(type, data as JsonObject);
    if (!key) return json(400, { error: { code: "invalid_webhook", message: "Webhook event has no stable provider object identity." } });
    try {
      const result = await deps.recordWebhook(key, type, data as JsonObject);
      return json(200, result);
    } catch {
      return json(503, { error: { code: "webhook_processing_failed", message: "Webhook processing failed; retry delivery." } });
    }
  };
}
