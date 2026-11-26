type JsonObject = Record<string, unknown>;
type Mode = "test" | "live";

export type FiscalPayment = {
  mode: Mode;
  accountId: string;
  paymentIntentId: string;
  sourceEventId: string;
  amountMinor: number;
  currency: string;
  confirmedAt: string;
};

type Dependencies = {
  accountId: string;
  mode: Mode;
  signingSecret: string;
  recordPayment(payment: FiscalPayment): Promise<boolean>;
  now?: () => number;
};

const MAX_BODY_BYTES = 65_536;
const encoder = new TextEncoder();

function record(value: unknown): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (!request.body) throw new Error("Missing body");
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return bytes.subarray(0, length);
      if (length + value.byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

async function hasValidSignature(
  body: Uint8Array<ArrayBuffer>,
  header: string,
  signingKey: Promise<CryptoKey>,
  now: number,
): Promise<boolean> {
  const parts = header.split(",").map((part) => part.trim());
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

function json(status: number, body: JsonObject) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function createOnvoFiscalWebhook(deps: Dependencies) {
  const signingKey = crypto.subtle.importKey(
    "raw",
    encoder.encode(deps.signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }
    const signature = request.headers.get("x-onvo-signature");
    if (!signature) return json(401, { error: "invalid_signature" });

    let body: Uint8Array<ArrayBuffer>;
    try {
      body = await readBody(request);
    } catch {
      return json(400, { error: "invalid_body" });
    }
    if (
      !await hasValidSignature(
        body,
        signature,
        signingKey,
        (deps.now ?? Date.now)(),
      )
    ) {
      return json(401, { error: "invalid_signature" });
    }

    let event: JsonObject | undefined;
    try {
      event = record(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)),
      );
    } catch {
      return json(400, { error: "invalid_event" });
    }
    if (event?.object !== "event" || !identifier(event.id)) {
      return json(400, { error: "invalid_event" });
    }
    if (event.accountId !== deps.accountId || event.mode !== deps.mode) {
      return json(403, { error: "unexpected_onvo_account_or_mode" });
    }

    const renewal = event.type === "subscription_renewal.succeeded";
    if (!renewal && event.type !== "payment_intent.succeeded") {
      return json(200, { ignored: true });
    }

    const payment = record(record(event.data)?.object);
    const paymentIntentId = renewal ? payment?.paymentIntentId : payment?.id;
    const paymentStatus = renewal ? payment?.invoiceStatus : payment?.status;
    const amount = renewal ? payment?.total : payment?.receivedAmount ??
      (payment?.captureMethod === "manual" ? undefined : payment?.amount);
    const currency = payment?.currency;
    const confirmedAt = typeof event.createdAt === "string"
      ? new Date(event.createdAt)
      : null;
    if (
      payment?.object !==
        (renewal ? "subscription_renewal" : "payment_intent") ||
      paymentStatus !== (renewal ? "paid" : "succeeded") ||
      typeof amount !== "number" || !Number.isSafeInteger(amount) ||
      amount < 0 ||
      typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency) ||
      !confirmedAt || !Number.isFinite(confirmedAt.getTime())
    ) return json(400, { error: "invalid_successful_payment" });

    if (amount === 0) return json(200, { ignored: true });
    if (!identifier(paymentIntentId)) {
      return json(400, { error: "invalid_payment_intent_id" });
    }

    try {
      const inserted = await deps.recordPayment({
        mode: deps.mode,
        accountId: deps.accountId,
        paymentIntentId,
        sourceEventId: event.id,
        amountMinor: amount,
        currency,
        confirmedAt: confirmedAt.toISOString(),
      });
      return json(200, { recorded: true, duplicate: !inserted });
    } catch {
      console.error("ONVO fiscal payment could not be recorded", {
        eventId: event.id,
      });
      return json(503, { error: "payment_recording_failed" });
    }
  };
}
