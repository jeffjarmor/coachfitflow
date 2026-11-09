export function createOnvoTestFetch(
  env: Record<string, string>,
  baseFetch: typeof fetch = fetch,
  loadClient: (pem: string) => Deno.HttpClient = (pem) =>
    Deno.createHttpClient({ caCerts: [pem] }),
): typeof fetch {
  if (env.COACH_BILLING_MODE !== "onvo_test" || !env.ONVO_TEST_CA_CERT_BASE64) {
    return baseFetch;
  }
  let local = false;
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    local = url.protocol === "http:" &&
      [
        "localhost",
        "127.0.0.1",
        "[::1]",
        "kong",
        "supabase_kong",
        "host.docker.internal",
      ].includes(url.hostname);
  } catch {
    /* Invalid configuration is refused before loading a certificate. */
  }
  if (
    !local || env.DENO_DEPLOYMENT_ID ||
    /^(prod|production|live)$/i.test(env.ENVIRONMENT ?? "")
  ) {
    throw new Error(
      "An explicit ONVO test CA is allowed only in local development.",
    );
  }
  const client = loadClient(atob(env.ONVO_TEST_CA_CERT_BASE64));
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin === "https://api.onvopay.com" &&
      url.pathname.startsWith("/v1/")
    ) {
      return baseFetch(input, { ...init, client, redirect: "error" });
    }
    return baseFetch(input, init);
  };
}
