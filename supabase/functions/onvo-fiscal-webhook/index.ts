import { createOnvoFiscalWebhook } from "./handler.ts";

const accountId = Deno.env.get("ONVO_FISCAL_ACCOUNT_ID");
const mode = Deno.env.get("ONVO_FISCAL_MODE");
const signingSecret = Deno.env.get("ONVO_FISCAL_SIGNING_SECRET");
const scope = Deno.env.get("ONVO_FISCAL_SCOPE");
const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (
  !accountId || !signingSecret?.startsWith("whsec_") || !supabaseUrl ||
  !serviceKey ||
  (mode !== "test" && mode !== "live") || scope !== "dedicated_account"
) {
  Deno.serve(() =>
    Response.json({ error: "fiscal_webhook_not_configured" }, { status: 503 })
  );
} else {
  Deno.serve(createOnvoFiscalWebhook({
    accountId,
    mode,
    signingSecret,
    async recordPayment(payment) {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/record_onvo_fiscal_payment`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            p_mode: payment.mode,
            p_account_id: payment.accountId,
            p_payment_intent_id: payment.paymentIntentId,
            p_source_event_id: payment.sourceEventId,
            p_amount_minor: payment.amountMinor,
            p_currency: payment.currency,
            p_payment_confirmed_at: payment.confirmedAt,
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) throw new Error("Payment storage unavailable");
      const inserted: unknown = await response.json();
      if (typeof inserted !== "boolean") {
        throw new Error("Unexpected payment storage response");
      }
      return inserted;
    },
  }));
}
