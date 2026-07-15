import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
    AnnouncementAudience,
    CoachAnnouncement,
    isAnnouncementVisibleForCoach
} from '../models/coach-announcement.model';
import { Coach } from '../models/coach.model';

export interface UpsertCoachAnnouncementInput {
    title: string;
    message: string;
    audience: AnnouncementAudience;
    active: boolean;
    sortOrder?: number;
    startsAt?: string | null;
    endsAt?: string | null;
}

@Injectable({
    providedIn: 'root'
})
export class CoachAnnouncementService {
    private supabase = inject(SupabaseService).client;

    private mapAnnouncement(row: any): CoachAnnouncement {
        return {
            id: row.id,
            title: row.title,
            message: row.message,
            audience: row.audience,
            active: !!row.active,
            sortOrder: Number(row.sort_order || 0),
            startsAt: row.starts_at ?? null,
            endsAt: row.ends_at ?? null,
            createdBy: row.created_by ?? null,
            createdAt: row.created_at ?? null,
            updatedAt: row.updated_at ?? null
        };
    }

    private toIsoStartOfDay(value?: string | null): string | null {
        if (!value) return null;
        return new Date(`${value}T00:00:00`).toISOString();
    }

    private toIsoEndOfDay(value?: string | null): string | null {
        if (!value) return null;
        return new Date(`${value}T23:59:59.999`).toISOString();
    }

    async getAllAnnouncements(): Promise<CoachAnnouncement[]> {
        const { data, error } = await this.supabase
            .from('coach_announcements')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map((row) => this.mapAnnouncement(row));
    }

    async getVisibleAnnouncementsForCoach(coach: Coach): Promise<CoachAnnouncement[]> {
        const { data, error } = await this.supabase
            .from('coach_announcements')
            .select('*')
            .eq('active', true)
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || [])
            .map((row) => this.mapAnnouncement(row))
            .filter((announcement) => isAnnouncementVisibleForCoach(announcement, coach));
    }

    async createAnnouncement(input: UpsertCoachAnnouncementInput): Promise<void> {
        const {
            data: { user }
        } = await this.supabase.auth.getUser();

        const { error } = await this.supabase.from('coach_announcements').insert({
            title: input.title.trim(),
            message: input.message.trim(),
            audience: input.audience,
            active: input.active,
            sort_order: input.sortOrder ?? 0,
            starts_at: this.toIsoStartOfDay(input.startsAt),
            ends_at: this.toIsoEndOfDay(input.endsAt),
            created_by: user?.id || null
        });

        if (error) throw error;
    }

    async updateAnnouncement(id: string, input: UpsertCoachAnnouncementInput): Promise<void> {
        const { error } = await this.supabase
            .from('coach_announcements')
            .update({
                title: input.title.trim(),
                message: input.message.trim(),
                audience: input.audience,
                active: input.active,
                sort_order: input.sortOrder ?? 0,
                starts_at: this.toIsoStartOfDay(input.startsAt),
                ends_at: this.toIsoEndOfDay(input.endsAt),
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;
    }

    async deleteAnnouncement(id: string): Promise<void> {
        const { error } = await this.supabase
            .from('coach_announcements')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }

    async toggleAnnouncementActive(id: string, active: boolean): Promise<void> {
        const { error } = await this.supabase
            .from('coach_announcements')
            .update({
                active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;
    }
}
