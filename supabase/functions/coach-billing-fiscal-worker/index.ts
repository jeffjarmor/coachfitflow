import { createFiscalWorkerHandler } from "./handler.ts";

Deno.serve(createFiscalWorkerHandler(Deno.env.toObject()));
