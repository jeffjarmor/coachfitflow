// Local Supabase CLI only. Never use this configuration for a public deployment.
export const environment = {
  production: false,
  auth: { storageKey: 'zummith-v2-local-auth' },
  supabase: {
    url: 'http://127.0.0.1:54321',
    // The local CLI demo anon key is public; service-role credentials stay outside the app.
    publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  }
};
