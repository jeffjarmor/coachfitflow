import assert from "node:assert/strict";
import { BonfireClientError, createBonfireClient } from "./client.ts";

const projectId = "34be09f7-6295-4787-9d60-85a0b2c81d85";
const receiptId = "c45aa49b-fcd4-44dc-ac35-3b1cf28c48fd";
const config = {
  baseUrl: "https://billing.example.invalid/",
  apiKey: "bfk_f637d539-4460-44c5-8081-e6834d593908",
  secret: `bfs_${"x".repeat(43)}`,
  projectId,
};
const received = {
  id: receiptId,
  referenciaExterna: "onvo/invoice-1",
  codigoServicio: "pro-mensual",
  estado: "recibida",
  estadoFiscal: null,
  clave: null,
  consecutivo: null,
  montoMenor: 113000,
  moneda: "CRC",
} as const;

function connection(ambiente = "stag", proyectoId = projectId): Response {
  return Response.json({ proyectoId, ambiente });
}

function errorIs(code: string, status: number | null, retryable: boolean) {
  return (error: unknown) => {
    assert.ok(error instanceof BonfireClientError);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    assert.equal(error.retryable, retryable);
    assert.equal(error.message, code);
    return true;
  };
}

function mockFetch(...responses: Response[]) {
  const calls: { url: URL; options: RequestInit }[] = [];
  const fetcher: typeof fetch = (url, options = {}) => {
    calls.push({ url: new URL(String(url)), options });
    const response = responses.shift();
    assert.ok(response, "Unexpected HTTP request");
    return Promise.resolve(response);
  };
  return { calls, fetcher };
}

Deno.test("Bonfire uses the versioned STAG routes and sends frozen JSON without reserialization", async () => {
  const accepted = {
    ...received,
    estado: "borrador",
    estadoFiscal: "aceptado",
    clave: `506${"1".repeat(47)}`,
    consecutivo: "00100001010000000001",
  } as const;
  const outbound = mockFetch(
    connection(),
    Response.json({
      ...received,
      borradorId: null,
      recibidoEn: "2026-11-25T14:00:00Z",
    }, { status: 202 }),
    Response.json(received, { status: 202 }),
    Response.json(received),
    Response.json(accepted),
  );
  const client = createBonfireClient(config, outbound.fetcher);
  const body =
    '{"referenciaExterna":"onvo/invoice-1", "pago":{"montoMenor":113000}}';
  const key = "fiscal/onvo/invoice-1";
  assert.deepEqual(await client.verifyConnection(), {
    proyectoId: projectId,
    ambiente: "stag",
  });
  assert.deepEqual(await client.submit(body, key), received);
  assert.deepEqual(await client.submit(body, key), received);
  assert.deepEqual(
    await client.findByReference(received.referenciaExterna),
    received,
  );
  assert.deepEqual(await client.getById(receiptId), accepted);

  assert.deepEqual(
    outbound.calls.map(({ url, options }) => [options.method, url.pathname]),
    [
      ["GET", "/api/v1/integraciones/conexion"],
      ["POST", "/api/v1/integraciones/solicitudes"],
      ["POST", "/api/v1/integraciones/solicitudes"],
      ["GET", "/api/v1/integraciones/solicitudes"],
      ["GET", `/api/v1/integraciones/solicitudes/${receiptId}`],
    ],
  );
  for (const { url, options } of outbound.calls) {
    assert.equal(url.origin, "https://billing.example.invalid");
    assert.equal(options.redirect, "error");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("x-bonfire-key"), config.apiKey);
    assert.equal(headers.get("authorization"), `Bearer ${config.secret}`);
    if (options.method === "POST") {
      assert.equal(headers.get("content-type"), "application/json");
      assert.equal(headers.get("idempotency-key"), key);
      assert.equal(options.body, body);
    } else {
      assert.equal(headers.has("idempotency-key"), false);
    }
  }
  assert.equal(
    outbound.calls[3].url.search,
    "?referenciaExterna=onvo%2Finvoice-1",
  );
});

Deno.test("Bonfire refuses an unverified, simulator, or unrelated project connection", async () => {
  const outbound = mockFetch(
    connection("simulador"),
    connection("stag", receiptId),
  );
  const client = createBonfireClient(config, outbound.fetcher);
  const unverified = errorIs("bonfire_connection_unverified", null, false);
  await assert.rejects(client.submit("{}", "valid-key"), unverified);
  await assert.rejects(
    client.verifyConnection(),
    errorIs("bonfire_wrong_environment", 200, false),
  );
  await assert.rejects(client.findByReference("invoice-1"), unverified);
  await assert.rejects(
    client.verifyConnection(),
    errorIs("bonfire_wrong_project", 200, false),
  );
  await assert.rejects(client.getById(receiptId), unverified);
  assert.ok(
    outbound.calls.every(({ url }) =>
      url.pathname === "/api/v1/integraciones/conexion"
    ),
  );
});

