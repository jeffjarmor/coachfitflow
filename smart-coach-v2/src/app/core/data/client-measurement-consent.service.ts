import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';

export const CLIENT_MEASUREMENT_CONSENT_TEXT = 'Autorizo que se guarden en mi ficha las mediciones que decida compartir, como peso, altura y composición corporal, para llevar un seguimiento de mi progreso. Podré consultarlas junto con mi entrenador o el personal autorizado de mi gimnasio.';
const consentVersion = '2026-11-12-v1';

export type ClientMeasurementConsentAction = 'authorize_online' | 'record_written' | 'revoke';

export interface ClientMeasurementConsent {
  authorized: boolean;
  is_minor: boolean | null;
  source: 'portal' | 'written' | null;
  changed_at: string | null;
  can_authorize_online: boolean;
  can_record_written: boolean;
  can_revoke: boolean;
}

export function isMeasurementConsentRequired(error: unknown): boolean {
  return (error as { message?: string } | null)?.message === 'measurement_consent_required';
}

@Injectable({ providedIn: 'root' })
export class ClientMeasurementConsentService {
  private readonly supabase = inject(SupabaseService).client;

  async get(clientId: string, membershipId?: string | null): Promise<ClientMeasurementConsent> {
    const { data, error } = await this.supabase.rpc('get_client_measurement_consent', {
      p_client_id: clientId,
      p_membership_id: membershipId || null
    });
    if (error) throw error;
    return data as ClientMeasurementConsent;
  }

  async set(clientId: string, membershipId: string | null | undefined, action: ClientMeasurementConsentAction): Promise<ClientMeasurementConsent> {
    const { data, error } = await this.supabase.rpc('set_client_measurement_consent', {
      p_client_id: clientId,
      p_membership_id: membershipId || null,
      p_action: action,
      p_version: action === 'revoke' ? null : consentVersion
    });
    if (error) throw error;
    return data as ClientMeasurementConsent;
  }
}
