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
ONVO_SUBSCRIPTION_WEBHOOK_SIGNING_SECRET=whsec_REPLACE_WITH_YOUR_TEST_ENDPOINT_SECRET
ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID=REPLACE_WITH_YOUR_ONVO_TEST_ACCOUNT_ID
BILLING_ALLOWED_ORIGINS=http://127.0.0.1:4200,http://localhost:4200
```

Restart `npm start` after changing function configuration. The launcher never overwrites an existing file. Only test keys are accepted. Missing credentials show a setup state rather than granting access or silently falling back to simulation. The backend reads amount, currency and recurrence from the configured ONVO price; no real commercial terms are invented.

Use a fresh synthetic trainer when switching from simulation to ONVO: an existing simulator subscription must not be converted into a real provider subscription or create overlapping paid access.

On a corporate network, Docker may not trust the certificate authority already installed on the host. If an outbound ONVO request fails with `UnknownIssuer`, export only the required, currently valid public CA from the host's trusted store to the ignored `supabase/functions/.local/` directory. Encode that PEM as single-line base64 and set `ONVO_TEST_CA_CERT_BASE64` in the private `.env.local`, then restart the functions. The billing entry points create a Deno HTTP client with that additional CA specifically for ONVO API requests. An inline certificate is needed because older local Edge Runtime workers use a virtual filesystem that cannot read the host-mounted PEM path through `DENO_CERT`. This option is refused for hosted/deployed backends; other origins use their normal transport and ONVO redirects are rejected. Verify the chain before exporting and retry authenticated billing status afterward. Never disable certificate validation or commit machine-specific CA files or values.

The initial payment uses ONVO's subscription SDK. Card replacement is tokenized directly between the browser and ONVO; Zummith receives only the payment-method identifier. A browser callback is not payment proof: Pro is activated only after trusted server reconciliation. Scheduled cancellation uses ONVO's `cancelAtPeriodEnd` update and preserves only the already-confirmed paid period. There is no additional grace period.

The local sandbox checkout was verified on November 9, 2026 with the monthly USD 18.15 test price. To try it manually, sign in as Developer Billing using the private seeded login, open the profile's Plan section, select Subscribe to Pro, review the provider's terms, and continue to the ONVO form. Use the documented test Visa `4242424242424242`, a future expiry and a valid test CVV such as `123`. Wait for server confirmation before treating the subscription as active. The isolated verification account was separate from Developer Billing.

### Signed subscription webhook

The receiver is `/functions/v1/coach-billing-webhook` on the Supabase project for the corresponding environment. In the ONVO Dashboard, create a signed endpoint with that public HTTPS URL, copy its `whsec_…` secret and the ONVO account ID to the two environment variables above, and select `payment_intent.succeeded`, `subscription_renewal.succeeded`, and `subscription_renewal.failed`. Use **Probar conexión** to check signed delivery. The payment intent event covers the initial payment. Retries that fail can have distinct event IDs and share the same invoice, so Zummith records the attempts separately and extends access only for a confirmed paid period.

Configure the same ONVO mode on the endpoint, credentials and billing runtime. A receiver configured for signatures requires `X-Onvo-Signature` on all its requests. A separate legacy sandbox receiver can keep `ONVO_WEBHOOK_SECRET` until its pending deliveries have drained. The simulator does not accept provider webhooks.

Run the local receiver and runtime tests with `deno test supabase/functions/_shared/coach-billing` from the repository root. With the billing migrations applied to a disposable PostgreSQL database, run `supabase/tests/onvo_signed_subscription_webhook.local.sql` to verify transactional deduplication and the paid-through date. The tests inject ONVO responses. Actual delivery from ONVO still requires a reachable HTTPS endpoint in an isolated test environment. See the [ONVO webhook settings](https://docs.onvopay.com/webhooks) and [signature contract](https://docs.onvopay.com/webhooks/verify-signatures).

Supabase can stay local for the delivery test. Route a temporary HTTPS tunnel to a loopback listener that serves only `POST /functions/v1/coach-billing-webhook` and uses a disposable PostgreSQL database with synthetic test accounts. Register that URL in ONVO Test and run **Probar conexión**. Once the renewal invoice is due, open it in ONVO Test and select **Reintentar cobro** with a declining test card. Confirm the same subscription with an approved card to collect the outstanding renewal. Re-send the successful event from **Ver entregas** and confirm that PostgreSQL keeps one record for its event ID and one payment for the renewed period. Disable the temporary destination and close the tunnel when the test is done. [ONVO test cards](https://docs.onvopay.com/payments/testing) · [Recurring charges](https://docs.onvopay.com/payments/subscriptions)

On November 25, 2026, ONVO Test delivered the signed connection probe, a failed renewal, the successful recovery of that renewal, and a manual re-send of the successful event to the local receiver. PostgreSQL recorded the failure without extending access, advanced the paid-through date when the payment succeeded, and kept a single payment for that renewal after the re-send.

## Bonfire Factura en STAG

Bonfire Factura queda apagado por defecto con `BONFIRE_FACTURA_ENABLED=false`. En esta salida a producción se emiten las facturas manualmente. El conector, su migración fiscal y el worker quedan fuera de los pasos de publicación de Pro.

Al habilitar el conector en ONVO Test, el webhook firmado guarda los cobros iniciales y las renovaciones pagadas de Pro en `coach_billing_fiscal_jobs` dentro de la transacción del cobro. El acceso a Pro se actualiza aunque el servicio fiscal esté temporalmente caído. El conector usa el código comercial `pro-mensual` y el receptor `coach-billing-webhook`.

1. Aplicá en el entorno aislado las migraciones de facturación y la migración [`20261125233128_coach_billing_bonfire_fiscal_outbox.sql`](../../supabase/migrations/20261125233128_coach_billing_bonfire_fiscal_outbox.sql), después de `20261125190151_onvo_signed_subscription_webhook.sql` y antes de encender el conector.
2. Bonfire debe entregar por un canal seguro el origen HTTPS accesible desde el worker, el ID del proyecto STAG y el par de credenciales de integración. En Bonfire debe quedar aprobada la regla `pro-mensual` con CABYS, precio antes de IVA, moneda y tarjeta. Cotejá el precio recurrente de ONVO Test con la regla aprobada. En la cola se conserva el importe bruto de ONVO en unidades menores. El worker lo compara con el precio neto configurado más IVA del 13 %, usando el redondeo de Bonfire, antes de enviar.
3. Cargá el receptor fiscal confirmado para el entrenador de prueba en `public.coach_billing_fiscal_profiles(coach_id, receptor)`, con acceso de servidor (`service_role`). El objeto `receptor` incluye `nombre`, `tipo`, `numero`, `actividad`, `correo` y `ubicacion`, con `provincia`, `canton`, `distrito` y `otrasSenas`. Para las tareas en revisión con `missing_buyer` o `invalid_buyer`, corregí el perfil y llamá `prepare_coach_billing_fiscal_job(p_job_id)` desde el servidor. Si el perfil es válido y la solicitud aún no tiene cuerpo ni ID de Bonfire, esta operación congela el receptor y deja la tarea pendiente.
4. Desplegá `coach-billing-webhook` y [`coach-billing-fiscal-worker`](../../supabase/functions/coach-billing-fiscal-worker/index.ts) en el proyecto Supabase de pruebas. Configurá `COACH_BILLING_MODE=onvo_test`, el webhook firmado y los secretos del worker con los nombres de [`.env.example`](../../supabase/functions/.env.example). En Docker usá `.env.local`.

| Variables del worker | Valor |
| --- | --- |
| `BONFIRE_FACTURA_ENABLED` | Interruptor de toda la integración. Usá `true` únicamente en ONVO Test después de aplicar la migración fiscal. Con `false` o sin esta variable, el webhook registra los cobros por el flujo habitual de ONVO. |
| `BONFIRE_FACTURA_STAG_URL`, `BONFIRE_FACTURA_STAG_PROJECT_ID` | Origen de la API y proyecto STAG entregados por Bonfire |
| `BONFIRE_FACTURA_STAG_KEY`, `BONFIRE_FACTURA_STAG_SECRET` | Par para `X-Bonfire-Key` y `Authorization: Bearer` en la API fiscal |
| `BONFIRE_FACTURA_PRO_ONVO_PRICE_ID`, `BONFIRE_FACTURA_PRO_CABYS` | Precio recurrente ONVO Test asociado al servicio y CABYS aprobado |
| `BONFIRE_FACTURA_PRO_NET_PRICE`, `BONFIRE_FACTURA_PRO_CURRENCY`, `BONFIRE_FACTURA_PRO_PAYMENT_METHOD` | Precio antes de IVA en texto decimal, `CRC` o `USD`, y `02` para tarjeta |
| `BONFIRE_FACTURA_WORKER_TOKEN`, `BONFIRE_FACTURA_WORKER_ENABLED` | Token aleatorio e independiente de 32 a 256 caracteres con letras, números, guion y guion bajo. Habilitá el envío con `true` al completar la configuración. Con el conector encendido, este segundo interruptor permite pausar el envío y seguir guardando tareas. |

Invocá `POST /functions/v1/coach-billing-fiscal-worker` con `Authorization: Bearer <BONFIRE_FACTURA_WORKER_TOKEN>`. Para procesar la cola periódicamente, programá la llamada por separado en Supabase Cron con `pg_net` en el proyecto de pruebas. Guardá la URL del worker y su token en Supabase Vault y leelos desde la tarea. El worker verifica el ID del proyecto y `ambiente: "stag"` mediante `GET /api/v1/integraciones/conexion` antes de reclamar trabajo. [Programar Edge Functions en Supabase](https://supabase.com/docs/guides/functions/schedule-functions)

Cada tarea usa el ID de la factura comercial de ONVO en `referenciaExterna` y el ID de la intención en `pago.referencia`. Conserva el cuerpo y la clave `Idempotency-Key` entre intentos. Si se pierde el `202`, se busca la solicitud por referencia y se usa el mismo POST para confirmar que corresponde al mismo cuerpo. Una vez guardado `bonfire_request_id`, el worker consulta el estado y registra `estado_fiscal`, `clave` y `consecutivo` en la misma tarea.

Revisá `state`, `review_reason`, `review_event_id`, `invoice_id` y `payment_intent_id` en la cola con acceso de servidor. `invoice_conflict`, `duplicate_payment` y `duplicate_cycle` indican posibles cobros duplicados. `invalid_fiscal_data`, `onvo_amount_mismatch`, `onvo_payment_method_unverified`, `fiscal_amount_mismatch` y `fiscal_currency_mismatch` requieren cotejar el pago con la factura de ONVO y la regla aprobada. `bonfire_reference_conflict`, `bonfire_request_conflict`, `bonfire_invalid_submission` y `bonfire_fiscal_review` requieren revisar la solicitud en Bonfire. La función de preparación para corregir el receptor se limita a los casos `missing_buyer` e `invalid_buyer`.

La prueba de entrega usa un entrenador sintético con un primer cobro y una renovación pagada en ONVO Test. Un operador prepara y emite ambas solicitudes en Bonfire Factura STAG. Verificá dos estados `accepted` con `estado_fiscal = 'aceptado'`, clave y consecutivo por separado. Repetí un aviso y simulá una pérdida de respuesta para comprobar que la referencia recupera la misma solicitud. Verificá también que la cola conserve solo las ventas pagadas tras un intento fallido. Esta prueba extremo a extremo depende de contar con el proyecto, las credenciales, la URL y la regla aprobada de Bonfire.

Las pruebas locales del contrato y los reintentos se ejecutan con `deno test supabase/functions/_shared/bonfire-fiscal` desde la raíz del repositorio. [`coach_billing_bonfire_fiscal_outbox.local.sql`](../../supabase/tests/coach_billing_bonfire_fiscal_outbox.local.sql) comprueba la cola y su relación con el acceso a Pro en una base de datos de pruebas.

## Admin reconciliation

Open `http://127.0.0.1:4200/admin/billing` with the local administrator. Plans shows the app's recorded access and renewal state. Charts shows the selected month and currency, invoice movements, and ONVO-confirmed payouts. Invoice dates are registration dates. The payout net, fees, and retentions come from verified payout records.

