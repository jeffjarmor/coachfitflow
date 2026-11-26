type BonfireClientConfig = {
  baseUrl: string;
  apiKey: string;
  secret: string;
  projectId: string;
};

const FISCAL_STATES = [
  "borrador",
  "preparando",
  "preparado",
  "incierto",
  "recibido",
  "procesando",
  "aceptado",
  "rechazado",
  "error",
] as const;

type BonfireFiscalState = typeof FISCAL_STATES[number];

export type BonfireReceipt = {
  id: string;
  referenciaExterna: string;
  codigoServicio: string;
  estado: "recibida" | "borrador";
  estadoFiscal: BonfireFiscalState | null;
  clave: string | null;
  consecutivo: string | null;
  montoMenor: number;
  moneda: "CRC" | "USD";
};

type BonfireClientErrorCode =
  | "bonfire_invalid_config"
  | "bonfire_connection_unverified"
  | "bonfire_wrong_environment"
  | "bonfire_wrong_project"
  | "bonfire_invalid_response"
  | "bonfire_http_error"
  | "bonfire_unavailable"
  | "bonfire_invalid_reference"
  | "bonfire_invalid_idempotency_key";

export class BonfireClientError extends Error {
  constructor(
    readonly code: BonfireClientErrorCode,
    readonly status: number | null = null,
    readonly retryable = false,
  ) {
    super(code);
    this.name = "BonfireClientError";
  }
}

