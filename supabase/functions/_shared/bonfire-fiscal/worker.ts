import {
  BonfireClientError,
  type BonfireReceipt,
  type createBonfireClient,
} from "./client.ts";

const SERVICE_CODE = "pro-mensual";
const POLL_INTERVAL_MS = 60_000;

export type FiscalJob = {
  id: string;
  lease_token: string;
  state: "pending" | "submitted";
  attempt_count: number;
  idempotency_key: string;
  request_body: string | null;
  invoice_id: string;
  payment_intent_id: string;
  account_id: string;
  subscription_id: string;
  price_id: string | null;
  payment_method: string | null;
  amount_minor: number;
  currency: string;
  bonfire_request_id: string | null;
  estado_fiscal: string | null;
  clave: string | null;
  consecutivo: string | null;
  review_reason: string | null;
};

export type ApprovedProRule = {
  accountId: string;
  priceId: string;
  grossMinor: number;
  currency: "CRC" | "USD";
  paymentMethod: "02";
};

export type FiscalJobOutcome = {
  state: "pending" | "submitted" | "accepted" | "review";
  nextAttemptAt: string | null;
  bonfireRequestId: string | null;
  estadoFiscal: string | null;
  clave: string | null;
  consecutivo: string | null;
  reviewReason: string | null;
};

type Dependencies = {
  client: Pick<
    ReturnType<typeof createBonfireClient>,
    "findByReference" | "getById" | "submit"
  >;
  rule: ApprovedProRule;
  stillClaimed(job: FiscalJob, signal?: AbortSignal): Promise<boolean>;
  now?: () => number;
};

export function approvedGrossMinor(net: string): number | null {
  if (!/^\d{1,13}(?:\.\d{1,5})?$/.test(net)) return null;
  const [whole, fraction = ""] = net.split(".");
  const subtotal = BigInt(whole + fraction.padEnd(5, "0"));
  // Bonfire first rounds 13% VAT to five decimal places, then the gross to minor units.
  const total = subtotal + (subtotal * 13n + 50n) / 100n;
  const minor = (total + 500n) / 1000n;
  return minor > 0n && total <= 999_999_999_999_999_999n ? Number(minor) : null;
}

function parseFrozenPayment(body: string, job: FiscalJob): boolean {
  try {
    const payload = JSON.parse(body);
    return payload?.referenciaExterna === job.invoice_id &&
      payload.codigoServicio === SERVICE_CODE &&
      payload.receptor && payload.pago?.proveedor === "onvo" &&
      payload.pago.cuenta === job.account_id &&
      payload.pago.referencia === job.payment_intent_id &&
      payload.pago.montoMenor === job.amount_minor &&
      payload.pago.moneda === job.currency &&
      payload.pago.medioPago === job.payment_method;
  } catch {
    return false;
  }
}

function receiptMatches(receipt: BonfireReceipt, job: FiscalJob): boolean {
  return receipt.referenciaExterna === job.invoice_id &&
    receipt.codigoServicio === SERVICE_CODE &&
    receipt.montoMenor === job.amount_minor &&
    receipt.moneda === job.currency &&
    (!job.bonfire_request_id || job.bonfire_request_id === receipt.id);
}

export async function processFiscalJob(
  job: FiscalJob,
  deps: Dependencies,
  signal?: AbortSignal,
): Promise<FiscalJobOutcome | null> {
  const { client, rule } = deps;
  const now = deps.now ?? Date.now;
  const outcome = (
    state: FiscalJobOutcome["state"],
    nextAttemptAt: string | null,
    reviewReason: string | null,
    receipt?: BonfireReceipt,
  ): FiscalJobOutcome => ({
    state,
    nextAttemptAt,
    reviewReason,
    bonfireRequestId: receipt?.id ?? job.bonfire_request_id,
    estadoFiscal: receipt?.estadoFiscal ?? job.estado_fiscal,
    clave: receipt?.clave ?? job.clave,
    consecutivo: receipt?.consecutivo ?? job.consecutivo,
  });
  const review = (reason: string, receipt?: BonfireReceipt) =>
    outcome("review", null, reason, receipt);
  const retry = () => {
    const delay = Math.min(
      900_000,
      15_000 * 2 ** Math.min(Math.max(job.attempt_count - 1, 0), 6),
    );
    return outcome(job.state, new Date(now() + delay).toISOString(), null);
  };

  if (job.account_id !== rule.accountId) return review("onvo_account_mismatch");
  if (job.state === "pending") {
    if (job.price_id !== rule.priceId) return review("onvo_price_mismatch");
    if (job.amount_minor !== rule.grossMinor) {
      return review("fiscal_amount_mismatch");
    }
    if (job.currency !== rule.currency) {
      return review("fiscal_currency_mismatch");
    }
    if (job.payment_method !== rule.paymentMethod) {
      return review("fiscal_payment_method_mismatch");
    }
    if (!job.request_body || !parseFrozenPayment(job.request_body, job)) {
      return review("invalid_frozen_request");
    }
  }

  let receipt: BonfireReceipt | null;
  try {
    if (job.state === "submitted") {
      if (!job.bonfire_request_id) return review("missing_bonfire_request_id");
      receipt = await client.getById(job.bonfire_request_id, signal) ??
        await client.findByReference(job.invoice_id, signal);
      if (!receipt) return retry();
    } else {
      const found = await client.findByReference(job.invoice_id, signal);
      if (found && !receiptMatches(found, job)) {
        return review("bonfire_reference_conflict");
      }
      if (!await deps.stillClaimed(job, signal)) return null;
      // Lookup is insufficient to confirm the payment identity; Bonfire checks the full frozen payload on POST.
      receipt = await client.submit(
        job.request_body!,
        job.idempotency_key,
        signal,
      );
      if (found && found.id !== receipt.id) {
        return review("bonfire_reference_conflict");
      }
    }
  } catch (error) {
    if (error instanceof BonfireClientError) {
      if (error.status === 409) return review("bonfire_reference_conflict");
      if (error.status === 422) return review("bonfire_invalid_submission");
      if (!error.retryable && error.status !== 401 && error.status !== 403) {
        return review("bonfire_request_rejected");
      }
    }
    return retry();
  }

  if (!receiptMatches(receipt, job)) return review("bonfire_receipt_mismatch");
  if (receipt.estadoFiscal === "aceptado") {
    return receipt.clave && receipt.consecutivo
      ? outcome("accepted", null, null, receipt)
      : review("bonfire_incomplete_acceptance", receipt);
  }
  if (
    receipt.estadoFiscal === "rechazado" || receipt.estadoFiscal === "error"
  ) return review("bonfire_fiscal_review", receipt);
  if (
    receipt.estadoFiscal &&
    ![
      "borrador",
      "preparando",
      "preparado",
      "incierto",
      "recibido",
      "procesando",
    ].includes(receipt.estadoFiscal)
  ) {
    return review("bonfire_unknown_fiscal_status", receipt);
  }
  return outcome(
    "submitted",
    new Date(now() + POLL_INTERVAL_MS).toISOString(),
    null,
    receipt,
  );
}
