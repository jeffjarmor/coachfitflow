import { timingSafeEqual } from "node:crypto";
import {
  BonfireClientError,
  createBonfireClient,
} from "../_shared/bonfire-fiscal/client.ts";
import {
  approvedGrossMinor,
  type ApprovedProRule,
  type FiscalJob,
  processFiscalJob,
} from "../_shared/bonfire-fiscal/worker.ts";
import { targetsProduction } from "../_shared/coach-billing/runtime.ts";

const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;
const providerId = /^[A-Za-z0-9_-]{1,200}$/;
const encoder = new TextEncoder();

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function storageOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const local = [
      "localhost",
      "127.0.0.1",
      "[::1]",
      "kong",
      "supabase_kong",
      "host.docker.internal",
    ].includes(url.hostname);
    if (
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" &&
      (url.protocol === "https:" || (local && url.protocol === "http:"))
    ) return url.origin;
  } catch {
    // A malformed origin cannot receive database credentials.
  }
  return null;
}

function loadRule(env: Record<string, string>): ApprovedProRule | null {
  const accountId = env.ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID ?? "";
  const priceId = env.BONFIRE_FACTURA_PRO_ONVO_PRICE_ID ?? "";
  const cabys = env.BONFIRE_FACTURA_PRO_CABYS ?? "";
  const grossMinor = approvedGrossMinor(
    env.BONFIRE_FACTURA_PRO_NET_PRICE ?? "",
  );
  const currency = env.BONFIRE_FACTURA_PRO_CURRENCY;
  if (
    !providerId.test(accountId) || !providerId.test(priceId) ||
    !/^[5-9]\d{12}$/.test(cabys) || !grossMinor ||
    (currency !== "USD" && currency !== "CRC") ||
    env.BONFIRE_FACTURA_PRO_PAYMENT_METHOD !== "02"
  ) return null;
  return { accountId, priceId, grossMinor, currency, paymentMethod: "02" };
}

export function createFiscalWorkerHandler(
  env: Record<string, string>,
  fetcher: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }
    if (
      env.BONFIRE_FACTURA_ENABLED !== "true" ||
      env.BONFIRE_FACTURA_WORKER_ENABLED !== "true"
    ) {
      return json(503, { error: "fiscal_worker_disabled" });
    }
    const token = env.BONFIRE_FACTURA_WORKER_TOKEN ?? "";
    const supabaseUrl = storageOrigin(env.SUPABASE_URL ?? "");
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY;
    const rule = loadRule(env);
    if (
      env.COACH_BILLING_MODE !== "onvo_test" || !tokenPattern.test(token) ||
      !supabaseUrl || !serviceKey || !rule ||
      targetsProduction(env, supabaseUrl, [])
    ) return json(503, { error: "fiscal_worker_disabled" });

    const supplied = encoder.encode(request.headers.get("authorization") ?? "");
    const expected = encoder.encode(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return json(401, { error: "unauthorized" });
    }

    async function storage(
      path: string,
      signal: AbortSignal | undefined,
      body?: unknown,
    ): Promise<unknown> {
      const response = await fetcher(`${supabaseUrl}/rest/v1/${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: signal ?? AbortSignal.timeout(7_000),
        headers: {
          apikey: serviceKey!,
          authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error("fiscal_storage_unavailable");
      return await response.json();
    }

    try {
      const client = createBonfireClient({
        baseUrl: env.BONFIRE_FACTURA_STAG_URL ?? "",
        apiKey: env.BONFIRE_FACTURA_STAG_KEY ?? "",
        secret: env.BONFIRE_FACTURA_STAG_SECRET ?? "",
        projectId: env.BONFIRE_FACTURA_STAG_PROJECT_ID ?? "",
      }, fetcher);
      await client.verifyConnection(AbortSignal.timeout(7_000));
      const jobs = await storage(
        "rpc/claim_coach_billing_fiscal_jobs",
        undefined,
        { p_limit: 4 },
      );
      if (!Array.isArray(jobs)) {
        throw new Error("fiscal_storage_invalid_response");
      }
      const completed = await Promise.allSettled(
        (jobs as FiscalJob[]).map(async (job) => {
          const result = await processFiscalJob(job, {
            client,
            rule,
            stillClaimed: async (claimed, signal) => {
              const query = new URLSearchParams({
                id: `eq.${claimed.id}`,
                lease_token: `eq.${claimed.lease_token}`,
                state: "eq.pending",
                lease_expires_at: `gt.${new Date().toISOString()}`,
                select: "id",
                limit: "1",
              });
              const rows = await storage(
                `coach_billing_fiscal_jobs?${query}`,
                signal,
              );
              if (!Array.isArray(rows)) {
                throw new Error("fiscal_storage_invalid_response");
              }
              return rows.length === 1;
            },
          }, AbortSignal.timeout(24_000));
          if (!result) return "skipped";
          const saved = await storage(
            "rpc/finish_coach_billing_fiscal_job",
            undefined,
            {
              p_job_id: job.id,
              p_lease_token: job.lease_token,
              p_state: result.state,
              p_next_attempt_at: result.nextAttemptAt,
              p_bonfire_request_id: result.bonfireRequestId,
              p_estado_fiscal: result.estadoFiscal,
              p_clave: result.clave,
              p_consecutivo: result.consecutivo,
              p_review_reason: result.reviewReason,
            },
          );
          if (typeof saved !== "boolean") {
            throw new Error("fiscal_storage_invalid_response");
          }
          return saved ? result.state : "skipped";
        }),
      );
      const counts = {
        pending: 0,
        submitted: 0,
        accepted: 0,
        review: 0,
        skipped: 0,
        failed: 0,
      };
      for (const result of completed) {
        counts[result.status === "fulfilled" ? result.value : "failed"]++;
      }
      return json(counts.failed ? 503 : 200, counts);
    } catch (error) {
      return json(503, {
        error: error instanceof BonfireClientError
          ? error.code
          : "fiscal_worker_unavailable",
      });
    }
  };
}