const API_PATH = "/api/v1/integraciones";
const REQUEST_TIMEOUT_MS = 10_000;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SERVICE_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function originFor(config: BonfireClientConfig): string {
  let base: URL;
  try {
    base = new URL(config.baseUrl);
  } catch {
    throw new BonfireClientError("bonfire_invalid_config");
  }
  const localHttp = base.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (
    (!localHttp && base.protocol !== "https:") ||
    base.username || base.password || base.pathname !== "/" || base.search ||
    base.hash || !config.apiKey.startsWith("bfk_") ||
    !UUID_V4.test(config.apiKey.slice(4)) ||
    !/^bfs_[A-Za-z0-9_-]{43}$/.test(config.secret) ||
    !UUID_V4.test(config.projectId)
  ) {
    throw new BonfireClientError("bonfire_invalid_config");
  }
  return base.origin;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validFiscalState(value: unknown): value is BonfireFiscalState | null {
  return value === null || FISCAL_STATES.some((state) => state === value);
}

function invalidResponse(status: number): BonfireClientError {
  return new BonfireClientError("bonfire_invalid_response", status, true);
}

async function receiptFrom(response: Response): Promise<BonfireReceipt> {
  const value = asObject(await response.json().catch(() => null));
  if (
    !value || typeof value.id !== "string" || !UUID_V4.test(value.id) ||
    typeof value.referenciaExterna !== "string" ||
    !REFERENCE.test(value.referenciaExterna) ||
    typeof value.codigoServicio !== "string" ||
    !SERVICE_CODE.test(value.codigoServicio) ||
    (value.estado !== "recibida" && value.estado !== "borrador") ||
    !validFiscalState(value.estadoFiscal) ||
    (value.clave !== null &&
      (typeof value.clave !== "string" || !/^506\d{47}$/.test(value.clave))) ||
    (value.consecutivo !== null &&
      (typeof value.consecutivo !== "string" ||
        !/^\d{20}$/.test(value.consecutivo))) ||
    (value.estadoFiscal === "aceptado" &&
      (value.clave === null || value.consecutivo === null)) ||
    typeof value.montoMenor !== "number" ||
    !Number.isSafeInteger(value.montoMenor) || value.montoMenor < 1 ||
    (value.moneda !== "CRC" && value.moneda !== "USD")
  ) {
    throw invalidResponse(response.status);
  }
  return {
    id: value.id,
    referenciaExterna: value.referenciaExterna,
    codigoServicio: value.codigoServicio,
    estado: value.estado,
    estadoFiscal: value.estadoFiscal,
    clave: value.clave,
    consecutivo: value.consecutivo,
    montoMenor: value.montoMenor,
    moneda: value.moneda,
  };
}

export function createBonfireClient(
  config: BonfireClientConfig,
  fetcher: typeof fetch = fetch,
) {
  const origin = originFor(config);
  const headers = {
    accept: "application/json",
    "x-bonfire-key": config.apiKey,
    authorization: `Bearer ${config.secret}`,
  };
  let verified = false;

  function requireVerification() {
    if (!verified) {
      throw new BonfireClientError("bonfire_connection_unverified");
    }
  }

  async function request(
    url: URL,
    expectedStatus: number,
    options: RequestInit,
    signal?: AbortSignal,
    allowMissing = false,
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetcher(url, {
        ...options,
        headers: { ...headers, ...options.headers },
        redirect: "error",
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new BonfireClientError("bonfire_unavailable", null, true);
    }
    if (
      response.redirected || (response.status >= 300 && response.status < 400)
    ) {
      throw new BonfireClientError("bonfire_http_error", response.status);
    }
    if (
      response.status === expectedStatus ||
      (allowMissing && response.status === 404)
    ) {
      return response;
    }
    if (response.ok) throw invalidResponse(response.status);
    const retryable = [408, 425, 429].includes(response.status) ||
      response.status >= 500;
    throw new BonfireClientError(
      "bonfire_http_error",
      response.status,
      retryable,
    );
  }

  return {
    async verifyConnection(
      signal?: AbortSignal,
    ): Promise<{ proyectoId: string; ambiente: "stag" }> {
      verified = false;
      const response = await request(
        new URL(`${API_PATH}/conexion`, origin),
        200,
        { method: "GET" },
        signal,
      );
      const data = asObject(await response.json().catch(() => null));
      if (
        !data || typeof data.proyectoId !== "string" ||
        !UUID_V4.test(data.proyectoId) || typeof data.ambiente !== "string"
      ) {
        throw invalidResponse(response.status);
      }
      if (data.ambiente !== "stag") {
        throw new BonfireClientError(
          "bonfire_wrong_environment",
          response.status,
        );
      }
      if (data.proyectoId !== config.projectId) {
        throw new BonfireClientError("bonfire_wrong_project", response.status);
      }
      verified = true;
      return { proyectoId: data.proyectoId, ambiente: "stag" };
    },
    async findByReference(
      reference: string,
      signal?: AbortSignal,
    ): Promise<BonfireReceipt | null> {
      requireVerification();
      if (!REFERENCE.test(reference)) {
        throw new BonfireClientError("bonfire_invalid_reference");
      }
      const url = new URL(`${API_PATH}/solicitudes`, origin);
      url.searchParams.set("referenciaExterna", reference);
      const response = await request(url, 200, { method: "GET" }, signal, true);
      if (response.status === 404) return null;
      const receipt = await receiptFrom(response);
      if (receipt.referenciaExterna !== reference) {
        throw invalidResponse(response.status);
      }
      return receipt;
    },
    async getById(
      id: string,
      signal?: AbortSignal,
    ): Promise<BonfireReceipt | null> {
      requireVerification();
      if (!UUID_V4.test(id)) {
        throw new BonfireClientError("bonfire_invalid_reference");
      }
      const response = await request(
        new URL(`${API_PATH}/solicitudes/${id}`, origin),
        200,
        { method: "GET" },
        signal,
        true,
      );
      if (response.status === 404) return null;
      const receipt = await receiptFrom(response);
      if (receipt.id !== id) throw invalidResponse(response.status);
      return receipt;
    },
    async submit(
      body: string,
      idempotencyKey: string,
      signal?: AbortSignal,
    ): Promise<BonfireReceipt> {
      requireVerification();
      if (!REFERENCE.test(idempotencyKey)) {
        throw new BonfireClientError("bonfire_invalid_idempotency_key");
      }
      const response = await request(
        new URL(`${API_PATH}/solicitudes`, origin),
        202,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body,
        },
        signal,
      );
      return await receiptFrom(response);
    },
  };
}
