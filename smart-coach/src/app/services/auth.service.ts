import { Injectable, inject, signal } from '@angular/core';
import {
    Auth,
    GoogleAuthProvider,
    User,
    createUserWithEmailAndPassword,
    deleteUser,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    user
} from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Observable, from } from 'rxjs';
import { CoachService } from './coach.service';
import { UsageService } from './usage.service';


@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth = inject(Auth);
    private router = inject(Router);
    private coachService = inject(CoachService);
    private usageService = inject(UsageService);

    // Current user observable from Firebase
    user$ = user(this.auth);

    // Signal for current user
    currentUser = signal<User | null>(null);

    // Signal for loading state
    loading = signal<boolean>(false);

    // Signal for admin role
    isAdmin = signal<boolean>(false);

    constructor() {
        // Subscribe to auth state changes
        this.user$.subscribe(async user => {
            console.log('Auth State Changed:', user?.uid);
            this.currentUser.set(user);
            if (user) {
                // Check coach profile for role
                try {
                    const coach = await this.coachService.getCoachProfile(user.uid);
                    console.log('Coach Profile Loaded:', coach);
                    console.log('Is Admin?', coach?.role === 'admin');
                    this.isAdmin.set(coach?.role === 'admin');
                } catch (error) {
                    console.error('Error loading coach profile for auth:', error);
                    this.isAdmin.set(false);
                }
            } else {
                this.isAdmin.set(false);
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
            console.error('Sign up error:', error);
            throw new Error(this.getErrorMessage(error.code));
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
     * Sign in with email and password
     */
    async signInWithEmail(email: string, password: string): Promise<void> {
        try {
            this.loading.set(true);
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);

            // Get coach profile to log role
            const coach = await this.coachService.getCoachProfile(userCredential.user.uid);
            await this.usageService.logLogin(userCredential.user.uid, coach?.role || 'coach');

            this.router.navigate(['/dashboard']);
        } catch (error: any) {
            console.error('Sign in error:', error);
            throw new Error(this.getErrorMessage(error.code));
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
            console.error('Google sign in error:', error);
            throw new Error(this.getErrorMessage(error.code));
        } finally {
            this.loading.set(false);
        }
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
                return 'This email is already registered.';
            case 'auth/invalid-email':
                return 'Invalid email address.';
            case 'auth/operation-not-allowed':
                return 'Operation not allowed.';
            case 'auth/weak-password':
                return 'Password is too weak. Please use at least 6 characters.';
            case 'auth/user-disabled':
                return 'This account has been disabled.';
            case 'auth/user-not-found':
                return 'No account found with this email.';
            case 'auth/wrong-password':
                return 'Incorrect password.';
            case 'auth/popup-closed-by-user':
                return 'Sign in popup was closed.';
            default:
                return 'An error occurred. Please try again.';
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
}
