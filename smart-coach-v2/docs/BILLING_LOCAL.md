# Local sandbox billing and reconciliation

The admin billing and reconciliation screens read trainer billing records from the local Supabase database. Payout settlements are recorded only after the local `coach-billing-payout` Edge Function verifies an ONVO test webhook. The function rejects live-mode events, hosted deployments, and non-local Supabase URLs.

## Local secrets

Create `supabase/functions/.env` on the local machine. This path is ignored by Git. Add test-only values:

```env
COACH_BILLING_MODE=onvo_test
ONVO_PAYOUT_ACCOUNT_ID=<ONVO test account ID>
ONVO_PAYOUT_WEBHOOK_SECRET=<test webhook signing secret>
```

Do not put live keys in this file or in the app. The webhook uses its dedicated signing secret; it does not call ONVO's API. Supabase Edge Functions load `supabase/functions/.env` locally, or accept an explicit `--env-file` when served.

Start the existing local Supabase stack, apply the repository migrations to the local database using the normal local workflow, then serve the function from the repository root:

```sh
npx --yes supabase@2.122.0 functions serve coach-billing-payout --env-file supabase/functions/.env
```

The local URL is `http://127.0.0.1:54321/functions/v1/coach-billing-payout`. It is for local testing only. Do not expose it through a tunnel. `verify_jwt` is disabled for this function because provider webhooks do not carry a Supabase user JWT; the raw request body must pass ONVO's `X-Onvo-Signature` HMAC-SHA256 check, its timestamp must be within five minutes, and the event must identify the configured test account and `mode: "test"`.

## Recorded data and test limits

ONVO payout amounts are text values in the currency's minor unit. The handler stores them as integer minor units without converting through floating-point numbers. Fees, payout fees, and the explicit `retentions` amount remain null when ONVO omits them. ONVO documents `vatTax` and `incomeTax` separately; this report does not combine those fields into retentions. The settlement date uses `arrivedAt`, with the payout object's `updatedAt` as a fallback when `arrivedAt` is absent.

Each paid payout is append-only and deduplicated by payout ID and event ID. Replayed or older paid events do not overwrite a recorded settlement. Raw webhook bodies, card data, destination account details, and signing secrets are not stored.

An ONVO test account may not generate a real payout. In that case, use the signed handler tests and the rollback-only local SQL test for synthetic records; they demonstrate local rendering and reconciliation behavior, not a payout confirmed by ONVO. Invoice movements use their recorded invoice registration time. For invoice kind, the earliest invoice by coach and subscription is labeled `subscription`; later invoices are labeled `renewal`.

The webhook follows ONVO's [signature verification contract](https://docs.onvopay.com/webhooks/verify-signatures) and [payout event schema](https://docs.onvopay.com/webhooks/events#liquidaci%C3%B3n-payout). Supabase's [local Edge Function secrets guide](https://supabase.com/docs/guides/functions/secrets#local-secrets) documents `.env` loading and `--env-file`.
