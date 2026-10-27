import { DEFAULT_BRAND_COLOR } from '../data/branding';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { ClientPortalDataService } from '../../features/client-portal/client-portal-data.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly portal = inject(ClientPortalDataService);
  private readonly userState = signal<User | null>(null);
  private readonly readyState = signal(false);
  private readonly initialization: Promise<void>;
  private sessionRecovery: Promise<User | null> | null = null;
  private readonly loginAudits = new Map<string, Promise<void>>();

  readonly user = this.userState.asReadonly();
  readonly ready = this.readyState.asReadonly();
  readonly isAuthenticated = computed(() => !!this.userState());

  constructor() {
    this.initialization = this.initialize();
    const { data: { subscription } } = this.supabase.auth.onAuthStateChange((event, session) => {
      // Keep callbacks synchronous: auth requests inside them can deadlock the SDK.
      this.userState.set(session?.user ?? null);
      this.readyState.set(true);
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        // OAuth callbacks also log activity. Run queries outside the auth callback.
        setTimeout(() => { void this.resolveSignedInSession(session); }, 0);
      }
    });
    const recover = () => { void this.ensureSession(); };
    const recoverVisible = () => { if (document.visibilityState === 'visible') recover(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', recover);
      document.addEventListener('visibilitychange', recoverVisible);
    }
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pageshow', recover);
        document.removeEventListener('visibilitychange', recoverVisible);
      }
    });
  }

  private async initialize(): Promise<void> {
    await this.ensureSession();
    this.readyState.set(true);
  }

  async waitUntilReady(): Promise<void> {
    await this.initialization;
  }

  async ensureSession(): Promise<User | null> {
    if (this.sessionRecovery) return this.sessionRecovery;
    this.sessionRecovery = (async () => {
      try {
        const { data, error } = await this.supabase.auth.getSession();
        if (!error) this.userState.set(data.session?.user ?? null);
      } catch {
        // A temporary connection error should not discard the current identity.
      }
      return this.userState();
    })();
    try {
      return await this.sessionRecovery;
    } finally {
      this.sessionRecovery = null;
    }
  }

  async signIn(email: string, password: string): Promise<'/dashboard' | '/client/portal'> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(this.translateAuthError(error.message));
    if (data.user) {
      try {
        const contexts = await this.portal.listContexts(data.user.id);
        if (contexts.length > 0) {
          await this.portal.activateLinkedAccesses().catch(() => undefined);
          const context = this.portal.initialContext(data.user.id, contexts);
          // The portal guard enforces the subscription gate before rendering data.
          if (data.session) await this.recordLogin(data.session, `${context?.scope || contexts[0].scope}_client`);
          return '/client/portal';
        }
      } catch {
        throw new Error('No pudimos verificar el acceso de tu cuenta. Revisa tu conexión e inténtalo de nuevo.');
      }
      const role = await this.ensureCoachProfile(data.user);
      if (role && data.session) await this.recordLogin(data.session, role);
    }
    return '/dashboard';
  }

  async homePath(): Promise<'/dashboard' | '/client/portal'> {
    const user = this.userState();
    if (!user) return '/dashboard';
    try {
      return (await this.portal.listContexts(user.id)).length ? '/client/portal' : '/dashboard';
    } catch {
      // Metadata only chooses a safe retry screen; the portal guard still verifies DB access.
      return this.hasClientMetadata(user) ? '/client/portal' : '/dashboard';
    }
  }

  async signUp(name: string, email: string, password: string): Promise<{ requiresEmailConfirmation: boolean }> {
    const normalizedEmail = email.trim().toLocaleLowerCase('es');
    const normalizedName = name.trim();
    const { data, error } = await this.supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: this.buildRedirectUrl('/login?registered=1'),
        data: {
          name: normalizedName,
          full_name: normalizedName,
          role: 'coach',
          account_type: 'independent'
        }
      }
    });

    if (error) throw new Error(this.translateSignUpError(error.message));
    if (!data.user || data.user.identities?.length === 0) {
      throw new Error('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.');
    }

    if (data.session) {
      await this.ensureCoachProfile(data.user);
      await this.recordLogin(data.session, 'coach');
      return { requiresEmailConfirmation: false };
    }

    return { requiresEmailConfirmation: true };
  }

  async ensureCoachProfileForCurrentUser(): Promise<void> {
    const user = this.userState();
    if (user) await this.ensureCoachProfile(user);
  }

  async signInWithGoogle(): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: this.buildRedirectUrl('/dashboard') }
    });
    if (error) throw new Error('No fue posible continuar con Google. Inténtalo nuevamente.');
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: this.buildRedirectUrl('/set-password')
    });
    if (error) throw new Error('No pudimos enviar el correo de recuperación.');
  }

  async inviteIndependentClient(coachId: string, clientId: string, email: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { data: clientRow, error: clientError } = await this.supabase
      .from('clients')
      .select('portal_invited_at')
      .eq('id', clientId)
      .eq('primary_coach_id', coachId)
      .single();
    if (clientError) throw clientError;

    const invitedAt = clientRow?.portal_invited_at ? new Date(clientRow.portal_invited_at).getTime() : 0;
    if (invitedAt && Date.now() - invitedAt < 120_000) {
      const remaining = Math.ceil((120_000 - (Date.now() - invitedAt)) / 1000);
      throw new Error(`Espera ${remaining} segundos antes de reenviar la invitación.`);
    }

    const { data: authUserId, error: ensureUserError } = await this.supabase.rpc('admin_ensure_auth_user_for_email', {
      p_email: email.trim().toLocaleLowerCase('es'),
      p_gym_id: null,
      p_client_id: clientId,
      p_role: 'independent_client',
      p_user_metadata: { role: 'independent_client', coach_id: coachId, client_id: clientId }
    });
    if (ensureUserError) {
      if (this.isRateLimitError(ensureUserError)) {
        throw this.portalInviteError(
          'Supabase limitó temporalmente la creación de accesos. Intenta de nuevo en 1 o 2 minutos.',
          'INVITE_RATE_LIMIT'
        );
      }
      throw ensureUserError;
    }
    if (!authUserId) throw new Error('No se pudo preparar el acceso del cliente.');

    const { error: linkError } = await this.supabase
      .from('clients')
      .update({ user_id: authUserId, portal_status: 'pending', portal_invited_at: nowIso, updated_at: nowIso })
      .eq('id', clientId)
      .eq('primary_coach_id', coachId);
    if (linkError) throw linkError;

    const { error: accessError } = await this.supabase
      .from('independent_client_portal_access')
      .upsert({ user_id: authUserId, coach_id: coachId, client_id: clientId }, { onConflict: 'user_id,client_id' });
    if (accessError) throw accessError;

    const { error: emailError } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: this.buildRedirectUrl('/set-password?mode=invite')
    });
    if (emailError) {
      if (this.isRateLimitError(emailError)) {
        throw this.portalInviteError(
          'El acceso quedó preparado, pero Supabase limitó temporalmente el correo. Reintenta en 1 o 2 minutos.',
          'INVITE_RATE_LIMIT'
        );
      }
      throw this.portalInviteError(
        'El acceso quedó preparado, pero no pudimos enviar el correo. Inténtalo nuevamente.',
        'INVITE_EMAIL_FAILED'
      );
    }
  }

  async inviteGymClient(gymId: string, clientId: string, email: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const { data: membership, error: membershipError } = await this.supabase
      .from('client_gym_memberships')
      .select('id,portal_invited_at')
      .eq('gym_id', gymId)
      .eq('client_id', clientId)
      .single();
    if (membershipError) throw membershipError;

    const invitedAt = membership.portal_invited_at ? new Date(membership.portal_invited_at).getTime() : 0;
    if (invitedAt && Date.now() - invitedAt < 120_000) {
      const remaining = Math.ceil((120_000 - (Date.now() - invitedAt)) / 1000);
      throw new Error(`Espera ${remaining} segundos antes de reenviar la invitación.`);
    }

    const { data: authUserId, error: ensureUserError } = await this.supabase.rpc('admin_ensure_auth_user_for_email', {
      p_email: email.trim().toLocaleLowerCase('es'),
      p_gym_id: gymId,
      p_client_id: clientId,
      p_role: 'gym_client',
      p_user_metadata: { role: 'gym_client', gym_id: gymId, client_id: clientId }
    });
    if (ensureUserError) {
      if (this.isRateLimitError(ensureUserError)) {
        throw this.portalInviteError('Supabase limitó temporalmente la creación de accesos. Intenta de nuevo en 1 o 2 minutos.', 'INVITE_RATE_LIMIT');
      }
      throw ensureUserError;
    }
    if (!authUserId) throw new Error('No se pudo preparar el acceso del cliente.');

    const { error: accessError } = await this.supabase
      .from('client_portal_access')
      .upsert({ user_id: authUserId, client_gym_membership_id: membership.id }, { onConflict: 'user_id,client_gym_membership_id' });
    if (accessError) throw accessError;

    const { error: statusError } = await this.supabase
      .from('client_gym_memberships')
      .update({ portal_status: 'pending', portal_invited_at: nowIso, updated_at: nowIso })
      .eq('id', membership.id);
    if (statusError) throw statusError;

    const { error: emailError } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: this.buildRedirectUrl('/set-password?mode=invite')
    });
    if (emailError) {
      if (this.isRateLimitError(emailError)) {
        throw this.portalInviteError('El acceso quedó preparado, pero Supabase limitó temporalmente el correo. Reintenta en 1 o 2 minutos.', 'INVITE_RATE_LIMIT');
      }
      throw this.portalInviteError('El acceso quedó preparado, pero no pudimos enviar el correo. Inténtalo nuevamente.', 'INVITE_EMAIL_FAILED');
    }
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    this.userState.set(null);
  }

  private buildRedirectUrl(path: `/${string}`): string {
    return new URL(path, window.location.origin).toString();
  }

  private async ensureCoachProfile(user: User): Promise<string | null> {
    const metadata = user.user_metadata || {};
    if (this.hasClientMetadata(user)) return null;

    const { data: existing, error: lookupError } = await this.supabase
      .from('coaches')
      .select('id,role')
      .eq('id', user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing.role || 'coach';

    const fallbackName = user.email?.split('@')[0] || 'Coach';
    const name = String(metadata['full_name'] || metadata['name'] || fallbackName).trim();
    const { error } = await this.supabase.from('coaches').insert({
      id: user.id,
      email: user.email || '',
      name,
      role: 'coach',
      account_type: 'independent',
      coach_plan: 'standard',
      brand_color: DEFAULT_BRAND_COLOR
    });
    if (error) throw error;
    return 'coach';
  }

  private async recordLogin(session: Session, knownRole?: string): Promise<void> {
    let sessionId: string;
    try {
      const claims = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      sessionId = claims.session_id;
      if (typeof sessionId !== 'string' || !sessionId) return;
    } catch { return; }
    const key = `${environment.auth.storageKey}-logged-session`;
    try { if (localStorage.getItem(key) === sessionId) return; } catch { /* Storage is optional. */ }
    if (this.loginAudits.has(sessionId)) return this.loginAudits.get(sessionId);
    const audit = (async () => {
      try {
        let role = knownRole;
        if (!role) {
          const { data, error } = await this.supabase.from('coaches').select('role').eq('id', session.user.id).maybeSingle();
          if (error) return;
          role = data?.role || 'coach';
        }
        // Same audit contract as smart-coach, once per auth session across reloads.
        const { error } = await this.supabase.from('activity_logins').insert({
          user_id: session.user.id, role, timestamp: new Date().toISOString()
        });
        if (!error) {
          try { localStorage.setItem(key, sessionId); } catch { /* Storage is optional. */ }
        }
      } catch { /* The account remains usable if activity logging is unavailable. */ }
    })();
    this.loginAudits.set(sessionId, audit);
    await audit;
  }

  private async resolveSignedInSession(session: Session): Promise<void> {
    try {
      const contexts = await this.portal.listContexts(session.user.id);
      if (contexts.length) {
        await this.portal.activateLinkedAccesses().catch(() => undefined);
        const context = this.portal.initialContext(session.user.id, contexts) || contexts[0];
        await this.recordLogin(session, `${context.scope}_client`);
      } else {
        await this.recordLogin(session);
      }
    } catch { /* Guards and page retry states handle transient data failures. */ }
  }

  private hasClientMetadata(user: User): boolean {
    const metadata = user.user_metadata || {};
    return metadata['role'] === 'gym_client' ||
      metadata['role'] === 'independent_client' ||
      metadata['account_type'] === 'gym_client' ||
      metadata['account_type'] === 'independent_client' ||
      !!metadata['client_id'];
  }

  private translateAuthError(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid login')) return 'Correo o contraseña incorrectos.';
    if (normalized.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.';
    return 'No pudimos iniciar sesión. Revisa tus datos e inténtalo nuevamente.';
  }

  private translateSignUpError(message: string): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('already registered') || normalized.includes('already exists')) {
      return 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.';
    }
    if (normalized.includes('password')) {
      return 'La contraseña no cumple los requisitos de seguridad.';
    }
    if (normalized.includes('email')) {
      return 'No pudimos usar ese correo. Revisa que esté escrito correctamente.';
    }
    return 'No pudimos crear tu cuenta. Inténtalo nuevamente.';
  }

  private isRateLimitError(error: { message?: string; status?: number } | null): boolean {
    const message = error?.message?.toLocaleLowerCase('es') || '';
    return error?.status === 429 || message.includes('rate limit') || message.includes('too many requests');
  }

  private portalInviteError(message: string, code: 'INVITE_RATE_LIMIT' | 'INVITE_EMAIL_FAILED'): Error & { code: string } {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
  }
}
