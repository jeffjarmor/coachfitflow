import {
  createCoachBillingPayoutHandler,
  isLocalOnvoTestTarget,
  type PaidPayout,
} from "./handler.ts";

const env = Deno.env.toObject();
const supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "") ?? "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SERVICE_ROLE_KEY ?? "";

async function recordPaidPayout(payout: PaidPayout): Promise<boolean> {
  if (!supabaseUrl || !serviceKey) throw new Error("local payout persistence is not configured");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/record_onvo_payout_settlement`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_payout_id: payout.payoutId,
      p_event_id: payout.eventId,
      p_account_id: payout.accountId,
      p_reference: payout.reference,
      p_settled_at: payout.settledAt,
      p_provider_updated_at: payout.providerUpdatedAt,
      p_currency: payout.currency,
      p_transaction_count: payout.transactionCount,
      p_gross_minor: payout.grossMinor,
      p_fees_minor: payout.feesMinor,
      p_payout_fee_minor: payout.payoutFeeMinor,
      p_retentions_minor: payout.retentionsMinor,
      p_net_minor: payout.netMinor,
    }),
  });
  if (!response.ok) throw new Error("local payout persistence failed");
  const inserted: unknown = await response.json();
  if (typeof inserted !== "boolean") throw new Error("local payout persistence returned an invalid result");
  return inserted;
}

Deno.serve(createCoachBillingPayoutHandler({
  enabled: isLocalOnvoTestTarget(env),
  secret: env.ONVO_PAYOUT_WEBHOOK_SECRET ?? "",
  accountId: env.ONVO_PAYOUT_ACCOUNT_ID ?? "",
  recordPaidPayout,
}));
