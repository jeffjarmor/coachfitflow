import { createCoachBillingPayoutHandler, isLocalOnvoTestTarget } from "./handler.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const secret = "whsec_local_test_secret";
const accountId = "clacct_test_001";
const now = 1_800_000_000_000;

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_test_001",
    object: "event",
    createdAt: "2027-01-15T10:00:00.000Z",
    mode: "test",
    accountId,
    type: "payout.paid",
    data: {
      object: {
        object: "payout",
        id: "clpo_test_001",
        status: "paid",
        currency: "CRC",
        payoutGross: "12500000",
        payoutNet: "12187500",
        payoutFee: "0",
        fees: "312500",
        transactionsCount: 42,
        reference: "202701150",
        arrivedAt: "2027-01-15T09:59:30.000Z",
        createdAt: "2027-01-15T06:00:00.000Z",
        updatedAt: "2027-01-15T10:00:00.000Z",
        ...overrides,
      },
    },
  };
}

async function signature(rawBody: string, timestamp = Math.floor(now / 1000), signingSecret = secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

function setup(options: { enabled?: boolean; insert?: boolean } = {}) {
  const saved: unknown[] = [];
  const handler = createCoachBillingPayoutHandler({
    enabled: options.enabled ?? true,
    secret,
    accountId,
    now: () => now,
    recordPaidPayout: async (payout) => {
      saved.push(payout);
      return options.insert ?? true;
    },
  });
  return { handler, saved };
}

async function post(handler: (request: Request) => Promise<Response>, rawBody: string, header?: string) {
  return await handler(new Request("http://local/functions/v1/coach-billing-payout", {
    method: "POST",
    headers: { "content-type": "application/json", ...(header ? { "x-onvo-signature": header } : {}) },
    body: rawBody,
  }));
}

Deno.test("accepts only a signed test payout and preserves provider minor-unit strings", async () => {
  const { handler, saved } = setup();
  const raw = JSON.stringify(event({ retentions: "1200" }));
  const response = await post(handler, raw, await signature(raw));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { received: true, duplicate: false });
  assertEquals(saved, [{
    eventId: "evt_test_001",
    payoutId: "clpo_test_001",
    accountId,
    reference: "202701150",
    settledAt: "2027-01-15T09:59:30.000Z",
    providerUpdatedAt: "2027-01-15T10:00:00.000Z",
    currency: "CRC",
    transactionCount: 42,
    grossMinor: "12500000",
    feesMinor: "312500",
    payoutFeeMinor: "0",
    retentionsMinor: "1200",
    netMinor: "12187500",
  }]);
});

Deno.test("rejects a body changed after signature generation without persistence", async () => {
  const { handler, saved } = setup();
  const signed = JSON.stringify(event());
  const changed = signed.replace("12500000", "12500001");
  const response = await post(handler, changed, await signature(signed));

  assertEquals(response.status, 401);
  assertEquals(saved.length, 0);
});

Deno.test("rejects stale signatures before parsing or persistence", async () => {
  const { handler, saved } = setup();
  const raw = JSON.stringify(event());
  const response = await post(handler, raw, await signature(raw, Math.floor(now / 1000) - 301));

  assertEquals(response.status, 401);
  assertEquals(saved.length, 0);
});

Deno.test("rejects live-mode and wrong-account events even when correctly signed", async () => {
  const { handler, saved } = setup();
  for (const changes of [{ mode: "live" }, { accountId: "clacct_other_001" }]) {
    const raw = JSON.stringify({ ...event(), ...changes });
    const response = await post(handler, raw, await signature(raw));
    assertEquals(response.status, 403);
  }
  assertEquals(saved.length, 0);
});

Deno.test("treats a duplicate provider payout as acknowledged without overwriting it", async () => {
  const { handler, saved } = setup({ insert: false });
  const raw = JSON.stringify(event());
  const response = await post(handler, raw, await signature(raw));

  assertEquals(response.status, 200);
  assertEquals(await response.json(), { received: true, duplicate: true });
  assertEquals(saved.length, 1);
});

Deno.test("rejects invalid required minor-unit amounts without persistence", async () => {
  const { handler, saved } = setup();
  const raw = JSON.stringify(event({ payoutGross: "12.50" }));
  const response = await post(handler, raw, await signature(raw));

  assertEquals(response.status, 400);
  assertEquals(saved.length, 0);
});

Deno.test("disables payout intake outside the local test target", async () => {
  const { handler, saved } = setup({ enabled: false });
  const response = await post(handler, "{}", "");

  assertEquals(response.status, 503);
  assert(saved.length === 0, "disabled handler must not persist payouts");
});

Deno.test("local target guard accepts only local onvo_test configuration without live deployment markers", () => {
  const local = {
    SUPABASE_URL: "http://kong:8000",
    COACH_BILLING_MODE: "onvo_test",
  };
  assertEquals(isLocalOnvoTestTarget(local), true);
  assertEquals(isLocalOnvoTestTarget({ ...local, DENO_DEPLOYMENT_ID: "deployment" }), false);
  assertEquals(isLocalOnvoTestTarget({ ...local, ENVIRONMENT: "production" }), false);
  assertEquals(isLocalOnvoTestTarget({ ...local, COACH_BILLING_MODE: "simulator" }), false);
  assertEquals(isLocalOnvoTestTarget({ ...local, ONVO_SECRET_KEY: "onvo_live_secret" }), false);
  assertEquals(isLocalOnvoTestTarget({ ...local, SUPABASE_URL: "https://example.supabase.co" }), false);
});
