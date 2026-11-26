import {
  deepStrictEqual as assertEquals,
  ok as assert,
} from "node:assert/strict";
import { BonfireClientError, type BonfireReceipt } from "./client.ts";
import {
  approvedGrossMinor,
  type FiscalJob,
  processFiscalJob,
} from "./worker.ts";

const requestId = "450d9e30-2a05-479d-ac13-082000000001";
const clock = Date.parse("2026-11-25T15:00:00.000Z");
const rule = {
  accountId: "acct-test",
  priceId: "price-pro",
  grossMinor: 113_000,
  currency: "CRC" as const,
  paymentMethod: "02" as const,
};

const requestBody = JSON.stringify(
  {
    eventoId: "evt-paid",
    referenciaExterna: "invoice-2",
    codigoServicio: "pro-mensual",
    ocurridoEn: "2026-11-25T14:00:00.000Z",
    periodo: {
      inicio: "2026-11-25T14:00:00.000Z",
      fin: "2026-12-25T14:00:00.000Z",
    },
    receptor: {
      nombre: "Receptor de prueba",
      tipo: "01",
      numero: "101230456",
      actividad: "6201.0",
      correo: "facturas@example.com",
      ubicacion: {
        provincia: "1",
        canton: "01",
        distrito: "01",
        otrasSenas: "Dirección ficticia",
      },
    },
    pago: {
      proveedor: "onvo",
      cuenta: rule.accountId,
      referencia: "intent-2",
      montoMenor: rule.grossMinor,
      moneda: rule.currency,
      medioPago: rule.paymentMethod,
    },
  },
  null,
  2,
) + "\n";

const job: FiscalJob = {
  id: "d19f1af0-ecfd-4160-ad57-2f8428000001",
  lease_token: "7c4a8074-1415-4353-aca5-2f8428000001",
  state: "pending",
  attempt_count: 1,
  idempotency_key: "onvo-test-invoice-2",
  request_body: requestBody,
  invoice_id: "invoice-2",
  payment_intent_id: "intent-2",
  account_id: rule.accountId,
  subscription_id: "subscription-1",
  price_id: rule.priceId,
  payment_method: rule.paymentMethod,
  amount_minor: rule.grossMinor,
  currency: rule.currency,
  bonfire_request_id: null,
  estado_fiscal: null,
  clave: null,
  consecutivo: null,
  review_reason: null,
};

const persisted: BonfireReceipt = {
  id: requestId,
  referenciaExterna: job.invoice_id,
  codigoServicio: "pro-mensual",
  estado: "recibida",
  estadoFiscal: null,
  clave: null,
  consecutivo: null,
  montoMenor: rule.grossMinor,
  moneda: rule.currency,
};

type WorkerDependencies = Parameters<typeof processFiscalJob>[1];
type WorkerClient = WorkerDependencies["client"];

function dependencies(client: Partial<WorkerClient> = {}): WorkerDependencies {
  const unexpected = () =>
    Promise.reject(new Error("Unexpected Bonfire operation"));
  return {
    rule,
    client: {
      findByReference: () => Promise.resolve(null),
      getById: unexpected,
      submit: unexpected,
      ...client,
    },
    stillClaimed: () => Promise.resolve(true),
    now: () => clock,
  };
}

Deno.test("calculates approved gross minor units with the Bonfire rule", () => {
  assertEquals(approvedGrossMinor("1000"), 113_000);
  assertEquals(approvedGrossMinor("16.06195"), 1_815);
  assertEquals(approvedGrossMinor("1.50000"), 170);
  for (const invalid of ["0", "-1", "1e3", "1.012345", "NaN", ""]) {
    assertEquals(approvedGrossMinor(invalid), null, invalid);
  }
});

Deno.test("202 saves the request and schedules a status inquiry without marking accepted", async () => {
  const posts: Array<{ body: string; key: string }> = [];
  const result = await processFiscalJob(
    job,
    dependencies({
      submit(body, key) {
        posts.push({ body, key });
        return Promise.resolve(persisted);
      },
    }),
  );

  assertEquals(posts, [{ body: requestBody, key: job.idempotency_key }]);
  assert(result);
  assertEquals(result.state, "submitted");
  assertEquals(result.bonfireRequestId, requestId);
  assertEquals(result.estadoFiscal, null);
  assertEquals(result.clave, null);
  assertEquals(result.consecutivo, null);
  assert(result.nextAttemptAt && Date.parse(result.nextAttemptAt) > clock);
});

