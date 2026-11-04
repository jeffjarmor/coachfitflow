export type CoachOwner = {
  id: string;
  email: string | null;
  name: string | null;
  coachPlan?: string | null;
  nextPlanPaymentDate?: string | null;
};

export type BillingAction =
  | { action: "status" }
  | { action: "subscribe" }
  | { action: "reconcile" }
  | { action: "cancel" }
  | { action: "change-payment-method"; paymentMethodId: string }
  | { action: "simulate"; scenario: "success" | "decline" | "requires_action" | "renewal_failed" };

export interface CoachBillingHandlerDependencies {
  authenticate(request: Request): Promise<CoachOwner | null>;
  status(owner: CoachOwner): Promise<unknown>;
  subscribe(owner: CoachOwner): Promise<unknown>;
  reconcile(owner: CoachOwner): Promise<unknown>;
  cancel(owner: CoachOwner): Promise<unknown>;
  changePaymentMethod(owner: CoachOwner, paymentMethodId: string): Promise<unknown>;
  simulate(owner: CoachOwner, scenario: Extract<BillingAction, { action: "simulate" }>["scenario"]): Promise<unknown>;
  allowedOrigins?: string[];
}

const maxBodyBytes = 16_384;
const invalidFieldName = /(card|pan|number|primaryaccount|cvc|cvv|securitycode|exp(?:iry)?(?:month|year)?|holdername)/i;

function json(status: number, value: unknown, origin: string | null, allowedOrigins: string[]) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  if (origin && allowedOrigins.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
    headers.set("access-control-allow-methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function fail(status: number, code: string, message: string, origin: string | null, origins: string[]) {
  return json(status, { error: { code, message } }, origin, origins);
}

function containsCardData(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsCardData);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) =>
    invalidFieldName.test(key.replace(/[_-]/g, "")) || containsCardData(child)
  );
}

function hasOnlyKeys(body: Record<string, unknown>, allowed: string[]) {
  return Object.keys(body).every((key) => allowed.includes(key));
}

function parseAction(value: unknown): BillingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (containsCardData(body)) return null;
  switch (body.action) {
    case "status":
    case "subscribe":
    case "reconcile":
    case "cancel":
      return hasOnlyKeys(body, ["action"]) ? { action: body.action } : null;
    case "change-payment-method":
      return hasOnlyKeys(body, ["action", "paymentMethodId"])
        && typeof body.paymentMethodId === "string" && /^[A-Za-z0-9_-]{3,200}$/.test(body.paymentMethodId)
        ? { action: body.action, paymentMethodId: body.paymentMethodId }
        : null;
    case "simulate":
      return hasOnlyKeys(body, ["action", "scenario"])
        && ["success", "decline", "requires_action", "renewal_failed"].includes(String(body.scenario))
        ? { action: body.action, scenario: body.scenario as Extract<BillingAction, { action: "simulate" }>["scenario"] }
        : null;
    default:
      return null;
  }
}

export function createCoachBillingHandler(deps: CoachBillingHandlerDependencies) {
  const origins = deps.allowedOrigins ?? [];
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !origins.includes(origin)) return fail(403, "origin_not_allowed", "Request origin is not allowed.", null, origins);
    if (request.method === "OPTIONS") {
      const preflight = json(200, null, origin, origins);
      return new Response(null, { status: 204, headers: preflight.headers });
    }
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST for billing actions.", origin, origins);
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ") || authorization.length < 12) {
      return fail(401, "unauthorized", "Authentication required.", origin, origins);
    }

    let owner: CoachOwner | null;
    try {
      owner = await deps.authenticate(request);
    } catch {
      return fail(401, "unauthorized", "Authentication required.", origin, origins);
    }
    if (!owner) return fail(401, "unauthorized", "Authentication required.", origin, origins);

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > maxBodyBytes) return fail(413, "request_too_large", "Request is too large.", origin, origins);
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return fail(415, "invalid_content_type", "Send a JSON request body.", origin, origins);
    }
    let raw: string;
    try {
      raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) throw new Error("too_large");
    } catch {
      return fail(413, "request_too_large", "Request is too large.", origin, origins);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, "invalid_request", "Request body must be valid JSON.", origin, origins);
    }
    const action = parseAction(body);
    if (!action) return fail(400, "invalid_request", "Billing action or fields are invalid.", origin, origins);

    try {
      let result: unknown;
      switch (action.action) {
        case "status": result = await deps.status(owner); break;
        case "subscribe": result = await deps.subscribe(owner); break;
        case "reconcile": result = await deps.reconcile(owner); break;
        case "cancel": result = await deps.cancel(owner); break;
        case "change-payment-method": result = await deps.changePaymentMethod(owner, action.paymentMethodId); break;
        case "simulate": result = await deps.simulate(owner, action.scenario); break;
      }
      return json(200, result, origin, origins);
    } catch (error) {
      const status = error instanceof BillingRequestError ? error.status : 502;
      const code = error instanceof BillingRequestError ? error.code : "billing_unavailable";
      const message = error instanceof BillingRequestError ? error.message : "Billing could not be completed. Refresh and try again.";
      return fail(status, code, message, origin, origins);
    }
  };
}

export class BillingRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}
