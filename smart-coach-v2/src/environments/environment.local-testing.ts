// Isolated copy of the original production schema, with synthetic testing data only.
export const environment = {
  production: false,
  appUrl: 'http://127.0.0.1:4350',
  auth: { storageKey: 'zummith-v2-testing-auth' },
  supabase: {
    url: 'http://127.0.0.1:55321',
    // Public local anon key. Privileged credentials never enter the app.
    publishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
  }
};
