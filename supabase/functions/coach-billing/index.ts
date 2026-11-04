import { createCoachBillingHandler } from "../_shared/coach-billing/handler.ts";
import { createRuntimeDependencies } from "../_shared/coach-billing/runtime.ts";

const dependencies = createRuntimeDependencies();
Deno.serve(createCoachBillingHandler(dependencies));
