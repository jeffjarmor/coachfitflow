import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { generateGymAccessCode } from './gym-access-code';

export interface GymOnboardingInput {
  name: string;
  email: string;
  phone: string;
  address: string;
  brandColor: string;
}

export interface CreatedGym {
  id: string;
  accessCode: string;
}

@Injectable({ providedIn: 'root' })
export class GymOnboardingService {
  private readonly supabase = inject(SupabaseService).client;

  async create(requestId: string, input: GymOnboardingInput): Promise<CreatedGym> {
    const admin = await this.supabase.rpc('is_admin');
    if (admin.error) throw admin.error;
    if (!admin.data) throw new Error('Solo administración puede crear un gimnasio.');
    // Use the persisted draft UUID as the gym ID so retrying a completed request is safe.
    const existing = await this.supabase.from('gyms').select('id,access_code').eq('id', requestId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { id: existing.data.id, accessCode: existing.data.access_code };
    const { data, error } = await this.supabase.from('gyms').insert({
      id: requestId,
      name: input.name.trim(),
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      address: input.address.trim() || null,
      brand_color: input.brandColor.toUpperCase(),
      access_code: generateGymAccessCode()
    }).select('id,access_code').single();
    if (error?.code === '23505') {
      const completed = await this.supabase.from('gyms').select('id,access_code').eq('id', requestId).maybeSingle();
      if (!completed.error && completed.data) return { id: completed.data.id, accessCode: completed.data.access_code };
    }
    if (error) throw error;
    return { id: data.id, accessCode: data.access_code };
  }
}
