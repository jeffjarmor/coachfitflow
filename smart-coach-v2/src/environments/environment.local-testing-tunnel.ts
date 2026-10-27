// Temporary HTTPS access to the synthetic local testing copy.
// The proxy routes /supabase exclusively to 127.0.0.1:55321.
const origin = typeof location === 'undefined' ? 'http://127.0.0.1:4351' : location.origin;

export const environment = {
  production: false,
  appUrl: origin,
  auth: { storageKey: 'zummith-v2-tunnel-auth' },
  supabase: {
    url: `${origin}/supabase`,
    publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  }
};
