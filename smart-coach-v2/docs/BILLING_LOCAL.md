# Trainer billing with local Docker

The trainer profile's Plan section contains the Zummith Pro billing flow from the Billing · ONVO design. Development runs against the standard local Supabase Docker project at `http://127.0.0.1:54321`, with a separate local Auth session. The production environment and release build remain separate.

## Start

1. Open Docker Desktop.
2. From `smart-coach-v2`, run `npm start`.
3. Open `http://127.0.0.1:4200/profile#plan`.

The launcher reuses the standard local Supabase stack, starts the billing Edge Functions, and serves Angular with `local-staging`. Its Angular child uses CI mode to avoid the native persistent-cache abort observed on this machine and defaults to two build workers. First startup can download Docker images and take several minutes. It never resets databases or deploys anything. Ctrl+C stops the development processes and preserves Docker data. `npm run billing:check` performs a read-only configuration check; `npm start -- --help` lists launcher options.

The existing persistent compatibility database on port 55321 is a separate environment. Do not reset it or apply the repository's migrations to it.

## Local schema

Billing requires the new `onvo_trainer_billing` migration. The standard Docker database must also contain the existing October 29 coach-role, portal-identity, and Storage hardening migrations. Apply missing migrations only to this standard local project after inspecting the local history. Use the CLI's explicit `--local` selection; never run a remote `db push`, reset either database, or apply migrations to a hosted project for this workflow.

From the repository root, inspect help and local migration state using the pinned CLI:

```sh
npx --yes supabase@2.122.0 migration list --local
npx --yes supabase@2.122.0 migration up --help
```

Only when the pending inventory contains the expected local hardening and billing files, apply them with `npx --yes supabase@2.122.0 migration up --local`. If other migrations are pending, stop and inspect their scope first. Existing local data is preserved.

## Test trainer

From `smart-coach-v2`:

```sh
npm run billing:seed
npm run billing:seed -- --show
```

The seed creates one synthetic independent trainer named **Developer Billing**, using a unique `@zummith.test` address. It does not modify the shared demo accounts. The private login file is `.local/onvo-billing/trainer.json` at the repository root and is ignored by Git. Repeat runs reuse this fixture without changing its password or resetting its billing state.

## Two explicit test modes

The launcher creates a private, ignored `supabase/functions/.env.local` only when that file is absent. Its initial configuration explicitly enables the **local simulator**. The billing UI labels this mode and exposes local success, decline, bank-verification and renewal-failure scenarios. These scenarios exercise the local Auth, database and billing endpoint without calling ONVO or moving funds. Test fixture amounts are not business pricing.

To use the actual ONVO sandbox, edit that same local file explicitly:

```dotenv
COACH_BILLING_MODE=onvo_test
COACH_BILLING_LOCAL_SIMULATOR=false
ONVO_SECRET_KEY=onvo_test_secret_key_REPLACE_LOCALLY
ONVO_PUBLISHABLE_KEY=onvo_test_publishable_key_REPLACE_LOCALLY
ONVO_PRICE_ID=REPLACE_WITH_YOUR_TEST_RECURRING_PRICE_ID
ONVO_WEBHOOK_SECRET=REPLACE_WITH_YOUR_TEST_WEBHOOK_SECRET
BILLING_ALLOWED_ORIGINS=http://127.0.0.1:4200,http://localhost:4200
```

Restart `npm start` after changing function configuration. The launcher never overwrites an existing file. Only test keys are accepted. Missing credentials show a setup state rather than granting access or silently falling back to simulation. The backend reads amount, currency and recurrence from the configured ONVO price; no real commercial terms are invented.

Use a fresh synthetic trainer when switching from simulation to ONVO: an existing simulator subscription must not be converted into a real provider subscription or create overlapping paid access.

On a corporate network, Docker may not trust the certificate authority already installed on the host. If an outbound ONVO request fails with `UnknownIssuer`, export only the required, currently valid public CA from the host's trusted store to the ignored `supabase/functions/.local/` directory. Encode that PEM as single-line base64 and set `ONVO_TEST_CA_CERT_BASE64` in the private `.env.local`, then restart the functions. The billing entry points create a Deno HTTP client with that additional CA specifically for ONVO API requests. An inline certificate is needed because older local Edge Runtime workers use a virtual filesystem that cannot read the host-mounted PEM path through `DENO_CERT`. This option is refused for hosted/deployed backends; other origins use their normal transport and ONVO redirects are rejected. Verify the chain before exporting and retry authenticated billing status afterward. Never disable certificate validation or commit machine-specific CA files or values.

The initial payment uses ONVO's subscription SDK. Card replacement is tokenized directly between the browser and ONVO; Zummith receives only the payment-method identifier. A browser callback is not payment proof: Pro is activated only after trusted server reconciliation. Scheduled cancellation uses ONVO's `cancelAtPeriodEnd` update and preserves only the already-confirmed paid period. There is no additional grace period.

The local sandbox checkout was verified on November 9, 2026 with the monthly USD 18.15 test price. To try it manually, sign in as Developer Billing using the private seeded login, open the profile's Plan section, select Subscribe to Pro, review the provider's terms, and continue to the ONVO form. Use the documented test Visa `4242424242424242`, a future expiry and a valid test CVV such as `123`. Wait for server confirmation before treating the subscription as active. The isolated verification account was separate from Developer Billing.

ONVO cannot reach a loopback webhook from the internet. Provider webhooks are deliberately disabled in simulator mode. The Docker HTTP checks verify that rejection and unchanged access; injected Deno tests cover webhook authentication, replay and retry behavior. Actual sandbox delivery requires configured test credentials and a separately authorized temporary HTTPS tunnel; do not expose local services automatically.

The current webhook handler implements the legacy `X-Webhook-Secret` format. ONVO now creates new webhook endpoints with signatures. New externally delivered renewal notifications require a separate signed-webhook integration and a reachable HTTPS endpoint; they are not covered by the local checkout/cancellation proof.

## Verification

All integration/browser tests for this feature must reject hosted Supabase targets and use synthetic local identities. The configuration preflight is offline:

```sh
npm run check:backend
npm run test:billing-local-config
npm run billing:check
npm run test:plan
CI=1 NG_BUILD_MAX_WORKERS=2 npm run build:staging
npm run test:billing-http
```

The backend unit/security suites, local HTTP billing runner and browser runner are recorded with their observed results in `odd/tasks/onvo-billing-local.md`. The HTTP and browser simulator runners require simulator mode and must not be used as sandbox settlement proof. Actual ONVO checkout, a succeeded payment intent, paid invoice, local Pro projection and period-end cancellation were verified separately with a synthetic identity. Each environment still needs its own test credentials, recurring price and verified connection. Externally delivered renewal webhooks remain outside that proof.

Official contracts: [recurring charges](https://docs.onvopay.com/payments/subscriptions), [subscription SDK](https://docs.onvopay.com/integrations/sdk), [webhooks](https://docs.onvopay.com/webhooks), and [OpenAPI schema](https://docs.onvopay.com/openapi.yaml).