Deno.test("Bonfire validates origins, credentials, and references before sending", async () => {
  const outbound = mockFetch(connection());
  const invalidConfig = errorIs("bonfire_invalid_config", null, false);
  for (
    const baseUrl of [
      "http://billing.example.invalid",
      "https://name:secret@billing.example.invalid",
      "https://billing.example.invalid/wrong-prefix",
      "https://billing.example.invalid/?wrong=1",
      "https://billing.example.invalid/#section",
      "file:///tmp/invoice",
    ]
  ) {
    assert.throws(
      () => createBonfireClient({ ...config, baseUrl }, outbound.fetcher),
      invalidConfig,
    );
  }
  assert.throws(
    () => createBonfireClient({ ...config, apiKey: "wrong" }, outbound.fetcher),
    invalidConfig,
  );
  assert.throws(
    () => createBonfireClient({ ...config, secret: "wrong" }, outbound.fetcher),
    invalidConfig,
  );
  assert.throws(
    () =>
      createBonfireClient({ ...config, projectId: "wrong" }, outbound.fetcher),
    invalidConfig,
  );
  const client = createBonfireClient({
    ...config,
    baseUrl: "http://127.0.0.1:3000",
  }, outbound.fetcher);
  await client.verifyConnection();
  await assert.rejects(
    client.getById("../invoice"),
    errorIs("bonfire_invalid_reference", null, false),
  );
  await assert.rejects(
    client.findByReference("invoice&wrong=1"),
    errorIs("bonfire_invalid_reference", null, false),
  );
  await assert.rejects(
    client.submit("{}", "key\nvalue"),
    errorIs("bonfire_invalid_idempotency_key", null, false),
  );
  assert.equal(outbound.calls.length, 1);
  assert.equal(outbound.calls[0].url.origin, "http://127.0.0.1:3000");
});

Deno.test("Bonfire maps a missing lookup to null and rejects mismatched receipt identities", async () => {
  const outbound = mockFetch(
    connection(),
    new Response(null, { status: 404 }),
    new Response(null, { status: 404 }),
    Response.json({ ...received, referenciaExterna: "another-invoice" }),
    Response.json({ ...received, id: projectId }),
  );
  const client = createBonfireClient(config, outbound.fetcher);
  await client.verifyConnection();
  assert.equal(await client.findByReference(received.referenciaExterna), null);
  assert.equal(await client.getById(receiptId), null);
  await assert.rejects(
    client.findByReference(received.referenciaExterna),
    errorIs("bonfire_invalid_response", 200, true),
  );
  await assert.rejects(
    client.getById(receiptId),
    errorIs("bonfire_invalid_response", 200, true),
  );
});

Deno.test("Bonfire validates 202 acknowledgments and reports sanitized HTTP errors", async () => {
  const outbound = mockFetch(
    connection(),
    Response.json(received),
    Response.json({ ...received, montoMenor: "113000" }, { status: 202 }),
    Response.json({ ...received, estadoFiscal: "aceptado" }, { status: 202 }),
    Response.json({ message: config.secret }, { status: 409 }),
    Response.json({ message: "private tax profile input" }, { status: 422 }),
    new Response(null, { status: 429 }),
    new Response(null, { status: 503 }),
    Response.redirect("https://unrelated.example.invalid", 307),
  );
  const client = createBonfireClient(config, outbound.fetcher);
  await client.verifyConnection();
  for (
    const [code, status, retryable] of [
      ["bonfire_invalid_response", 200, true],
      ["bonfire_invalid_response", 202, true],
      ["bonfire_invalid_response", 202, true],
      ["bonfire_http_error", 409, false],
      ["bonfire_http_error", 422, false],
      ["bonfire_http_error", 429, true],
      ["bonfire_http_error", 503, true],
      ["bonfire_http_error", 307, false],
    ] as const
  ) {
    await assert.rejects(
      client.submit("{}", "stable-key"),
      errorIs(code, status, retryable),
    );
  }
});

Deno.test("Bonfire forwards caller cancellation and represents timeouts as incomplete requests", async () => {
  const fetcher: typeof fetch = (url, options) => {
    if (String(url).endsWith("/conexion")) return Promise.resolve(connection());
    assert.equal(options?.signal?.aborted, true);
    return Promise.reject(
      new Error(`private transport detail ${config.secret}`),
    );
  };
  const client = createBonfireClient(config, fetcher);
  await client.verifyConnection();
  await assert.rejects(
    client.submit("{}", "stable-key", AbortSignal.abort()),
    errorIs("bonfire_unavailable", null, true),
  );
});
