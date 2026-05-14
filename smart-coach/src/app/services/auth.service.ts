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
import { environment } from '../../environments/environment';

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
    profileResolved = signal<boolean>(false);
    private rehydratingSession = false;
    private static readonly AUTH_REDIRECT_BASE_URL = environment.appUrl;

    private getAuthRedirectBaseUrl(): string {
        return AuthService.AUTH_REDIRECT_BASE_URL;
    }

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
            this.profileResolved.set(false);
            await this.resolveProfileSafely(user);
        } catch (error) {
            console.error('Error initializing auth:', error);
            this.userSubject.next(null);
            this.currentUser.set(null);
            this.isAdmin.set(false);
            this.isGymClient.set(false);
            this.gymClientProfile.set(null);
            this.profileResolved.set(true);
        } finally {
            this.authReadySubject.next(true);
        }

        this.supabase.auth.onAuthStateChange(async (_event, session) => {
            try {
                const nextUser = session?.user || null;
                this.userSubject.next(nextUser);
                this.currentUser.set(nextUser);
                this.profileResolved.set(false);
                await this.resolveProfileSafely(nextUser);
            } catch (error) {
                console.error('Error handling auth state change:', error);
                this.profileResolved.set(true);
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
        } finally {
            this.profileResolved.set(true);
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
                this.profileResolved.set(false);
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
            this.profileResolved.set(true);
            return;
        }

        const metadata: any = user.user_metadata || {};
        const looksLikePortalClient =
            metadata?.role === 'gym_client' ||
            metadata?.role === 'independent_client' ||
            metadata?.account_type === 'gym_client' ||
            metadata?.account_type === 'independent_client' ||
            !!metadata?.client_id;

        // Resolve client-portal profile first to avoid accidentally provisioning coach profiles.
        // to avoid accidentally provisioning coach profiles for client users.
        try {
            const clientProfile = await this.gymClientService.getClientProfile(user.id);
            if (clientProfile) {
                this.isGymClient.set(true);
                this.gymClientProfile.set(clientProfile);
                this.isAdmin.set(false);
                this.profileResolved.set(true);
                return;
            }
        } catch (error) {
            console.error('Error resolving client portal profile:', error);
        }

        // Self-heal missing portal-access rows and retry profile resolution once.
        try {
            await this.activateGymClientAccessForCurrentUser();
            await this.activateIndependentClientAccessForCurrentUser();
            const gymProfileAfterRepair = await this.gymClientService.getClientProfile(user.id);
            if (gymProfileAfterRepair) {
                this.isGymClient.set(true);
                this.gymClientProfile.set(gymProfileAfterRepair);
                this.isAdmin.set(false);
                this.profileResolved.set(true);
                return;
            }
        } catch (error) {
            console.error('Error repairing client portal access:', error);
        }

        if (looksLikePortalClient) {
            this.isAdmin.set(false);
            this.isGymClient.set(false);
            this.gymClientProfile.set(null);
            this.profileResolved.set(true);
            return;
        }

        try {
            const coach = await this.coachService.getCoachProfile(user.id, { autoProvisionMissingProfile: false });
            if (coach) {
                this.isAdmin.set(coach.role === 'admin');
                this.isGymClient.set(false);
                this.gymClientProfile.set(null);
                this.profileResolved.set(true);
                return;
            }
        } catch (error) {
            console.error('Error resolving coach profile:', error);
        }

        // OAuth first-login fallback:
        // If user exists in auth but has no app profile yet, provision a coach profile.
        try {
            const createdCoach = await this.ensureCoachProfileForUser(user);
            if (createdCoach) {
                this.isAdmin.set(createdCoach.role === 'admin');
                this.isGymClient.set(false);
                this.gymClientProfile.set(null);
                this.profileResolved.set(true);
                return;
            }
        } catch (error) {
            console.error('Error provisioning coach profile:', error);
        }

        this.isAdmin.set(false);
        this.isGymClient.set(false);
        this.gymClientProfile.set(null);
        this.profileResolved.set(true);
    }

    private async ensureCoachProfileForUser(user: any): Promise<any | null> {
        if (!user?.id) return null;

        const metadata = user.user_metadata || {};
        if (
            metadata?.role === 'gym_client' ||
            metadata?.role === 'independent_client' ||
            metadata?.account_type === 'gym_client' ||
            metadata?.account_type === 'independent_client' ||
            !!metadata?.client_id
        ) {
            return null;
        }

        try {
            const { data: portalAccess } = await this.supabase
                .from('client_portal_access')
                .select('user_id')
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();
            const { data: independentPortalAccess } = await this.supabase
                .from('independent_client_portal_access')
                .select('user_id')
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();
            if (portalAccess || independentPortalAccess) return null;
        } catch {
            // Best effort guard only.
        }
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

    private async hasExistingCoachProfile(userId: string): Promise<boolean> {
        if (!userId) return false;
        const coach = await this.coachService
            .getCoachProfile(userId, { autoProvisionMissingProfile: false })
            .catch(() => null);
        return !!coach;
    }

    async signUpWithEmail(
        email: string,
        password: string,
        name: string
    ): Promise<{ requiresEmailConfirmation: boolean }> {
        try {
            this.loading.set(true);
            const normalizedEmail = email.trim().toLowerCase();

            const emailExists = await this.isEmailAlreadyRegistered(normalizedEmail);
            if (emailExists) {
                throw new Error('user already registered');
            }

            const { data, error } = await this.supabase.auth.signUp({
                email: normalizedEmail,
                password
            });
            if (error) throw error;

            const user = data.user;
            if (!user) throw new Error('No se pudo crear el usuario.');

            // If email confirmation is enabled, Supabase may return a user without an active session yet.
            // In that case, profile creation must wait until the first confirmed login.
            if (!data.session) {
                return { requiresEmailConfirmation: true };
            }

            await this.coachService.createCoachProfile({ email: normalizedEmail, name }, user.id);
            await this.usageService.logLogin(user.id, 'coach');
            this.router.navigate(['/dashboard']);
            return { requiresEmailConfirmation: false };
        } catch (error: any) {
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    async register(
        data: { email: string, password: string, name: string }
    ): Promise<{ requiresEmailConfirmation: boolean }> {
        return this.signUpWithEmail(data.email, data.password, data.name);
    }

    async signInWithEmail(email: string, password: string): Promise<void> {
        try {
            this.loading.set(true);
            const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            const uid = data.user?.id;
            if (!uid) throw new Error('No se encontró usuario autenticado.');

            // Ensure client portal link exists before deciding role routing.
            await this.activateGymClientAccessForCurrentUser().catch(() => null);
            await this.activateIndependentClientAccessForCurrentUser().catch(() => null);

            const gymProfile = await this.gymClientService.getClientProfile(uid);
            if (gymProfile) {
                await this.usageService.logLogin(uid, `${gymProfile.scope}_client`);
                this.router.navigate(['/client/portal']);
                return;
            }

            const coach = await this.coachService
                .getCoachProfile(uid, { autoProvisionMissingProfile: false })
                .catch(() => null);
            if (coach) {
                await this.usageService.logLogin(uid, coach.role || 'coach');
                this.router.navigate(['/dashboard']);
                return;
            }

            const createdCoach = await this.ensureCoachProfileForUser(data.user).catch(() => null);
            if (createdCoach) {
                await this.usageService.logLogin(uid, createdCoach.role || 'coach');
                this.router.navigate(['/dashboard']);
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
                    redirectTo: `${this.getAuthRedirectBaseUrl()}/dashboard`
                }
            });
            if (error) throw error;
        } catch (error: any) {
            throw this.buildAuthError(error);
        } finally {
            this.loading.set(false);
        }
    }

    async getClientPortalProfileForUser(userId: string) {
        return this.gymClientService.getClientProfile(userId);
    }

    async establishRecoverySessionFromUrl(): Promise<any | null> {
        if (typeof window === 'undefined') {
            const { data } = await this.supabase.auth.getSession();
            return data.session?.user || null;
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const searchParams = new URLSearchParams(window.location.search);
        const recoveryType = hashParams.get('type') || searchParams.get('type');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const code = searchParams.get('code');
        const looksLikeRecoveryLink =
            recoveryType === 'recovery' || (!!accessToken && !!refreshToken) || !!code;

        if (!looksLikeRecoveryLink) {
            return this.ensureSession();
        }

        const clearRecoveryUrl = () => {
            const cleanUrl = `${window.location.origin}${window.location.pathname}`;
            window.history.replaceState({}, document.title, cleanUrl);
        };

        await this.supabase.auth.signOut({ scope: 'local' }).catch(() => null);

        if (accessToken && refreshToken) {
            const { data, error } = await this.supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
            });
            if (error) throw error;
            clearRecoveryUrl();
            const nextUser = data.session?.user || null;
            this.userSubject.next(nextUser);
            this.currentUser.set(nextUser);
            this.profileResolved.set(false);
            await this.resolveProfileSafely(nextUser);
            return nextUser;
        }

        if (code) {
            const { data, error } = await this.supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            clearRecoveryUrl();
            const nextUser = data.session?.user || null;
            this.userSubject.next(nextUser);
            this.currentUser.set(nextUser);
            this.profileResolved.set(false);
            await this.resolveProfileSafely(nextUser);
            return nextUser;
        }

        return this.ensureSession();
    }

    async sendPasswordReset(email: string): Promise<void> {
        try {
            this.loading.set(true);
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${this.getAuthRedirectBaseUrl()}/set-password`
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

    private buildInviteRateLimitError(message: string): Error & { code: string } {
        const err = new Error(message) as Error & { code: string };
        err.code = 'INVITE_RATE_LIMIT';
        return err;
    }

    async inviteGymClient(
        gymId: string,
        clientId: string,
        email: string,
        _gymName: string,
        options?: { skipSignup?: boolean }
    ): Promise<void> {
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();
        const inviteCooldownMs = 120_000;
        const skipSignup = !!options?.skipSignup;

        const { data: membershipRow } = await this.supabase
            .from('client_gym_memberships')
            .select('portal_invited_at')
            .eq('gym_id', gymId)
            .eq('client_id', clientId)
            .maybeSingle();

        const invitedAt = membershipRow?.portal_invited_at ? new Date(membershipRow.portal_invited_at).getTime() : null;
        if (invitedAt && nowMs - invitedAt < inviteCooldownMs) {
            const remainingSeconds = Math.ceil((inviteCooldownMs - (nowMs - invitedAt)) / 1000);
            throw this.buildInviteRateLimitError(`Espera ${remainingSeconds}s antes de reenviar la invitación.`);
        }

        // 1) Ensure auth user exists through admin RPC (idempotent)
        const { data: authUserId, error: ensureUserErr } = await this.supabase.rpc(
            'admin_ensure_auth_user_for_email',
            {
                p_email: email,
                p_gym_id: gymId,
                p_client_id: clientId,
                p_role: 'gym_client',
                p_user_metadata: {
                    role: 'gym_client',
                    gym_id: gymId,
                    client_id: clientId
                }
            }
        );

        if (ensureUserErr) {
            const message = `${ensureUserErr?.message || ''}`.toLowerCase();
            const status = (ensureUserErr as any)?.status;
            if (status === 429 || message.includes('rate limit')) {
                throw this.buildInviteRateLimitError(
                    'Supabase limitó temporalmente la creación de cuentas. Intenta de nuevo en 1-2 minutos.'
                );
            }
            throw ensureUserErr;
        }

        if (!authUserId) {
            throw new Error('No se pudo crear o resolver el usuario de autenticación para el cliente.');
        }

        if (authUserId) {
            // Keep relational link in sync so admin/cleanup flows can resolve auth user deterministically.
            const { error: linkErr } = await this.supabase
                .from('clients')
                .update({
                    user_id: authUserId,
                    updated_at: nowIso
                })
                .eq('id', clientId);
            if (linkErr) throw linkErr;
        }

        // 2) Send email so client sets or recovers their password
        const { error: resetErr } = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${this.getAuthRedirectBaseUrl()}/set-password?mode=invite`
        });
        if (resetErr) {
            const msg = `${resetErr?.message || ''}`.toLowerCase();
            const status = (resetErr as any)?.status;
            if (status === 429 || msg.includes('rate limit')) {
                if (skipSignup) {
                    throw this.buildInviteRateLimitError(
                        'Ya existe acceso del cliente, pero Supabase limitó temporalmente el envío del correo. Intenta de nuevo en 1-2 minutos.'
                    );
                }
                throw this.buildInviteRateLimitError(
                    'La cuenta del cliente ya quedó creada, pero Supabase limitó temporalmente el envío del correo. Intenta de nuevo en 1-2 minutos.'
                );
            }
            throw resetErr;
        }

        // 3) Mark portal invitation state only after a successful email request.
        const { error: membershipErr } = await this.supabase
            .from('client_gym_memberships')
            .update({
                portal_status: 'pending',
                portal_invited_at: nowIso,
                updated_at: nowIso
            })
            .eq('gym_id', gymId)
            .eq('client_id', clientId);
        if (membershipErr) throw membershipErr;
    }

    async inviteIndependentClient(
        coachId: string,
        clientId: string,
        email: string,
        _coachName: string,
        options?: { skipSignup?: boolean }
    ): Promise<void> {
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();
        const inviteCooldownMs = 120_000;
        const skipSignup = !!options?.skipSignup;

        const { data: clientRow } = await this.supabase
            .from('clients')
            .select('portal_invited_at')
            .eq('id', clientId)
            .maybeSingle();

        const invitedAt = clientRow?.portal_invited_at ? new Date(clientRow.portal_invited_at).getTime() : null;
        if (invitedAt && nowMs - invitedAt < inviteCooldownMs) {
            const remainingSeconds = Math.ceil((inviteCooldownMs - (nowMs - invitedAt)) / 1000);
            throw this.buildInviteRateLimitError(`Espera ${remainingSeconds}s antes de reenviar la invitación.`);
        }

        const { data: authUserId, error: ensureUserErr } = await this.supabase.rpc(
            'admin_ensure_auth_user_for_email',
            {
                p_email: email,
                p_gym_id: null,
                p_client_id: clientId,
                p_role: 'independent_client',
                p_user_metadata: {
                    role: 'independent_client',
                    coach_id: coachId,
                    client_id: clientId
                }
            }
        );

        if (ensureUserErr) {
            const message = `${ensureUserErr?.message || ''}`.toLowerCase();
            const status = (ensureUserErr as any)?.status;
            if (status === 429 || message.includes('rate limit')) {
                throw this.buildInviteRateLimitError(
                    'Supabase limitó temporalmente la creación de cuentas. Intenta de nuevo en 1-2 minutos.'
                );
            }
            throw ensureUserErr;
        }

        if (!authUserId) {
            throw new Error('No se pudo crear o resolver el usuario de autenticación para el cliente.');
        }

        const { error: linkErr } = await this.supabase
            .from('clients')
            .update({
                user_id: authUserId,
                portal_status: 'pending',
                portal_invited_at: nowIso,
                updated_at: nowIso
            })
            .eq('id', clientId);
        if (linkErr) throw linkErr;

        const { error: accessErr } = await this.supabase
            .from('independent_client_portal_access')
            .upsert(
                {
                    user_id: authUserId,
                    coach_id: coachId,
                    client_id: clientId
                },
                { onConflict: 'user_id,client_id' }
            );
        if (accessErr) throw accessErr;

        const { error: resetErr } = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${this.getAuthRedirectBaseUrl()}/set-password?mode=invite`
        });
        if (resetErr) {
            const msg = `${resetErr?.message || ''}`.toLowerCase();
            const status = (resetErr as any)?.status;
            if (status === 429 || msg.includes('rate limit')) {
                if (skipSignup) {
                    throw this.buildInviteRateLimitError(
                        'Ya existe acceso del cliente, pero Supabase limitó temporalmente el envío del correo. Intenta de nuevo en 1-2 minutos.'
                    );
                }
                throw this.buildInviteRateLimitError(
                    'La cuenta del cliente ya quedó creada, pero Supabase limitó temporalmente el envío del correo. Intenta de nuevo en 1-2 minutos.'
                );
            }
            throw resetErr;
        }
    }

    async updateCurrentUserPassword(password: string): Promise<void> {
        const { error } = await this.supabase.auth.updateUser({ password });
        if (error) throw error;
    }

    async activateGymClientAccessForCurrentUser(): Promise<void> {
        const { data, error } = await this.supabase.auth.getUser();
        if (error) throw error;
        const user = data.user;
        if (!user) throw new Error('No hay sesión activa para completar la activación.');

        if (await this.hasExistingCoachProfile(user.id)) {
            return;
        }

        const nowIso = new Date().toISOString();
        const metadata = user.user_metadata || {};
        let clientId = typeof metadata['client_id'] === 'string' ? metadata['client_id'] : null;

        if (!clientId && user.email) {
            const { data: byEmail } = await this.supabase
                .from('clients')
                .select('id')
                .ilike('email', user.email)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            clientId = byEmail?.id || null;
        }

        if (!clientId) return;

        const { data: memberships, error: membershipsErr } = await this.supabase
            .from('client_gym_memberships')
            .select('id')
            .eq('client_id', clientId);
        if (membershipsErr) throw membershipsErr;

        for (const membership of memberships || []) {
            const { error: accessErr } = await this.supabase
                .from('client_portal_access')
                .upsert(
                    {
                        user_id: user.id,
                        client_gym_membership_id: membership.id
                    },
                    { onConflict: 'user_id,client_gym_membership_id' }
                );
            if (accessErr) throw accessErr;
        }

        const { error: membershipErr } = await this.supabase
            .from('client_gym_memberships')
            .update({
                portal_status: 'active',
                updated_at: nowIso
            })
            .eq('client_id', clientId);
        if (membershipErr) throw membershipErr;
    }

    async activateIndependentClientAccessForCurrentUser(): Promise<void> {
        const { data, error } = await this.supabase.auth.getUser();
        if (error) throw error;
        const user = data.user;
        if (!user) throw new Error('No hay sesión activa para completar la activación.');

        if (await this.hasExistingCoachProfile(user.id)) {
            return;
        }

        const nowIso = new Date().toISOString();
        const metadata = user.user_metadata || {};
        let clientId = typeof metadata['client_id'] === 'string' ? metadata['client_id'] : null;
        const coachId = typeof metadata['coach_id'] === 'string' ? metadata['coach_id'] : null;

        if (!clientId && user.email) {
            const { data: byEmail } = await this.supabase
                .from('clients')
                .select('id')
                .ilike('email', user.email)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            clientId = byEmail?.id || null;
        }

        if (!clientId) return;

        const { error: accessErr } = await this.supabase
            .from('independent_client_portal_access')
            .upsert(
                {
                    user_id: user.id,
                    client_id: clientId,
                    coach_id: coachId
                },
                { onConflict: 'user_id,client_id' }
            );
        if (accessErr) throw accessErr;

        const { error: clientErr } = await this.supabase
            .from('clients')
            .update({
                user_id: user.id,
                portal_status: 'active',
                updated_at: nowIso
            })
            .eq('id', clientId);
        if (clientErr) throw clientErr;
    }

    private async isEmailAlreadyRegistered(email: string): Promise<boolean> {
        const normalizedEmail = (email || '').trim().toLowerCase();
        if (!normalizedEmail) return false;

        const [coachRes, clientRes] = await Promise.all([
            this.supabase
                .from('coaches')
                .select('id')
                .ilike('email', normalizedEmail)
                .limit(1),
            this.supabase
                .from('clients')
                .select('id')
                .ilike('email', normalizedEmail)
                .limit(1)
        ]);

        if (coachRes.error) throw coachRes.error;
        if (clientRes.error) throw clientRes.error;

        return (coachRes.data?.length || 0) > 0 || (clientRes.data?.length || 0) > 0;
    }

    private getErrorMessage(code: string): string {
        const normalized = (code || '').toLowerCase();

        switch (normalized) {
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
                if (normalized.includes('email not confirmed') || normalized.includes('not confirmed')) {
                    return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada o spam.';
                }
                if (normalized.includes('unauthorized') || normalized.includes('jwt')) {
                    return 'No se pudo completar el registro todavía. Revisa tu correo para confirmar la cuenta e intenta iniciar sesión.';
                }
                if (normalized.includes('invalid login credentials')) {
                    return 'Correo o contraseña incorrectos.';
                }
                if (normalized.includes('user already registered')) {
                    return 'Este correo ya está registrado.';
                }
                if (normalized.includes('email address') && normalized.includes('invalid')) {
                    return 'El correo electrónico no es válido.';
                }
                if (normalized.includes('password should be at least')) {
                    return 'La contraseña es muy débil. Usa al menos 6 caracteres.';
                }
                if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
                    return 'Se alcanzó el límite de intentos. Espera un momento e inténtalo de nuevo.';
                }
                if (normalized.includes('database error') || normalized.includes('unexpected_failure')) {
                    return 'No se pudo completar el registro en este momento. Inténtalo nuevamente en unos minutos.';
                }
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

    isClientPortalUser(): boolean {
        return this.isGymClient();
    }
}
