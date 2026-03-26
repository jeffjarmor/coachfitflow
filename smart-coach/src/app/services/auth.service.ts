import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { CoachService } from './coach.service';
import { UsageService } from './usage.service';
import { GymClientService } from './gym-client.service';
import { GymClientProfile } from '../models/gym-client.model';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private router = inject(Router);
    private coachService = inject(CoachService);
    private usageService = inject(UsageService);
    private gymClientService = inject(GymClientService);
    private supabase = inject(SupabaseService).client;

    private userSubject = new BehaviorSubject<any | null>(null);
    user$ = this.userSubject.asObservable();
    private authReadySubject = new BehaviorSubject<boolean>(false);
    authReady$ = this.authReadySubject.asObservable();

    currentUser = signal<any | null>(null);
    loading = signal<boolean>(false);
    isAdmin = signal<boolean>(false);
    isGymClient = signal<boolean>(false);
    gymClientProfile = signal<GymClientProfile | null>(null);
    private rehydratingSession = false;

    constructor() {
        this.initializeAuth();
        this.setupBrowserSessionRecovery();
    }

    private async initializeAuth(): Promise<void> {
        try {
            const { data } = await this.supabase.auth.getSession();
            const user = data.session?.user || null;
            this.userSubject.next(user);
            this.currentUser.set(user);
            await this.resolveProfileSafely(user);
        } catch (error) {
            console.error('Error initializing auth:', error);
            this.userSubject.next(null);
            this.currentUser.set(null);
            this.isAdmin.set(false);
            this.isGymClient.set(false);
            this.gymClientProfile.set(null);
        } finally {
            this.authReadySubject.next(true);
        }

        this.supabase.auth.onAuthStateChange(async (_event, session) => {
            try {
                const nextUser = session?.user || null;
                this.userSubject.next(nextUser);
                this.currentUser.set(nextUser);
                await this.resolveProfileSafely(nextUser);
            } catch (error) {
                console.error('Error handling auth state change:', error);
            }
        });
    }

    private async resolveProfileSafely(user: any | null): Promise<void> {
        try {
            await Promise.race([
                this.resolveProfile(user),
                new Promise<void>((resolve) => setTimeout(resolve, 5000))
            ]);
        } catch (error) {
            console.error('Error resolving profile safely:', error);
        }
    }

    private setupBrowserSessionRecovery(): void {
        if (typeof window === 'undefined') return;

        window.addEventListener('pageshow', () => {
            void this.ensureSession();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                void this.ensureSession();
            }
        });
    }

    async ensureSession(): Promise<any | null> {
        if (this.rehydratingSession) return this.currentUser();
        this.rehydratingSession = true;

        try {
            const { data, error } = await this.supabase.auth.getSession();
            if (error) {
                console.error('Error ensuring session:', error);
                return this.currentUser();
            }

            const user = data.session?.user || null;
            const previousUserId = this.currentUser()?.id || null;
            const nextUserId = user?.id || null;

            if (previousUserId !== nextUserId || (!previousUserId && !!nextUserId)) {
                this.userSubject.next(user);
                this.currentUser.set(user);
                await this.resolveProfile(user);
            }

            return user;
        } catch (error) {
            console.error('Unexpected error ensuring session:', error);
            return this.currentUser();
        } finally {
            this.rehydratingSession = false;
        }
    }

    private async resolveProfile(user: any | null): Promise<void> {
        if (!user) {
            this.isAdmin.set(false);
            this.isGymClient.set(false);
            this.gymClientProfile.set(null);
            return;
        }

        try {
            const coach = await this.coachService.getCoachProfile(user.id);
            if (coach) {
                this.isAdmin.set(coach.role === 'admin');
                this.isGymClient.set(false);
                this.gymClientProfile.set(null);
                return;
            }
        } catch (error) {
            console.error('Error resolving coach profile:', error);
        }

        try {
            const gymProfile = await this.gymClientService.getClientProfile(user.id);
            if (gymProfile) {
                this.isGymClient.set(true);
                this.gymClientProfile.set(gymProfile);
                this.isAdmin.set(false);
                return;
            }
        } catch (error) {
            console.error('Error resolving gym client profile:', error);
        }

        // OAuth first-login fallback:
        // If user exists in auth but has no app profile yet, provision a coach profile.
        try {
            const createdCoach = await this.ensureCoachProfileForUser(user);
            if (createdCoach) {
                this.isAdmin.set(createdCoach.role === 'admin');
                this.isGymClient.set(false);
                this.gymClientProfile.set(null);
                return;
            }
        } catch (error) {
            console.error('Error provisioning coach profile:', error);
        }

        this.isAdmin.set(false);
        this.isGymClient.set(false);
        this.gymClientProfile.set(null);
    }

    private async ensureCoachProfileForUser(user: any): Promise<any | null> {
        if (!user?.id) return null;

        const metadata = user.user_metadata || {};
        const name =
            metadata.full_name ||
            metadata.name ||
            (typeof user.email === 'string' ? user.email.split('@')[0] : '') ||
            'Coach';

        await this.coachService.createCoachProfile(
            {
                email: user.email || '',
                name
            },
            user.id
        );

        return this.coachService.getCoachProfile(user.id);
    }

    async signUpWithEmail(email: string, password: string, name: string): Promise<void> {
        try {
            this.loading.set(true);
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password
            });
            if (error) throw error;

            const user = data.user;
            if (!user) throw new Error('No se pudo crear el usuario.');

            await this.coachService.createCoachProfile({ email, name }, user.id);
            await this.usageService.logLogin(user.id, 'coach');
            this.router.navigate(['/dashboard']);
        } catch (error: any) {
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    async register(data: { email: string, password: string, name: string }): Promise<void> {
        return this.signUpWithEmail(data.email, data.password, data.name);
    }

    async signInWithEmail(email: string, password: string): Promise<void> {
        try {
            this.loading.set(true);
            const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            const uid = data.user?.id;
            if (!uid) throw new Error('No se encontró usuario autenticado.');

            const coach = await this.coachService.getCoachProfile(uid).catch(() => null);
            if (coach) {
                await this.usageService.logLogin(uid, coach.role || 'coach');
                this.router.navigate(['/dashboard']);
                return;
            }

            const gymProfile = await this.gymClientService.getClientProfile(uid);
            if (gymProfile) {
                await this.usageService.logLogin(uid, 'gym_client');
                this.router.navigate(['/client/portal']);
                return;
            }

            this.router.navigate(['/dashboard']);
        } catch (error: any) {
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    async signInWithGoogle(): Promise<void> {
        try {
            this.loading.set(true);
            const { error } = await this.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`
                }
            });
            if (error) throw error;
        } catch (error: any) {
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    async sendPasswordReset(email: string): Promise<void> {
        try {
            this.loading.set(true);
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/login`
            });
            if (error) throw error;
        } finally {
            this.loading.set(false);
        }
    }

    private buildAuthError(error: any): Error & { code?: string } {
        const code = error?.code || error?.message || 'auth/unknown';
        const appError = new Error(this.getErrorMessage(code)) as Error & { code?: string };
        appError.code = code;
        return appError;
    }

    async logout(): Promise<void> {
        const { error } = await this.supabase.auth.signOut();
        if (error) throw error;
        this.router.navigate(['/login']);
    }

    async deleteCurrentAuthUser(): Promise<void> {
        throw new Error('La eliminación directa del usuario no está habilitada en cliente para Supabase.');
    }

    async deleteUserFromAuthViaFunction(uid: string): Promise<void> {
        const { error } = await this.supabase.rpc('admin_delete_auth_user', {
            target_user_id: uid
        });
        if (error) throw error;
    }

    async inviteGymClient(_gymId: string, _clientId: string, _email: string, _gymName: string): Promise<void> {
        throw new Error('Implementa un endpoint server-side para enviar invitaciones de cliente.');
    }

    private getErrorMessage(code: string): string {
        switch (code) {
            case 'user_already_exists':
            case 'auth/email-already-in-use':
                return 'Este correo ya está registrado.';
            case 'invalid_email':
            case 'auth/invalid-email':
                return 'El correo electrónico no es válido.';
            case 'weak_password':
            case 'auth/weak-password':
                return 'La contraseña es muy débil. Usa al menos 6 caracteres.';
            case 'invalid_credentials':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
                return 'Correo o contraseña incorrectos.';
            default:
                return 'Ocurrió un error. Inténtalo nuevamente.';
        }
    }

    getCurrentUserId(): string | null {
        return this.currentUser()?.id || null;
    }

    async waitForAuthReady(timeoutMs: number = 5000): Promise<void> {
        if (this.authReadySubject.value) return;
        const readyPromise = firstValueFrom(this.authReady$.pipe(filter(Boolean), take(1)));
        try {
            await Promise.race([
                readyPromise,
                new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Auth ready timeout')), timeoutMs))
            ]);
        } catch {
            // Do not leave views hanging forever on navigation history restores.
            await this.ensureSession();
            this.authReadySubject.next(true);
        }
    }

    isAuthenticated(): boolean {
        return this.currentUser() !== null;
    }
}
