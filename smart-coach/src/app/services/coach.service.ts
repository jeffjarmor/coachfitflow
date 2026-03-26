import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { StorageService } from './storage.service';
import { Coach, CreateCoachData, UpdateCoachData } from '../models/coach.model';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class CoachService {
    private firestoreService = inject(FirestoreService);
    private storageService = inject(StorageService);
    private supabase = inject(SupabaseService).client;

    currentCoach = signal<Coach | null>(null);
    loading = signal<boolean>(false);

    async createCoachProfile(data: CreateCoachData, userId: string): Promise<void> {
        const coachData: Partial<Coach> = {
            id: userId,
            email: data.email,
            name: data.name,
            phone: data.phone || '',
            logoUrl: '',
            brandColor: '#2196f3',
            role: 'coach',
            createdAt: new Date()
        };

        await this.firestoreService.addDocument('coaches', coachData);
    }

    async coachExists(coachId: string): Promise<boolean> {
        return this.firestoreService.documentExists('coaches', coachId);
    }

    async getCoachProfile(coachId: string): Promise<Coach | null> {
        try {
            this.loading.set(true);
            let coach = await this.firestoreService.getDocument<Coach>('coaches', coachId);

            // OAuth first-login fallback:
            // if authenticated user exists but profile row is missing, provision it once.
            if (!coach) {
                const { data } = await this.supabase.auth.getUser();
                const authUser = data.user;
                if (authUser?.id === coachId) {
                    const metadata: any = authUser.user_metadata || {};
                    const name =
                        metadata.full_name ||
                        metadata.name ||
                        (typeof authUser.email === 'string' ? authUser.email.split('@')[0] : '') ||
                        'Coach';

                    await this.createCoachProfile(
                        {
                            email: authUser.email || '',
                            name
                        },
                        coachId
                    );

                    coach = await this.firestoreService.getDocument<Coach>('coaches', coachId);
                }
            }

            if (coach) {
                // Compatibility field for current UI: expose one active gymId.
                const [{ data: staff }, { data: owned }] = await Promise.all([
                    this.supabase.from('gym_staff').select('gym_id').eq('coach_id', coachId).limit(1).maybeSingle(),
                    this.supabase.from('gyms').select('id').eq('owner_id', coachId).limit(1).maybeSingle()
                ]);
                const activeGymId = staff?.gym_id || owned?.id || null;
                (coach as any).gymId = activeGymId;
            }
            if (coach) this.currentCoach.set(coach);
            return coach;
        } finally {
            this.loading.set(false);
        }
    }

    async getAllCoaches(): Promise<Coach[]> {
        try {
            this.loading.set(true);
            return await this.firestoreService.getCollection<Coach>('coaches');
        } finally {
            this.loading.set(false);
        }
    }

    async deleteCoach(coachId: string): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.deleteDocument('coaches', coachId);
        } finally {
            this.loading.set(false);
        }
    }

    async updateCoachProfile(coachId: string, data: UpdateCoachData): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument('coaches', coachId, {
                ...data,
                updatedAt: new Date()
            } as Partial<Coach>);

            const updatedCoach = await this.getCoachProfile(coachId);
            if (updatedCoach) this.currentCoach.set(updatedCoach);
        } finally {
            this.loading.set(false);
        }
    }

    async uploadLogo(coachId: string, file: File): Promise<string> {
        try {
            this.loading.set(true);
            const logoUrl = await this.storageService.uploadCoachLogo(coachId, file);
            await this.updateCoachProfile(coachId, { logoUrl });
            return logoUrl;
        } finally {
            this.loading.set(false);
        }
    }

    async updateBrandColor(coachId: string, brandColor: string): Promise<void> {
        return this.updateCoachProfile(coachId, { brandColor });
    }

    async updateCoachGymAffiliation(
        coachId: string,
        _gymId: string | null,
        accountType: 'independent' | 'gym'
    ): Promise<void> {
        await this.firestoreService.updateDocument('coaches', coachId, {
            accountType,
            updatedAt: new Date()
        } as Partial<Coach>);

        const currentCoach = this.currentCoach();
        if (currentCoach && currentCoach.id === coachId) {
            this.currentCoach.set({
                ...currentCoach,
                accountType,
                updatedAt: new Date()
            });
        }
    }
}
