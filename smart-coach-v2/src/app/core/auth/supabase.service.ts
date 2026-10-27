import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.publishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Password links belong to the isolated password-action client below.
        detectSessionInUrl: typeof window === 'undefined' || !/^\/set-password\/?$/.test(window.location.pathname),
        // Production keeps the original app's session; staging uses its own key.
        storageKey: environment.auth.storageKey
      }
    }
  );

  createPasswordActionClient(): SupabaseClient {
    const mainKey = environment.auth.storageKey;
    const actionId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const actionKey = `${mainKey}-password-action-${actionId}`;
    const memory = new Map<string, string>();
    const importedVerifiers = new Map<string, { source: string; value: string }>();
    // Import only this callback's verifier. Other pending OAuth/recovery flows
    // and the user's normal session must survive this client's cleanup.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('code')) {
        const flow = params.get('sb_flow_id');
        const suffix = flow && /^[a-zA-Z0-9_-]{8,64}$/.test(flow)
          ? `-flow-${flow}-code-verifier`
          : '-code-verifier';
        const source = `${mainKey}${suffix}`;
        const value = localStorage.getItem(source);
        if (value !== null) {
          memory.set(`${actionKey}${suffix}`, value);
          importedVerifiers.set(`${actionKey}${suffix}`, { source, value });
          const legacy = `${mainKey}-code-verifier`;
          if (flow && localStorage.getItem(legacy) === value) {
            memory.set(`${actionKey}-code-verifier`, value);
            importedVerifiers.set(`${actionKey}-code-verifier`, { source: legacy, value });
          }
        }
      }
    } catch { /* A missing verifier makes exchange fail safely. */ }

    return createClient(environment.supabase.url, environment.supabase.publishableKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: actionKey,
        // Supabase requires persistSession to honor a custom storage adapter.
        // This adapter stores sessions only in memory, never in localStorage.
        persistSession: true,
        storage: {
          getItem: (key: string) => memory.get(key) ?? null,
          setItem: (key: string, value: string) => { memory.set(key, value); },
          removeItem: (key: string) => {
            memory.delete(key);
            const imported = importedVerifiers.get(key);
            try {
              // Consume only the PKCE verifier; the normal session stays intact.
              if (imported && localStorage.getItem(imported.source) === imported.value) {
                localStorage.removeItem(imported.source);
              }
            } catch { /* Storage may be unavailable in a private browser. */ }
          }
        }
      }
    });
  }
}
