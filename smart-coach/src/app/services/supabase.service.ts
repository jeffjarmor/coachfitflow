import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  readonly client: SupabaseClient;

  constructor() {
    const nonBlockingLock = async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return fn();
    };

    const authOptions: any = {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'zummith-auth',
      // Avoid browser lock-manager deadlocks/timeouts that can freeze auth-bound requests.
      lock: nonBlockingLock
    };

    this.client = createClient(environment.supabase.url, environment.supabase.publishableKey, {
      auth: {
        ...authOptions
      }
    });
  }
}
