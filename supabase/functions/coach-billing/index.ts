import { createCoachBillingHandler } from "../_shared/coach-billing/handler.ts";
import { createRuntimeDependencies } from "../_shared/coach-billing/runtime.ts";
import { createOnvoTestFetch } from "../_shared/coach-billing/onvo-fetch.ts";

const env = Deno.env.toObject();
const dependencies = createRuntimeDependencies(env, createOnvoTestFetch(env));
Deno.serve(createCoachBillingHandler(dependencies));
