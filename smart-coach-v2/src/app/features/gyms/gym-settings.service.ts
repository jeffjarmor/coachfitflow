import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { GymSettingsInput } from './gym-settings.models';
import { generateGymAccessCode } from './gym-access-code';

const LOGO_BUCKET = 'assets';

@Injectable({ providedIn: 'root' })
export class GymSettingsService {
  private readonly supabase = inject(SupabaseService).client;

  async update(gymId: string, input: GymSettingsInput): Promise<void> {
    const { data, error } = await this.supabase.from('gyms').update({
      name: input.name.trim(),
      email: input.email.trim() || null,
      phone: input.phone.trim() || null,
      address: input.address.trim() || null,
      logo_url: input.logoUrl,
      brand_color: input.brandColor.toUpperCase(),
      updated_at: new Date().toISOString()
    }).eq('id', gymId).select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para actualizar este gimnasio.');
  }

  async uploadLogo(gymId: string, file: File): Promise<string> {
    await this.assertCanManage(gymId);
    const extension = this.extensionFor(file.type);
    const path = `gyms/${gymId}/logo-${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { data, error } = await this.supabase.storage.from(LOGO_BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (error) throw error;
    return this.supabase.storage.from(LOGO_BUCKET).getPublicUrl(data.path).data.publicUrl;
  }

  async removeLogo(gymId: string, publicUrl: string | null | undefined): Promise<void> {
    const marker = `/storage/v1/object/public/${LOGO_BUCKET}/gyms/${gymId}/`;
    if (!publicUrl?.includes(marker)) return;
    const fileName = publicUrl.slice(publicUrl.indexOf(marker) + marker.length).split(/[?#]/, 1)[0];
    if (!fileName || fileName.includes('/')) return;
    await this.assertCanManage(gymId);
    const { error } = await this.supabase.storage.from(LOGO_BUCKET).remove([`gyms/${gymId}/${fileName}`]);
    if (error) throw error;
  }

  async rotateAccessCode(gymId: string): Promise<string> {
    const { data, error } = await this.supabase.from('gyms').update({
      access_code: generateGymAccessCode(), updated_at: new Date().toISOString()
    }).eq('id', gymId).select('access_code').single();
    if (error) throw error;
    if (!data) throw new Error('No se recibió el nuevo código.');
    return data.access_code;
  }

  private extensionFor(contentType: string): string {
    if (contentType === 'image/png') return 'png';
    if (contentType === 'image/webp') return 'webp';
    return 'jpg';
  }

  private async assertCanManage(gymId: string): Promise<void> {
    const permission = await this.supabase.rpc('is_gym_owner', { p_gym_id: gymId });
    if (permission.error) throw permission.error;
    if (!permission.data) throw new Error('Solo el propietario o administración puede cambiar el logo del gimnasio.');
  }
}
