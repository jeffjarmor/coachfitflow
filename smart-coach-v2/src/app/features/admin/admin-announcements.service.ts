import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { localCalendarDate } from '../../core/data/plan-access';

export type AnnouncementAudience = 'all' | 'standard' | 'paid';
export type AnnouncementState = 'draft' | 'scheduled' | 'expired' | 'published';

export interface CoachAnnouncement {
  id: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  active: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCoachAnnouncementInput {
  title: string;
  message: string;
  audience: AnnouncementAudience;
  active: boolean;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
}

export class AnnouncementValidationError extends Error {}
export class AnnouncementAccessError extends Error {}

export function announcementState(announcement: Pick<CoachAnnouncement, 'active' | 'startsAt' | 'endsAt'>, now = new Date()): AnnouncementState {
  if (!announcement.active) return 'draft';
  if (announcement.endsAt && new Date(announcement.endsAt).getTime() < now.getTime()) return 'expired';
  if (announcement.startsAt && new Date(announcement.startsAt).getTime() > now.getTime()) return 'scheduled';
  return 'published';
}

export function announcementDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? localCalendarDate(date) : '';
}

export function announcementAudienceLabel(audience: AnnouncementAudience): string {
  return audience === 'standard' ? 'Entrenadores estándar' : audience === 'paid' ? 'Entrenadores Pro' : 'Todos';
}

export function compareAnnouncements(a: CoachAnnouncement, b: CoachAnnouncement): number {
  return a.sortOrder - b.sortOrder || Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

const columns = 'id,title,message,audience,active,sort_order,starts_at,ends_at,created_by,created_at,updated_at';

@Injectable({ providedIn: 'root' })
export class AdminAnnouncementsService {
  private readonly supabase = inject(SupabaseService).client;

  async getAllAnnouncements(): Promise<CoachAnnouncement[]> {
    await this.requireAdmin();
    const { data, error } = await this.supabase.from('coach_announcements').select(columns)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => this.map(row));
  }

  async createAnnouncement(input: UpsertCoachAnnouncementInput): Promise<CoachAnnouncement> {
    const payload = this.payload(input);
    const userId = await this.requireAdmin();
    const { data, error } = await this.supabase.from('coach_announcements')
      .insert({ ...payload, created_by: userId }).select(columns).single();
    if (error) throw error;
    return this.map(data);
  }

  async updateAnnouncement(id: string, input: UpsertCoachAnnouncementInput): Promise<CoachAnnouncement> {
    const payload = this.payload(input);
    await this.requireAdmin();
    const { data, error } = await this.supabase.from('coach_announcements')
      .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select(columns).single();
    if (error) throw error;
    return this.map(data);
  }

  async toggleAnnouncementActive(id: string, active: boolean): Promise<CoachAnnouncement> {
    await this.requireAdmin();
    const { data, error } = await this.supabase.from('coach_announcements')
      .update({ active, updated_at: new Date().toISOString() }).eq('id', id).select(columns).single();
    if (error) throw error;
    return this.map(data);
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await this.requireAdmin();
    const { error } = await this.supabase.from('coach_announcements').delete().eq('id', id).select('id').single();
    if (error) throw error;
  }

  private async requireAdmin(): Promise<string> {
    // Check the server identity and the real profile role for every operation.
    // RLS remains authoritative if the role changes between this check and write.
    const { data, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new AnnouncementAccessError('Inicia sesión con una cuenta administradora.');
    const { data: profile, error: profileError } = await this.supabase.from('coaches').select('role').eq('id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'admin') throw new AnnouncementAccessError('Solo una cuenta administradora puede gestionar anuncios.');
    return data.user.id;
  }

  private payload(input: UpsertCoachAnnouncementInput) {
    const title = input.title.trim();
    const message = input.message.trim();
    if (!title || !message) throw new AnnouncementValidationError('Completa el título y el mensaje del anuncio.');
    if (!['all', 'standard', 'paid'].includes(input.audience)) throw new AnnouncementValidationError('Selecciona a quién va dirigido el anuncio.');
    const sortOrder = input.sortOrder ?? 0;
    if (!Number.isInteger(sortOrder) || sortOrder < -2147483648 || sortOrder > 2147483647) {
      throw new AnnouncementValidationError('El orden debe ser un número entero válido.');
    }
    const startsAt = this.dateBoundary(input.startsAt, false);
    const endsAt = this.dateBoundary(input.endsAt, true);
    if (startsAt && endsAt && startsAt > endsAt) throw new AnnouncementValidationError('La fecha final debe ser igual o posterior a la inicial.');
    return { title, message, audience: input.audience, active: input.active, sort_order: sortOrder, starts_at: startsAt, ends_at: endsAt };
  }

  private dateBoundary(value: string | null | undefined, end: boolean): string | null {
    if (!value) return null;
    const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00'}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || localCalendarDate(date) !== value) {
      throw new AnnouncementValidationError('Revisa las fechas del anuncio.');
    }
    // Same day-local boundaries as the original application, including DST.
    return date.toISOString();
  }

  private map(row: any): CoachAnnouncement {
    return { id: row.id, title: row.title, message: row.message, audience: row.audience,
      active: !!row.active, sortOrder: Number(row.sort_order ?? 0), startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null, createdBy: row.created_by ?? null, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