Deno.test("recovers a lost 202 by reference and replays the exact frozen request", async () => {
  const actions: string[] = [];
  const posts: Array<{ body: string; key: string }> = [];
  const deps = dependencies({
    findByReference(reference) {
      actions.push(`lookup:${reference}`);
      return Promise.resolve(posts.length === 0 ? null : persisted);
    },
    submit(body, key) {
      actions.push("post");
      posts.push({ body, key });
      if (posts.length === 1) {
        return Promise.reject(
          new BonfireClientError("bonfire_unavailable", null, true),
        );
      }
      return Promise.resolve(persisted);
    },
  });

  const timeout = await processFiscalJob(job, deps);
  assert(timeout);
  assertEquals(timeout.state, "pending");
  assertEquals(timeout.bonfireRequestId, null);
  assert(timeout.nextAttemptAt && Date.parse(timeout.nextAttemptAt) > clock);

  const recovered = await processFiscalJob({ ...job, attempt_count: 2 }, deps);
  assertEquals(actions, [
    `lookup:${job.invoice_id}`,
    "post",
    `lookup:${job.invoice_id}`,
    "post",
  ]);
  assertEquals(posts, [
    { body: requestBody, key: job.idempotency_key },
    { body: requestBody, key: job.idempotency_key },
  ]);
  assertEquals(recovered?.state, "submitted");
  assertEquals(recovered?.bonfireRequestId, requestId);
});

Deno.test("a lookup never masks a duplicate or conflicting 409 on replay", async () => {
  let lookup = false;
  const conflict = await processFiscalJob(
    { ...job, attempt_count: 2 },
    dependencies({
      findByReference(reference) {
        assertEquals(reference, job.invoice_id);
        lookup = true;
        return Promise.resolve(persisted);
      },
      submit(body, key) {
        assert(lookup);
        assertEquals(body, requestBody);
        assertEquals(key, job.idempotency_key);
        return Promise.reject(
          new BonfireClientError("bonfire_http_error", 409),
        );
      },
    }),
  );

  assert(lookup);
  assertEquals(conflict?.state, "review");
  assertEquals(conflict?.nextAttemptAt, null);
  assert(conflict?.reviewReason);
});

Deno.test("unprocessable fiscal data stays in review", async () => {
  const result = await processFiscalJob(
    job,
    dependencies({
      submit: () =>
        Promise.reject(new BonfireClientError("bonfire_http_error", 422)),
    }),
  );

  assertEquals(result?.state, "review");
  assertEquals(result?.nextAttemptAt, null);
  assert(result?.reviewReason);
});

Deno.test("polls the known request until it is accepted and records the fiscal identifiers", async () => {
  const queries: string[] = [];
  const clave = `506${"1".repeat(47)}`;
  const consecutivo = "00100001010000000001";
  const deps = dependencies({
    getById(id) {
      queries.push(id);
      return Promise.resolve(
        queries.length === 1
          ? {
            ...persisted,
            estado: "borrador",
            estadoFiscal: "procesando",
          }
          : {
            ...persisted,
            estado: "borrador",
            estadoFiscal: "aceptado",
            clave,
            consecutivo,
          },
      );
    },
  });
  const submitted: FiscalJob = {
    ...job,
    state: "submitted",
    bonfire_request_id: requestId,
  };

  const processing = await processFiscalJob(submitted, deps);
  assertEquals(processing?.state, "submitted");
  assertEquals(processing?.estadoFiscal, "procesando");
  assert(processing.nextAttemptAt);

  const accepted = await processFiscalJob({
    ...submitted,
    estado_fiscal: "procesando",
  }, deps);
  assertEquals(queries, [requestId, requestId]);
  assertEquals(accepted?.state, "accepted");
  assertEquals(accepted?.bonfireRequestId, requestId);
  assertEquals(accepted?.estadoFiscal, "aceptado");
  assertEquals(accepted?.clave, clave);
  assertEquals(accepted?.consecutivo, consecutivo);
  assertEquals(accepted?.nextAttemptAt, null);
});

Deno.test("holds unmatched sales for review without calling Bonfire", async () => {
  let called = false;
  const unexpected = () => {
    called = true;
    return Promise.reject(new Error("Sale should not be sent to Bonfire"));
  };
  for (
    const mismatch of [
      { amount_minor: 112_999 },
      { currency: "USD" },
      { price_id: "different-price" },
      { payment_method: "04" },
      { account_id: "different-account" },
      { request_body: null },
    ]
  ) {
    const result = await processFiscalJob(
      { ...job, ...mismatch },
      dependencies({
        submit: unexpected,
        findByReference: unexpected,
        getById: unexpected,
      }),
    );
    assertEquals(result?.state, "review", JSON.stringify(mismatch));
    assert(result?.reviewReason);
    assertEquals(result?.nextAttemptAt, null);
  }
  assertEquals(called, false);
});

Deno.test("an expired claim cannot start a POST", async () => {
  let called = false;
  const deps = dependencies({
    submit() {
      called = true;
      return Promise.resolve(persisted);
    },
  });
  const result = await processFiscalJob(job, {
    ...deps,
    stillClaimed(fiscalJob) {
      assertEquals(fiscalJob.id, job.id);
      assertEquals(fiscalJob.lease_token, job.lease_token);
      return Promise.resolve(false);
    },
  });
  assertEquals(result, null);
  assertEquals(called, false);
});
