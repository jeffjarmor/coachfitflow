import { Injectable, inject } from '@angular/core';
import { Gym, CreateGymData, UpdateGymData } from '../models/gym.model';
import { GymCoach, GymCoachRole, DEFAULT_PERMISSIONS } from '../models/gym-coach.model';
import { CoachService } from './coach.service';
import { FirestoreService } from './firestore.service';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class GymService {
    private coachService = inject(CoachService);
    private firestoreService = inject(FirestoreService);
    private supabase = inject(SupabaseService).client;

    generateAccessCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        return code;
    }

    async createGym(data: CreateGymData): Promise<Gym> {
        const accessCode = this.generateAccessCode();
        const payload: Partial<Gym> = {
            ...data,
            accessCode,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const gymId = await this.firestoreService.addDocument<Gym>('gyms', payload);

        if (data.ownerId) {
            const ownerCoach = await this.coachService.getCoachProfile(data.ownerId);
            if (ownerCoach) {
                await this.addCoachToGym(gymId, data.ownerId, ownerCoach.name, ownerCoach.email, 'owner');
            }
            await this.coachService.updateCoachGymAffiliation(data.ownerId, gymId, 'gym');
        }

        const gym = await this.getGym(gymId);
        if (!gym) throw new Error('No se pudo crear gimnasio');
        return gym;
    }

    async getGym(gymId: string): Promise<Gym | null> {
        return this.firestoreService.getDocument<Gym>('gyms', gymId);
    }

    async updateGym(gymId: string, data: UpdateGymData): Promise<void> {
        await this.firestoreService.updateDocument('gyms', gymId, {
            ...data,
            updatedAt: new Date()
        });
    }

    async findGymByAccessCode(accessCode: string): Promise<Gym | null> {
        const { data, error } = await this.supabase
            .from('gyms')
            .select('*')
            .eq('access_code', accessCode.toUpperCase())
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        return {
            id: data.id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            address: data.address,
            logoUrl: data.logo_url,
            brandColor: data.brand_color,
            accessCode: data.access_code,
            ownerId: data.owner_id,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        } as Gym;
    }

    async joinGym(_coachId: string, accessCode: string): Promise<Gym> {
        const normalizedCode = (accessCode || '').trim().toUpperCase();
        const { data, error } = await this.supabase.rpc('join_gym_by_access_code', {
            p_access_code: normalizedCode
        });

        if (error) {
            const message = error.message || '';
            if (message.includes('Invalid access code')) throw new Error('Invalid access code');
            if (message.includes('already a member')) throw new Error('You are already a member of this gym');
            if (message.includes('Coach not found')) throw new Error('Coach not found');
            throw error;
        }

        const row: any = Array.isArray(data) ? data[0] : data;
        if (!row) throw new Error('Invalid access code');

        return {
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            address: row.address,
            logoUrl: row.logo_url,
            brandColor: row.brand_color,
            accessCode: row.access_code,
            ownerId: row.owner_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        } as Gym;
    }

    private async addCoachToGym(
        gymId: string,
        coachId: string,
        name: string,
        email: string,
        role: GymCoachRole
    ): Promise<void> {
        await this.supabase.from('gym_staff').insert({
            gym_id: gymId,
            coach_id: coachId,
            role,
            can_edit_clients: DEFAULT_PERMISSIONS[role].canEditClients,
            can_create_routines: DEFAULT_PERMISSIONS[role].canCreateRoutines,
            can_view_payments: DEFAULT_PERMISSIONS[role].canViewPayments,
            can_manage_staff: DEFAULT_PERMISSIONS[role].canManageStaff,
            joined_at: new Date().toISOString()
        });
    }

    async getGymCoaches(gymId: string): Promise<GymCoach[]> {
        const { data, error } = await this.supabase
            .from('gym_staff')
            .select('coach_id, role, joined_at, can_edit_clients, can_create_routines, can_view_payments, can_manage_staff, coaches(name,email)')
            .eq('gym_id', gymId);

        if (error) throw error;

        return (data || []).map((row: any) => {
            const coachRel = Array.isArray(row.coaches) ? row.coaches[0] : row.coaches;
            return {
                coachId: row.coach_id,
                name: coachRel?.name || '',
                email: coachRel?.email || '',
                role: row.role,
                joinedAt: row.joined_at,
                permissions: {
                    canEditClients: !!row.can_edit_clients,
                    canCreateRoutines: !!row.can_create_routines,
                    canViewPayments: !!row.can_view_payments,
                    canManageStaff: !!row.can_manage_staff
                }
            };
        });
    }

    async getGymCoach(gymId: string, coachId: string): Promise<GymCoach | null> {
        const { data, error } = await this.supabase
            .from('gym_staff')
            .select('coach_id, role, joined_at, can_edit_clients, can_create_routines, can_view_payments, can_manage_staff, coaches(name,email)')
            .eq('gym_id', gymId)
            .eq('coach_id', coachId)
            .maybeSingle();

        if (error) throw error;
        if (!data) return null;

        const coachRel = Array.isArray(data.coaches) ? data.coaches[0] : data.coaches;
        return {
            coachId: data.coach_id,
            name: coachRel?.name || '',
            email: coachRel?.email || '',
            role: data.role,
            joinedAt: data.joined_at,
            permissions: {
                canEditClients: !!data.can_edit_clients,
                canCreateRoutines: !!data.can_create_routines,
                canViewPayments: !!data.can_view_payments,
                canManageStaff: !!data.can_manage_staff
            }
        };
    }

    async removeCoachFromGym(gymId: string, coachId: string): Promise<void> {
        const { error } = await this.supabase
            .from('gym_staff')
            .delete()
            .eq('gym_id', gymId)
            .eq('coach_id', coachId);

        if (error) throw error;
        await this.coachService.updateCoachGymAffiliation(coachId, null, 'independent');
    }

    async updateGymCoachDetails(gymId: string, coachId: string, data: { name?: string, email?: string, role?: GymCoachRole }): Promise<void> {
        const updateData: any = {};
        if (data.role) {
            updateData.role = data.role;
            updateData.can_edit_clients = DEFAULT_PERMISSIONS[data.role].canEditClients;
            updateData.can_create_routines = DEFAULT_PERMISSIONS[data.role].canCreateRoutines;
            updateData.can_view_payments = DEFAULT_PERMISSIONS[data.role].canViewPayments;
            updateData.can_manage_staff = DEFAULT_PERMISSIONS[data.role].canManageStaff;
        }

        if (Object.keys(updateData).length > 0) {
            const { error } = await this.supabase
                .from('gym_staff')
                .update(updateData)
                .eq('gym_id', gymId)
                .eq('coach_id', coachId);
            if (error) throw error;
        }

        const profilePatch: any = {};
        if (data.name) profilePatch.name = data.name;
        if (data.email) profilePatch.email = data.email;

        if (Object.keys(profilePatch).length > 0) {
            await this.coachService.updateCoachProfile(coachId, profilePatch);
        }
    }

    async getAllGyms(): Promise<Gym[]> {
        const gyms = await this.firestoreService.getCollection<any>('gyms');
        return gyms.map((g: any) => ({
            id: g.id,
            name: g.name,
            email: g.email,
            phone: g.phone,
            address: g.address,
            logoUrl: g.logoUrl,
            brandColor: g.brandColor,
            accessCode: g.accessCode,
            ownerId: g.ownerId,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt
        }));
    }

    async assignGymOwner(gymId: string, coachId: string): Promise<void> {
        await this.updateGym(gymId, { ownerId: coachId } as any);
        await this.coachService.updateCoachGymAffiliation(coachId, gymId, 'gym');

        const coach = await this.coachService.getCoachProfile(coachId);
        if (coach) await this.addCoachToGym(gymId, coachId, coach.name, coach.email, 'owner');
    }

    async uploadLogo(gymId: string, file: File): Promise<string> {
        const path = `gyms/${gymId}/logo_${Date.now()}_${file.name}`;
        const { data, error } = await this.supabase.storage.from('assets').upload(path, file, {
            upsert: true,
            contentType: file.type
        });
        if (error) throw error;

        const { data: pub } = this.supabase.storage.from('assets').getPublicUrl(data.path);
        const downloadUrl = pub.publicUrl;

        await this.updateGym(gymId, { logoUrl: downloadUrl });
        return downloadUrl;
    }
}