The local launcher serves `coach-billing-payout` along with the existing billing functions. To accept a signed local test event for the configured ONVO test account, add these settings to the existing ignored `supabase/functions/.env.local` and restart `npm start`:

```dotenv
ONVO_PAYOUT_ACCOUNT_ID=REPLACE_WITH_YOUR_ONVO_TEST_ACCOUNT_ID
ONVO_PAYOUT_WEBHOOK_SECRET=REPLACE_WITH_YOUR_TEST_PAYOUT_SIGNING_SECRET
```

The endpoint accepts signed `payout.paid` events for that account in test mode. The sandbox may have no confirmed payouts. The Deno handler tests and the rollback-only SQL test in `supabase/tests/admin_billing_reconciliation.local.sql` verify the intake and report using synthetic fixtures. The app keeps using the existing local billing mode. See the [ONVO signature contract](https://docs.onvopay.com/webhooks/verify-signatures) and [payout event schema](https://docs.onvopay.com/webhooks/events#liquidaci%C3%B3n-payout).

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

## Preparación del piloto de Pro en producción

Los entornos de Angular salen con `onvoLiveBillingEnabled: false`. El flujo de Pro admite un piloto por invitación cuando se habilita ese ajuste y el servidor confirma la configuración. Para el servidor, prepará estos valores en los secretos de la función `coach-billing`:

- `COACH_BILLING_MODE=onvo_live` y `COACH_BILLING_LIVE_ENABLED=true`.
- `ONVO_SECRET_KEY` y `ONVO_PUBLISHABLE_KEY` del ambiente real, y `ONVO_PRICE_ID` del precio mensual activo de Pro. Confirmá importe y moneda en ONVO.
- `BILLING_ALLOWED_ORIGINS=https://zummith.com`. Incluí otros orígenes HTTPS solo si son dominios desde los que se sirve Zummith.
- `COACH_BILLING_LIVE_COACH_IDS` con los UUID de los entrenadores invitados, separados por comas. Una lista vacía pausa altas nuevas y permite gestionar suscripciones existentes mientras el modo real siga habilitado.

- `ONVO_SUBSCRIPTION_WEBHOOK_SIGNING_SECRET` y `ONVO_SUBSCRIPTION_WEBHOOK_ACCOUNT_ID` del endpoint firmado y de la cuenta del ambiente real.

Antes del piloto, comprobá la entrega en sandbox de una renovación exitosa, un cobro fallido y un reenvío desde el registro de ONVO. El checkout real usa el formulario de ONVO. El cambio de tarjeta queda a cargo de soporte hasta verificar el flujo correspondiente. La emisión de facturas se hace manualmente mientras se termina Bonfire Factura. Los reportes y liquidaciones automáticas del panel siguen en alcance de pruebas.

### Validación de publicación

El 25 de noviembre de 2026 se verificaron estas seis migraciones en una copia descartable del esquema original y luego se aplicaron al proyecto de producción `bzhqprxolseyxuuwodqs`:

- `20261104021802_onvo_trainer_billing.sql`, `20261111120000_admin_billing_reconciliation.sql` y `20261111120100_harden_onvo_payout_settlement_grants.sql`.
- `20261113014552_coach_billing_withdrawal_requests.sql`, `20261125184836_onvo_live_coach_billing.sql` y `20261125190151_onvo_signed_subscription_webhook.sql`.

La comprobación posterior confirmó que las tablas nuevas de cobros estaban vacías y que el registro de pagos firmados solo era ejecutable con el rol de servicio. ONVO Live sigue apagado y las facturas se emiten manualmente. Las migraciones `20261119205523_onvo_fiscal_payments.sql` y `20261125233128_coach_billing_bonfire_fiscal_outbox.sql` quedan fuera de esta salida.

En el mismo proyecto se publicaron `coach-billing` y `coach-billing-webhook`. La primera función exige un JWT y devuelve `401` sin una sesión. El webhook valida la firma de ONVO en la función y devuelve `503 webhook_not_configured` mientras no se hayan cargado los secretos del proveedor.

La migración `20261113024214_client_measurement_consent.sql` se debe coordinar con la publicación de la interfaz de consentimiento. Activa desde su aplicación las restricciones para guardar peso, estatura y mediciones. La versión vigente de la interfaz no ofrece ese permiso. El contrato de publicación requiere que estén disponibles `get_client_measurement_consent` y `set_client_measurement_consent` antes de publicar Angular V2.

La consulta de solo lectura [release-backend-metadata.sql](../scripts/contracts/release-backend-metadata.sql) exporta el historial de migraciones, las firmas de las funciones y los buckets. Para validar la copia local, agregá al objeto devuelto `formatVersion: 2`, `metadataOnly: true`, `target: "local-candidate"`, `projectId: "local-release-candidate"` y `reviewedAt` con la fecha de verificación. Ejecutá `node scripts/original-backend-contract-check.mjs --local-candidate /ruta/al/candidato.json` desde `smart-coach-v2`.

Después de aplicar y verificar las migraciones en producción, ejecutá la misma consulta en ese proyecto. Agregá al resultado `formatVersion: 2`, `metadataOnly: true`, `target: "deployed-production"`, `projectId: "bzhqprxolseyxuuwodqs"` y `reviewedAt` con la fecha de verificación. Guardá ese objeto revisado en `scripts/contracts/deployed-backend-contract.json` para `npm run build:release`. El candidato local se comprueba por separado y el comando de publicación exige que el contrato de producción sea compatible.
