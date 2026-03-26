import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class UsageService {
    private supabase = inject(SupabaseService).client;

    async logLogin(userId: string, role: string): Promise<void> {
        const { error } = await this.supabase.from('activity_logins').insert({
            user_id: userId,
            role,
            timestamp: new Date().toISOString()
        });
        if (error) console.error('Error logging login activity:', error);
    }

    async getLoginStats(days: number = 30): Promise<any> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const { data, error } = await this.supabase
            .from('activity_logins')
            .select('*')
            .gte('timestamp', cutoff.toISOString())
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Error fetching login stats:', error);
            return { total: 0, logins: [] };
        }

        return {
            total: (data || []).length,
            logins: data || []
        };
    }

    async getRoutineCreationStats(days: number = 30): Promise<any> {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const { data, error } = await this.supabase
            .from('routines')
            .select('*')
            .gte('created_at', cutoff.toISOString());

        if (error) {
            console.error('Error fetching routine stats:', error);
            return { total: 0, routines: [] };
        }

        return {
            total: (data || []).length,
            routines: data || []
        };
    }
}
