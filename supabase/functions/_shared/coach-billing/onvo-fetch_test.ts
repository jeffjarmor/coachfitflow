import { createOnvoTestFetch } from "./onvo-fetch.ts";

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("ONVO transport preserves default fetch without an explicit local CA", () => {
  const base = (() => Promise.resolve(new Response("{}"))) as typeof fetch;
  check(createOnvoTestFetch({}, base) === base, "Default transport changed.");
  let loaded = false;
  const result = createOnvoTestFetch(
    {
      COACH_BILLING_MODE: "simulator",
      ONVO_TEST_CA_CERT_BASE64: btoa("local-public-ca-pem"),
    },
    base,
    () => {
      loaded = true;
      throw new Error("unused");
    },
  );
  check(
    result === base && !loaded,
    "Simulator must keep its existing transport.",
  );
});

Deno.test("local ONVO CA applies only to the exact gateway origin and rejects redirects", async () => {
  const client = {} as Deno.HttpClient;
  const calls: Array<
    { url: string; init?: RequestInit & { client?: Deno.HttpClient } }
  > = [];
  const base = ((input, init) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  const wrapped = createOnvoTestFetch(
    {
      COACH_BILLING_MODE: "onvo_test",
      SUPABASE_URL: "http://kong:8000",
      ONVO_TEST_CA_CERT_BASE64: btoa("local-public-ca-pem"),
    },
    base,
    (pem) => {
      check(pem === "local-public-ca-pem", "Unexpected certificate data.");
      return client;
    },
  );
  await wrapped("https://api.onvopay.com/v1/prices/test", {
    headers: { authorization: "Bearer test" },
  });
  await wrapped("http://kong:8000/rest/v1/coaches");
  await wrapped("https://api.onvopay.com.evil.test/v1/prices/test");
  check(
    calls[0].init?.client === client,
    "Gateway did not receive the explicit CA client.",
  );
  check(
    calls[0].init?.redirect === "error",
    "Gateway redirects must be rejected.",
  );
  check(
    new Headers(calls[0].init?.headers).get("authorization") === "Bearer test",
    "Gateway authorization changed.",
  );
  check(
    !calls[1].init?.client && !calls[2].init?.client,
    "Custom trust leaked to another origin.",
  );
});

Deno.test("local ONVO CA is refused for hosted or deployed backends before loading trust", () => {
  const environments: Array<Record<string, string>> = [{
    SUPABASE_URL: "https://project.supabase.co",
  }, { SUPABASE_URL: "http://kong:8000", DENO_DEPLOYMENT_ID: "deployed" }];
  for (const extra of environments) {
    let loaded = false;
    let rejected = false;
    try {
      createOnvoTestFetch(
        {
          COACH_BILLING_MODE: "onvo_test",
          ONVO_TEST_CA_CERT_BASE64: btoa("local-public-ca-pem"),
          ...extra,
        },
        fetch,
        () => {
          loaded = true;
          return {} as Deno.HttpClient;
        },
      );
    } catch {
      rejected = true;
    }
    check(
      rejected && !loaded,
      "A nonlocal backend accepted a local trust override.",
    );
  }
});
