import { BillingRequestError } from "./handler.ts";

type JsonObject = Record<string, unknown>;
type OnvoMode = "test" | "live";

export type OnvoSignedBillingEvent = {
  id: string;
  type:
    | "payment_intent.succeeded"
    | "subscription_renewal.succeeded"
    | "subscription_renewal.failed";
  accountId: string;
  mode: OnvoMode;
  createdAt: string;
  data: JsonObject;
};

type SignedWebhookDependencies = {
  signingSecret: string;
  accountId: string;
  mode: OnvoMode;
  recordWebhook(event: OnvoSignedBillingEvent): Promise<unknown>;
  now?: () => number;
};

export interface CoachBillingWebhookDependencies {
  secret: string;
  recordWebhook(eventKey: string, type: string, data: JsonObject): Promise<unknown>;
  signedWebhook?: SignedWebhookDependencies | null;
}

const MAX_SIGNED_WEBHOOK_BYTES = 1_048_576;
const MAX_LEGACY_WEBHOOK_BYTES = 65_536;
const encoder = new TextEncoder();

function secureEqual(left: string, right: string): boolean {
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

function webhookError(status: number, code: string, message: string) {
  return json(status, { error: { code, message } });
}

function object(value: unknown): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
}

async function readSignedBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) throw new Error("Missing webhook body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_SIGNED_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new Error("Webhook body exceeds the size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

async function verifyOnvoSignature(
  body: Uint8Array<ArrayBuffer>,
  signature: string,
  signingKey: Promise<CryptoKey>,
  now: number,
): Promise<boolean> {
  const parts = signature.split(",").map((part) => part.trim());
  const timestamps = parts.filter((part) => part.startsWith("t="));
  if (timestamps.length !== 1 || !/^t=\d{1,12}$/.test(timestamps[0])) {
    return false;
  }
  const timestamp = timestamps[0].slice(2);
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;

  const prefix = encoder.encode(`${timestamp}.`);
  const signedBody = new Uint8Array(prefix.length + body.length);
  signedBody.set(prefix);
  signedBody.set(body, prefix.length);
  const key = await signingKey;

  for (const part of parts) {
    if (!/^v1=[0-9a-f]{64}$/i.test(part)) continue;
    const hex = part.slice(3);
    const candidate = Uint8Array.from(
      { length: 32 },
      (_, index) => parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    );
    if (await crypto.subtle.verify("HMAC", key, candidate, signedBody)) {
      return true;
    }
  }
  return false;
}

function createSignedWebhookHandler(deps: SignedWebhookDependencies) {
  const signingKey = crypto.subtle.importKey(
    "raw",
    encoder.encode(deps.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return async (request: Request): Promise<Response> => {
    const signature = request.headers.get("x-onvo-signature");
    const invalidSignature = () =>
      webhookError(
        401,
        "invalid_signature",
        "Webhook signature verification failed.",
      );
    if (!signature) return invalidSignature();
    if (
      !request.headers.get("content-type")?.toLowerCase().includes(
        "application/json",
      )
    ) {
      return webhookError(
        415,
        "invalid_content_type",
        "Send a JSON webhook body.",
      );
    }

    let body: Uint8Array<ArrayBuffer>;
    try {
      body = await readSignedBody(request);
    } catch {
      return webhookError(
        400,
        "invalid_webhook",
        "Webhook body is missing or exceeds the size limit.",
      );
    }
    if (
      !await verifyOnvoSignature(
        body,
        signature,
        signingKey,
        (deps.now ?? Date.now)(),
      )
    ) {
      return invalidSignature();
    }

    let event: JsonObject | undefined;
    try {
      event = object(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
      );
    } catch {
      return webhookError(
        400,
        "invalid_webhook",
        "Webhook body must be valid JSON.",
      );
    }
    if (
      event?.object !== "event" || typeof event.id !== "string" ||
      !/^[a-z0-9_-]{1,200}$/i.test(event.id) ||
      typeof event.createdAt !== "string" ||
      !Number.isFinite(Date.parse(event.createdAt)) ||
      typeof event.type !== "string" || !event.type
    ) {
      return webhookError(
        400,
        "invalid_webhook",
        "Webhook event envelope is invalid.",
      );
    }
    const { accountId, mode } = deps;
    if (event.accountId !== accountId || event.mode !== mode) {
      return webhookError(
        403,
        "unexpected_onvo_account_or_mode",
        "Webhook account or mode does not match.",
      );
    }

    const { id, type, createdAt } = event;
    const data = object(object(event.data)?.object);
    if (type === "webhook_endpoint.test") {
      if (data?.object !== "webhook_endpoint") {
        return webhookError(
          400,
          "invalid_webhook",
          "Webhook event data is invalid.",
        );
      }
      return json(200, { received: true, test: true });
    }
    if (
      type !== "payment_intent.succeeded" &&
      type !== "subscription_renewal.succeeded" &&
      type !== "subscription_renewal.failed"
    ) {
      return json(200, { received: true, ignored: true });
    }
    if (
      data?.object !== (type === "payment_intent.succeeded"
        ? "payment_intent"
        : "subscription_renewal")
    ) {
      return webhookError(
        400,
        "invalid_webhook",
        "Webhook event data is invalid.",
      );
    }

    try {
      return json(
        200,
        await deps.recordWebhook({
          id,
          type,
          accountId,
          mode,
          createdAt,
          data,
        }),
      );
    } catch (error) {
      console.error("ONVO billing webhook processing failed", {
        eventId: id,
        type,
        code: error instanceof BillingRequestError ? error.code : "unexpected_error",
      });
      return webhookError(
        503,
        "webhook_processing_failed",
        "Webhook processing failed; retry delivery.",
      );
    }
  };
}

export function createCoachBillingWebhookHandler(deps: CoachBillingWebhookDependencies) {
  const signedHandler = deps.signedWebhook ? createSignedWebhookHandler(deps.signedWebhook) : null;

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json(405, { error: { code: "method_not_allowed", message: "Use POST for webhook events." } });
    if (signedHandler) return signedHandler(request);
    if (!deps.secret || request.headers.has("x-onvo-signature")) {
      return webhookError(503, "webhook_not_configured", "Webhook verification is not configured.");
    }
    const supplied = request.headers.get("x-webhook-secret") ?? "";
    if (!secureEqual(supplied, deps.secret)) return json(401, { error: { code: "invalid_webhook_secret", message: "Webhook verification failed." } });
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return json(415, { error: { code: "invalid_content_type", message: "Send a JSON webhook body." } });
    }
    let payload: unknown;
    try {
      const raw = await request.text();
      if (encoder.encode(raw).byteLength > MAX_LEGACY_WEBHOOK_BYTES) throw new Error("too_large");
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
