import { Injectable, inject, signal } from '@angular/core';
import {
    Auth,
    GoogleAuthProvider,
    User,
    createUserWithEmailAndPassword,
    deleteUser,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    user
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Observable, from } from 'rxjs';
import { CoachService } from './coach.service';
import { UsageService } from './usage.service';
import { GymClientService } from './gym-client.service';
import { GymClientProfile } from '../models/gym-client.model';


@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth = inject(Auth);
    private router = inject(Router);
    private coachService = inject(CoachService);
    private usageService = inject(UsageService);
    private gymClientService = inject(GymClientService);

    // Current user observable from Firebase
    user$ = user(this.auth);

    // Signal for current user
    currentUser = signal<User | null>(null);

    // Signal for loading state
    loading = signal<boolean>(false);

    // Signal for admin role
    isAdmin = signal<boolean>(false);

    // Signals for gym client role
    isGymClient = signal<boolean>(false);
    gymClientProfile = signal<GymClientProfile | null>(null);

    constructor() {
        // Subscribe to auth state changes
        this.user$.subscribe(async user => {
            console.log('Auth State Changed:', user?.uid);
            this.currentUser.set(user);
            if (user) {
                // 1. Try to find a coach profile
                try {
                    const coach = await this.coachService.getCoachProfile(user.uid);
                    if (coach) {
                        console.log('Coach Profile Loaded:', coach);
                        this.isAdmin.set(coach?.role === 'admin');
                        this.isGymClient.set(false);
                        this.gymClientProfile.set(null);
                        return;
                    }
                } catch (error) {
                    console.error('Error loading coach profile for auth:', error);
                }

                // 2. No coach profile — check if this is a gym client
                try {
                    const gymProfile = await this.gymClientService.getClientProfile(user.uid);
                    if (gymProfile) {
                        console.log('Gym Client Profile Loaded:', gymProfile);
                        this.isGymClient.set(true);
                        this.gymClientProfile.set(gymProfile);
                        this.isAdmin.set(false);
                        return;
                    }
                } catch (error) {
                    console.error('Error loading gym client profile:', error);
                }

                // 3. Authenticated but no profile found
                this.isAdmin.set(false);
                this.isGymClient.set(false);
                this.gymClientProfile.set(null);
            } else {
                this.isAdmin.set(false);
                this.isGymClient.set(false);
                this.gymClientProfile.set(null);
            }
        });
    }

    /**
     * Sign up with email and password
     */
    async signUpWithEmail(email: string, password: string, name: string): Promise<void> {
        try {
            this.loading.set(true);
            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);

            // Create coach profile in Firestore
            await this.coachService.createCoachProfile({
                email: userCredential.user.email!,
                name: name
            }, userCredential.user.uid);

            // Log activity
            await this.usageService.logLogin(userCredential.user.uid, 'coach');

            this.router.navigate(['/dashboard']);
        } catch (error: any) {
            this.logAuthIssue('Sign up error', error);
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Register a new user (alias for signUpWithEmail)
     */
    async register(data: { email: string, password: string, name: string }): Promise<void> {
        return this.signUpWithEmail(data.email, data.password, data.name);
    }

    /**
     * Sign in with email and password.
     * Determines post-login redirect based on user type (coach vs gym client).
     */
    async signInWithEmail(email: string, password: string): Promise<void> {
        try {
            this.loading.set(true);
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);

            // Give the user$ subscriber time to resolve profile before navigating
            // (the subscriber handles redirect logic via signals)
            const uid = userCredential.user.uid;

            // Try coach profile first
            const coach = await this.coachService.getCoachProfile(uid).catch(() => null);
            if (coach) {
                await this.usageService.logLogin(uid, coach.role || 'coach');
                this.router.navigate(['/dashboard']);
                return;
            }

            // Try gym client profile
            const gymProfile = await this.gymClientService.getClientProfile(uid);
            if (gymProfile) {
                await this.usageService.logLogin(uid, 'gym_client');
                this.router.navigate(['/client/portal']);
                return;
            }

            // Fallback
            this.router.navigate(['/dashboard']);
        } catch (error: any) {
            this.logAuthIssue('Sign in error', error);
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Sign in with Google
     */
    async signInWithGoogle(): Promise<void> {
        try {
            this.loading.set(true);
            const provider = new GoogleAuthProvider();
            const userCredential = await signInWithPopup(this.auth, provider);

            // Check if coach profile exists, if not create one
            let coach = await this.coachService.getCoachProfile(userCredential.user.uid);

            if (!coach) {
                await this.coachService.createCoachProfile({
                    email: userCredential.user.email!,
                    name: userCredential.user.displayName || 'Coach'
                }, userCredential.user.uid);
                coach = await this.coachService.getCoachProfile(userCredential.user.uid);
            }

            // Log activity
            await this.usageService.logLogin(userCredential.user.uid, coach?.role || 'coach');

            this.router.navigate(['/dashboard']);
        } catch (error: any) {
            this.logAuthIssue('Google sign in error', error);
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Send password reset email
     */
    async sendPasswordReset(email: string): Promise<void> {
        try {
            this.loading.set(true);
            await sendPasswordResetEmail(this.auth, email);
        } catch (error: any) {
            this.logAuthIssue('Password reset error', error);
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    private buildAuthError(error: any): Error & { code?: string } {
        const appError = new Error(this.getErrorMessage(error?.code)) as Error & { code?: string };
        appError.code = error?.code;
        return appError;
    }

    private logAuthIssue(context: string, error: any): void {
        const expectedCodes = [
            'auth/email-already-in-use',
            'auth/invalid-email',
            'auth/weak-password',
            'auth/user-not-found',
            'auth/wrong-password',
            'auth/too-many-requests'
        ];

        if (expectedCodes.includes(error?.code)) {
            console.warn(`${context}:`, error);
            return;
        }

        console.error(`${context}:`, error);
    }

    /**
     * Sign out
     */
    async logout(): Promise<void> {
        try {
            await signOut(this.auth);
            this.router.navigate(['/login']);
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    /**
     * Delete currently authenticated Firebase Auth user
     * Note: Firebase may require recent sign-in for this operation.
     */
    async deleteCurrentAuthUser(): Promise<void> {
        const current = this.auth.currentUser;
        if (!current) {
            throw new Error('No authenticated user found');
        }

        await deleteUser(current);
        this.router.navigate(['/signup']);
    }

    /**
     * Get user-friendly error messages
     */
    private getErrorMessage(code: string): string {
        switch (code) {
            case 'auth/email-already-in-use':
                return 'Este correo ya está registrado.';
            case 'auth/invalid-email':
                return 'El correo electrónico no es válido.';
            case 'auth/operation-not-allowed':
                return 'Esta operación no está permitida.';
            case 'auth/weak-password':
                return 'La contraseña es muy débil. Usa al menos 6 caracteres.';
            case 'auth/user-disabled':
                return 'Esta cuenta fue deshabilitada.';
            case 'auth/user-not-found':
                return 'No existe una cuenta con ese correo.';
            case 'auth/wrong-password':
                return 'La contraseña es incorrecta.';
            case 'auth/too-many-requests':
                return 'Demasiados intentos. Intenta de nuevo más tarde.';
            case 'auth/popup-closed-by-user':
                return 'Se cerró la ventana de inicio con Google.';
            default:
                return 'Ocurrió un error. Inténtalo nuevamente.';
        }
    }

    /**
     * Get current user ID
     */
    getCurrentUserId(): string | null {
        return this.currentUser()?.uid || null;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.currentUser() !== null;
    }

    /**
     * Invite a gym client to the portal.
     * Calls the invite-gym-client Netlify Function.
     */
    async inviteGymClient(gymId: string, clientId: string, email: string, gymName: string): Promise<void> {
        const currentUser = this.auth.currentUser;
        if (!currentUser) throw new Error('No hay sesión activa.');

        const idToken = await currentUser.getIdToken();
        const origin = typeof window !== 'undefined' ? window.location.origin : '';

        const urls: string[] = [`${origin}/.netlify/functions/invite-gym-client`];
        if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
            urls.push('http://localhost:8888/.netlify/functions/invite-gym-client');
        }

        let lastError: Error | null = null;
        for (const url of urls) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ gymId, clientId, email, gymName })
                });

                const payload = await response.json().catch(() => null);

                if (response.ok) return;

                // In local dev the function might not be running — warn but don't block
                if (this.isLocalhost() && response.status === 404) {
                    console.warn('[AuthService] invite-gym-client no disponible en local.');
                    return;
                }

                lastError = new Error(payload?.message || 'Error al enviar la invitación.');
                console.error('[AuthService] invite-gym-client server error:', payload);
            } catch (err: any) {
                if (this.isLocalhost()) {
                    console.warn('[AuthService] No se pudo conectar con Netlify Function en local.', err);
                    return;
                }
                lastError = err instanceof Error ? err : new Error('Error al enviar la invitación.');
            }
        }

        throw lastError || new Error('Error al enviar la invitación.');
    }

    private isLocalhost(): boolean {
        if (typeof window === 'undefined') return false;
        return ['localhost', '127.0.0.1'].includes(window.location.hostname);
    }
}
