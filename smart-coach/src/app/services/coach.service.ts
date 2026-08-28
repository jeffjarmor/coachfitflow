import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { StorageService } from './storage.service';
import {
    Coach,
    CreateCoachData,
    DEFAULT_COACH_BRAND_COLOR,
    DEFAULT_COACH_LOGO_URL,
    UpdateCoachData,
    getCoachAccountType,
    getCoachPlan,
    isPaidIndependentCoach
} from '../models/coach.model';
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
    private profileCache = new Map<string, { data: Coach | null; expiresAt: number }>();
    private profileInFlight = new Map<string, Promise<Coach | null>>();
    private readonly profileCacheTtlMs = 30_000;

    private gymContextStorageKey(coachId: string): string {
        return `zummith:active-gym:${coachId}`;
    }

    private getStoredGymId(coachId: string): string | null {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(this.gymContextStorageKey(coachId));
    }

    private storeGymId(coachId: string, gymId: string | null): void {
        if (typeof localStorage === 'undefined') return;
        const key = this.gymContextStorageKey(coachId);
        if (gymId) localStorage.setItem(key, gymId);
        else localStorage.removeItem(key);
    }

    private async getCoachGymIds(coachId: string): Promise<{ ownedIds: string[]; staffIds: string[] }> {
        const [{ data: staff, error: staffError }, { data: owned, error: ownedError }] = await Promise.all([
            this.supabase
                .from('gym_staff')
                .select('gym_id, joined_at')
                .eq('coach_id', coachId)
                .order('joined_at', { ascending: true }),
            this.supabase
                .from('gyms')
                .select('id, created_at')
                .eq('owner_id', coachId)
                .order('created_at', { ascending: true })
        ]);

        if (staffError) throw staffError;
        if (ownedError) throw ownedError;

        return {
            ownedIds: (owned || []).map((row: any) => row.id),
            staffIds: (staff || []).map((row: any) => row.gym_id)
        };
    }

    private normalizeCoach(coach: Coach | null | undefined): Coach | null {
        if (!coach) return null;
        return {
            ...coach,
            logoUrl: coach.logoUrl || DEFAULT_COACH_LOGO_URL,
            brandColor: coach.brandColor || DEFAULT_COACH_BRAND_COLOR,
            accountType: getCoachAccountType(coach),
            coachPlan: getCoachPlan(coach),
            nextPlanPaymentDate: coach.nextPlanPaymentDate || null
        };
    }

    async createCoachProfile(data: CreateCoachData, userId: string): Promise<void> {
        const coachData: Partial<Coach> = {
            id: userId,
            email: data.email,
            name: data.name,
            phone: data.phone || '',
            logoUrl: DEFAULT_COACH_LOGO_URL,
            brandColor: DEFAULT_COACH_BRAND_COLOR,
            role: 'coach',
            accountType: 'independent',
            coachPlan: 'standard',
            nextPlanPaymentDate: null,
            createdAt: new Date()
        };

        await this.firestoreService.addDocument('coaches', coachData);
        this.profileCache.delete(userId);
    }

    async coachExists(coachId: string): Promise<boolean> {
        return this.firestoreService.documentExists('coaches', coachId);
    }

    async getCoachProfile(coachId: string, options?: { autoProvisionMissingProfile?: boolean }): Promise<Coach | null> {
        const now = Date.now();
        const cached = this.profileCache.get(coachId);
        if (cached && cached.expiresAt > now) {
            if (cached.data) this.currentCoach.set(cached.data);
            return cached.data;
        }

        const inFlight = this.profileInFlight.get(coachId);
        if (inFlight) return inFlight;

        const request = this.fetchCoachProfile(coachId, options);
        this.profileInFlight.set(coachId, request);

        try {
            return await request;
        } finally {
            this.profileInFlight.delete(coachId);
        }
    }

    private async fetchCoachProfile(
        coachId: string,
        options?: { autoProvisionMissingProfile?: boolean }
    ): Promise<Coach | null> {
        try {
            this.loading.set(true);
            let coach = await this.firestoreService.getDocument<Coach>('coaches', coachId);
            const autoProvisionMissingProfile = options?.autoProvisionMissingProfile !== false;

            // OAuth first-login fallback:
            // if authenticated user exists but profile row is missing, provision it once.
            if (!coach && autoProvisionMissingProfile) {
                const { data } = await this.supabase.auth.getUser();
                const authUser = data.user;
                if (authUser?.id === coachId) {
                    const metadata: any = authUser.user_metadata || {};
                    const isGymClientMetadata =
                        metadata?.role === 'gym_client' ||
                        metadata?.account_type === 'gym_client' ||
                        !!metadata?.client_id;
                    const { data: portalAccess } = await this.supabase
                        .from('client_portal_access')
                        .select('user_id')
                        .eq('user_id', coachId)
                        .limit(1)
                        .maybeSingle();

                    if (isGymClientMetadata || !!portalAccess) {
                        return null;
                    }

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
                const { ownedIds, staffIds } = await this.getCoachGymIds(coachId);
                const gymIds = [...new Set([...ownedIds, ...staffIds])];
                const storedGymId = this.getStoredGymId(coachId);
                const activeGymId = storedGymId && gymIds.includes(storedGymId)
                    ? storedGymId
                    : (ownedIds[0] || staffIds[0] || null);

                (coach as any).gymId = activeGymId;
                (coach as any).gymIds = gymIds;
                this.storeGymId(coachId, activeGymId);
            }

            coach = this.normalizeCoach(coach);

            this.profileCache.set(coachId, {
                data: coach,
                expiresAt: Date.now() + this.profileCacheTtlMs
            });

            if (coach) this.currentCoach.set(coach);
            return coach;
        } finally {
            this.loading.set(false);
        }
    }

    async getAllCoaches(): Promise<Coach[]> {
        try {
            this.loading.set(true);
            const coaches = await this.firestoreService.getCollection<Coach>('coaches');
            return coaches.map((coach) => this.normalizeCoach(coach) as Coach);
        } finally {
            this.loading.set(false);
        }
    }

    async deleteCoach(coachId: string): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.deleteDocument('coaches', coachId);
            this.profileCache.delete(coachId);
            if (this.currentCoach()?.id === coachId) this.currentCoach.set(null);
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

            this.profileCache.delete(coachId);
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
        this.profileCache.delete(coachId);

        const currentCoach = this.currentCoach();
        if (currentCoach && currentCoach.id === coachId) {
            this.currentCoach.set({
                ...currentCoach,
                accountType,
                updatedAt: new Date()
            });
        }
    }

    async setActiveGymContext(coachId: string, gymId: string): Promise<Coach> {
        const { ownedIds, staffIds } = await this.getCoachGymIds(coachId);
        const gymIds = [...new Set([...ownedIds, ...staffIds])];
        if (!gymIds.includes(gymId)) {
            throw new Error('No tienes acceso a este gimnasio.');
        }

        this.storeGymId(coachId, gymId);
        this.profileCache.delete(coachId);
        const coach = await this.getCoachProfile(coachId);
        if (!coach) throw new Error('No se pudo cargar el perfil del entrenador.');
        return coach;
    }

    invalidateProfile(coachId: string): void {
        this.profileCache.delete(coachId);
        if (this.currentCoach()?.id === coachId) this.currentCoach.set(null);
    }

    isPaidIndependentCoach(coach: Coach | null | undefined): boolean {
        return isPaidIndependentCoach(this.normalizeCoach(coach));
    }
}
