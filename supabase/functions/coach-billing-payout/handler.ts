export type PaidPayout = {
  eventId: string;
  payoutId: string;
  accountId: string;
  reference: string | null;
  settledAt: string;
  providerUpdatedAt: string;
  currency: "CRC" | "USD";
  transactionCount: number;
  grossMinor: string;
  feesMinor: string | null;
  payoutFeeMinor: string | null;
  retentionsMinor: string | null;
  netMinor: string;
};

export interface CoachBillingPayoutDependencies {
  enabled: boolean;
  secret: string;
  accountId: string;
  recordPaidPayout(payout: PaidPayout): Promise<boolean>;
  now?: () => number;
}

type JsonObject = Record<string, unknown>;

const maxBodyBytes = 65_536;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

function signatureParts(header: string): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",").map((part) => part.trim().split("=", 2));
  const timestamps = parts.filter(([key]) => key === "t").map(([, value]) => value);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamps[0] ?? "") || !signatures.length) return null;
  const timestamp = Number(timestamps[0]);
  return Number.isSafeInteger(timestamp) ? { timestamp, signatures } : null;
}

async function validSignature(
  rawBody: Uint8Array,
  header: string,
  secret: string,
  now: number,
): Promise<boolean> {
  const parsed = signatureParts(header);
  if (!parsed || Math.abs(Math.floor(now / 1000) - parsed.timestamp) > 300) return false;

  const prefix = new TextEncoder().encode(`${parsed.timestamp}.`);
  const signedBody = new Uint8Array(prefix.length + rawBody.length);
  signedBody.set(prefix);
  signedBody.set(rawBody, prefix.length);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, signedBody));

  let matched = false;
  for (const candidate of parsed.signatures) {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) continue;
    const received = new Uint8Array(candidate.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    matched = equalBytes(expected, received) || matched;
  }
  return matched;
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value;
}

function optionalText(value: unknown, maxLength = 200): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.length <= maxLength ? value : undefined;
}

function minorUnits(value: unknown, required: boolean): string | null | undefined {
  if (value === undefined || value === null) return required ? undefined : null;
  if (typeof value !== "string" || !/^\d{1,19}$/.test(value)) return undefined;
  try {
    const amount = BigInt(value);
    if (amount > 9_223_372_036_854_775_807n) return undefined;
    return amount.toString();
  } catch {
    return undefined;
  }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

function parsePayout(event: JsonObject, accountId: string): PaidPayout | null {
  if (event.object !== "event" || !safeId(event.id) || event.type !== "payout.paid"
    || event.mode !== "test" || event.accountId !== accountId) return null;
  const data = event.data;
  if (!isObject(data) || !isObject(data.object)) return null;
  const payout = data.object;
  if (payout.object !== "payout" || payout.status !== "paid" || !safeId(payout.id)) return null;
  if (payout.currency !== "CRC" && payout.currency !== "USD") return null;
  const grossMinor = minorUnits(payout.payoutGross, true);
  const netMinor = minorUnits(payout.payoutNet, true);
  const feesMinor = minorUnits(payout.fees, false);
  const payoutFeeMinor = minorUnits(payout.payoutFee, false);
  const retentionsMinor = minorUnits(payout.retentions, false);
  const reference = optionalText(payout.reference, 200);
  const settledAt = isoDate(payout.arrivedAt) ?? isoDate(payout.updatedAt);
  const providerUpdatedAt = isoDate(payout.updatedAt) ?? settledAt;
  const transactionCount = payout.transactionsCount;

  if (typeof grossMinor !== "string" || typeof netMinor !== "string" || feesMinor === undefined
    || payoutFeeMinor === undefined || retentionsMinor === undefined || reference === undefined
    || !settledAt || !providerUpdatedAt || !Number.isSafeInteger(transactionCount)
    || (transactionCount as number) < 0) return null;

  return {
    eventId: event.id,
    payoutId: payout.id,
    accountId,
    reference,
    settledAt,
    providerUpdatedAt,
    currency: payout.currency,
    transactionCount: transactionCount as number,
    grossMinor,
    feesMinor,
    payoutFeeMinor,
    retentionsMinor,
    netMinor,
  };
}

export function isLocalOnvoTestTarget(env: Record<string, string>): boolean {
  if (env.DENO_DEPLOYMENT_ID || /^(prod|production|live)$/i.test(env.ENVIRONMENT ?? "")) return false;
  if (env.COACH_BILLING_MODE !== "onvo_test") return false;
  if (env.ONVO_SECRET_KEY?.startsWith("onvo_live_") || env.ONVO_PUBLISHABLE_KEY?.startsWith("onvo_live_")) return false;
  try {
    const host = new URL(env.SUPABASE_URL ?? "").hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "kong", "supabase_kong", "host.docker.internal"].includes(host);
  } catch {
    return false;
  }
}

export function createCoachBillingPayoutHandler(deps: CoachBillingPayoutDependencies) {
  const now = deps.now ?? Date.now;
  return async (request: Request): Promise<Response> => {
    if (!deps.enabled || !deps.secret || !safeId(deps.accountId)) {
      return json(503, { error: { code: "payout_webhook_not_configured", message: "Sandbox payout intake is not configured." } });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method !== "POST") return json(405, { error: { code: "method_not_allowed", message: "Use POST for payout events." } });

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maxBodyBytes) return json(413, { error: { code: "request_too_large", message: "Webhook body is too large." } });

    let rawBody: Uint8Array;
    try {
      rawBody = new Uint8Array(await request.arrayBuffer());
    } catch {
      return json(400, { error: { code: "invalid_webhook", message: "Webhook body could not be read." } });
    }
    if (rawBody.length > maxBodyBytes) return json(413, { error: { code: "request_too_large", message: "Webhook body is too large." } });

    const signature = request.headers.get("x-onvo-signature") ?? "";
    try {
      if (!await validSignature(rawBody, signature, deps.secret, now())) {
        return json(401, { error: { code: "invalid_signature", message: "Webhook signature verification failed." } });
      }
    } catch {
      return json(401, { error: { code: "invalid_signature", message: "Webhook signature verification failed." } });
    }

    let event: unknown;
    try {
      event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
    } catch {
      return json(400, { error: { code: "invalid_webhook", message: "Webhook body must be valid JSON." } });
    }
    if (!isObject(event)) return json(400, { error: { code: "invalid_webhook", message: "Webhook envelope is invalid." } });
    if (event.mode !== "test" || event.accountId !== deps.accountId) {
      return json(403, { error: { code: "sandbox_account_mismatch", message: "Only the configured ONVO test account is accepted." } });
    }
    if (event.type !== "payout.paid") return json(200, { received: true, ignored: true });

    const payout = parsePayout(event, deps.accountId);
    if (!payout) return json(400, { error: { code: "invalid_payout", message: "Paid payout event is missing valid settlement fields." } });

    try {
      const inserted = await deps.recordPaidPayout(payout);
      return json(200, { received: true, duplicate: !inserted });
    } catch {
      return json(503, { error: { code: "payout_persistence_failed", message: "Payout could not be recorded; retry delivery." } });
    }
  };
}
