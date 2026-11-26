import { deepStrictEqual, strictEqual } from "node:assert";
import { createHmac } from "node:crypto";
import { createOnvoFiscalWebhook, type FiscalPayment } from "./handler.ts";

const signingSecret = "whsec_local_test";
const accountId = "clacct_local_test";
const confirmedAt = "2026-11-19T15:00:00.000Z";
const now = Date.parse(confirmedAt);
const timestamp = Math.floor(now / 1000);
const firstPayment = {
  object: "payment_intent",
  id: "clpiment_first",
  amount: 500000,
  currency: "CRC",
  status: "succeeded",
};

function event(
  type = "payment_intent.succeeded",
  object: object = firstPayment,
) {
  return {
    object: "event",
    id: "evt_local_test",
    accountId,
    mode: "test",
    createdAt: confirmedAt,
    type,
    data: { object },
  };
}

function sign(body: string, sentAt = timestamp, secret = signingSecret) {
  const signature = createHmac("sha256", secret).update(`${sentAt}.${body}`)
    .digest("hex");
  return `t=${sentAt},v1=${signature}`;
}

function request(value: object, signature?: (body: string) => string) {
  const body = JSON.stringify(value);
  return new Request("https://localhost/onvo-fiscal-webhook", {
    method: "POST",
    headers: { "x-onvo-signature": (signature ?? sign)(body) },
    body,
  });
}

function webhook(recordPayment: (payment: FiscalPayment) => Promise<boolean>) {
  return createOnvoFiscalWebhook({
    accountId,
    mode: "test",
    signingSecret,
    recordPayment,
    now: () => now,
  });
}

Deno.test("saves a first payment and deduplicates overlapping renewal events by payment identity", async () => {
  const recorded = new Map<string, FiscalPayment>();
  const handle = webhook((payment) => {
    if (recorded.has(payment.paymentIntentId)) return Promise.resolve(false);
    recorded.set(payment.paymentIntentId, payment);
    return Promise.resolve(true);
  });

  const initialResponse = await handle(request(event()));
  strictEqual(initialResponse.status, 200);
  deepStrictEqual(await initialResponse.json(), {
    recorded: true,
    duplicate: false,
  });
  deepStrictEqual(recorded.get("clpiment_first"), {
    mode: "test",
    accountId,
    paymentIntentId: "clpiment_first",
    sourceEventId: "evt_local_test",
    amountMinor: 500000,
    currency: "CRC",
    confirmedAt,
  });

  const renewal = event("subscription_renewal.succeeded", {
    object: "subscription_renewal",
    paymentIntentId: "clpiment_renewal",
    currency: "CRC",
    total: 500000,
    invoiceStatus: "paid",
  });
  const renewalResponse = await handle(
    request({ ...renewal, id: "evt_renewal" }),
  );
  deepStrictEqual(await renewalResponse.json(), {
    recorded: true,
    duplicate: false,
  });
  const duplicate = await handle(request({
    ...event("payment_intent.succeeded", {
      ...firstPayment,
      id: "clpiment_renewal",
      receivedAmount: 500000,
    }),
    id: "evt_matching_intent",
  }));
  deepStrictEqual(await duplicate.json(), { recorded: true, duplicate: true });
  strictEqual(recorded.size, 2);
});

Deno.test("rejects tampered, stale, or out-of-scope events before saving", async () => {
  const handle = webhook(() => Promise.reject(new Error("Unexpected write")));
  strictEqual(
    (await handle(request(event(), (body) => sign(`${body} `)))).status,
    401,
  );
  strictEqual(
    (await handle(request(event(), (body) => sign(body, timestamp - 301))))
      .status,
    401,
  );
  strictEqual(
    (await handle(request({ ...event(), mode: "live" }))).status,
    403,
  );
  strictEqual(
    (await handle(request({ ...event(), accountId: "clacct_other" }))).status,
    403,
  );
});

Deno.test("ignores failed, pending and free payments and requires the captured amount for manual captures", async () => {
  const handle = webhook(() => Promise.reject(new Error("Unexpected write")));
  for (
    const type of [
      "payment_intent.failed",
      "payment_intent.processing",
      "webhook_endpoint.test",
    ]
  ) {
    deepStrictEqual(await (await handle(request(event(type)))).json(), {
      ignored: true,
    });
  }
  const freePeriod = event("subscription_renewal.succeeded", {
    object: "subscription_renewal",
    currency: "CRC",
    total: 0,
    invoiceStatus: "paid",
  });
  deepStrictEqual(await (await handle(request(freePeriod))).json(), {
    ignored: true,
  });
  const manual = event("payment_intent.succeeded", {
    ...firstPayment,
    captureMethod: "manual",
  });
  strictEqual((await handle(request(manual))).status, 400);
});

Deno.test("returns a retryable status if storage failed", async () => {
  const handle = webhook(() =>
    Promise.reject(new Error("Storage unavailable"))
  );
  const response = await handle(request(event()));
  strictEqual(response.status, 503);
  deepStrictEqual(await response.json(), { error: "payment_recording_failed" });
});
