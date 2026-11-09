import { createRuntimeDependencies } from "../_shared/coach-billing/runtime.ts";
import { createCoachBillingWebhookHandler } from "../_shared/coach-billing/webhook.ts";
import { createOnvoTestFetch } from "../_shared/coach-billing/onvo-fetch.ts";

const env = Deno.env.toObject();
const dependencies = createRuntimeDependencies(env, createOnvoTestFetch(env));
Deno.serve(createCoachBillingWebhookHandler({
  secret: dependencies.webhookSecret,
  recordWebhook: dependencies.receiveWebhook,
}));
