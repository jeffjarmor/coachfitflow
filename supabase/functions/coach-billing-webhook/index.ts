import { createRuntimeDependencies } from "../_shared/coach-billing/runtime.ts";
import { createCoachBillingWebhookHandler } from "../_shared/coach-billing/webhook.ts";

const dependencies = createRuntimeDependencies();
Deno.serve(createCoachBillingWebhookHandler({
  secret: dependencies.webhookSecret,
  recordWebhook: dependencies.receiveWebhook,
}));
