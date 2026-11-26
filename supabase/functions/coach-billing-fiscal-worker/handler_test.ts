import { deepStrictEqual as equal } from "node:assert/strict";
import { createFiscalWorkerHandler } from "./handler.ts";

const projectId = "08000000-0000-4000-8000-000000001131";
const workerToken = "fiscal_test_worker_token_0123456789";
const config = {
  COACH_BILLING_MODE: "onvo_test",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-fixture",
  ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID: "onvo-test-account",
  BONFIRE_FACTURA_ENABLED: "true",
  BONFIRE_FACTURA_WORKER_ENABLED: "true",
  BONFIRE_FACTURA_WORKER_TOKEN: workerToken,
  BONFIRE_FACTURA_STAG_URL: "https://bonfire.example.com",
  BONFIRE_FACTURA_STAG_PROJECT_ID: projectId,
  BONFIRE_FACTURA_STAG_KEY: `bfk_${projectId}`,
  BONFIRE_FACTURA_STAG_SECRET: `bfs_${"a".repeat(43)}`,
  BONFIRE_FACTURA_PRO_ONVO_PRICE_ID: "price-pro",
  BONFIRE_FACTURA_PRO_CABYS: "5123456789012",
  BONFIRE_FACTURA_PRO_NET_PRICE: "1000",
  BONFIRE_FACTURA_PRO_CURRENCY: "CRC",
  BONFIRE_FACTURA_PRO_PAYMENT_METHOD: "02",
};

function request(token = workerToken) {
  return new Request(
    "http://localhost/functions/v1/coach-billing-fiscal-worker",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );
}

const failOnNetwork = () => {
  throw new Error("Fiscal worker must not access the network");
};

Deno.test("the fiscal endpoint requires the dedicated worker token", async () => {
  const worker = createFiscalWorkerHandler(config, failOnNetwork);
  const response = await worker(request("é" + workerToken.slice(1)));
  equal(response.status, 401);
  equal(await response.json(), { error: "unauthorized" });
});

Deno.test("the fiscal worker is disabled for live billing and production Supabase", async () => {
  for (
    const override of [
      { COACH_BILLING_MODE: "onvo_live" },
      { SUPABASE_URL: "https://bzhqprxolseyxuuwodqs.supabase.co" },
      { BONFIRE_FACTURA_WORKER_ENABLED: "false" },
    ]
  ) {
    const response = await createFiscalWorkerHandler(
      { ...config, ...override },
      failOnNetwork,
    )(request());
    equal(response.status, 503);
    equal(await response.json(), { error: "fiscal_worker_disabled" });
  }
});

Deno.test("the inactive integration rejects requests before network access even with the worker switch on", async () => {
  const { BONFIRE_FACTURA_ENABLED: _, ...withoutMasterSwitch } = config;
  for (
    const settings of [withoutMasterSwitch, {
      ...config,
      BONFIRE_FACTURA_ENABLED: "false",
    }]
  ) {
    const response = await createFiscalWorkerHandler(settings, failOnNetwork)(
      request(),
    );
    equal(response.status, 503);
    equal(await response.json(), { error: "fiscal_worker_disabled" });
  }
});

Deno.test("an unexpected Bonfire project or environment never leases a fiscal job", async () => {
  for (
    const connection of [
      { proyectoId: projectId, ambiente: "simulador" },
      { proyectoId: "08000000-0000-4000-8000-000000001132", ambiente: "stag" },
    ]
  ) {
    const calls: string[] = [];
    const response = await createFiscalWorkerHandler(config, (input) => {
      calls.push(String(input));
      return Promise.resolve(Response.json(connection));
    })(request());
    equal(response.status, 503);
    equal(calls, ["https://bonfire.example.com/api/v1/integraciones/conexion"]);
  }
});
