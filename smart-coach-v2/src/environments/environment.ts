// Development is isolated from the hosted application and its saved sessions.
// Production builds replace this file with environment.prod.ts.
export const environment = {
  production: false,
  onvoLiveBillingEnabled: false,
  auth: { storageKey: 'zummith-v2-local-auth' },
  supabase: {
    url: 'http://127.0.0.1:54321',
    publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  }
};
