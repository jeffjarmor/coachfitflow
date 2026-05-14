import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { createClient, type EmailOtpType, type SupabaseClient } from '@supabase/supabase-js';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { environment } from '../../../../environments/environment';

@Component({
    selector: 'app-set-password',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent],
    templateUrl: './set-password.component.html',
    styleUrls: ['./set-password.component.scss']
})
export class SetPasswordComponent {
    private fb = inject(FormBuilder);
    private router = inject(Router);
    private passwordActionClient: SupabaseClient | null = null;

    form: FormGroup;
    loading = signal<boolean>(false);
    initializing = signal<boolean>(true);
    errorMessage = signal<string>('');
    successMessage = signal<string>('');
    pageTitle = signal<string>('Crear contraseña');
    pageSubtitle = signal<string>('Define tu contraseña para acceder al portal de cliente');
    resolvedEmail = signal<string>('');

    constructor() {
        this.form = this.fb.group({
            password: ['', [Validators.required, Validators.minLength(8), this.passwordComplexityValidator]],
            confirmPassword: ['', [Validators.required]]
        }, { validators: this.passwordMatchValidator });

        void this.initializePasswordAction();
    }

    private createTransientClient(): SupabaseClient {
        const nonBlockingLock = async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn();
        return createClient(environment.supabase.url, environment.supabase.publishableKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false,
                storageKey: 'zummith-password-action',
                lock: nonBlockingLock
            }
        });
    }

    private isSupportedEmailOtpType(value: string | null): value is Extract<EmailOtpType, 'invite' | 'recovery'> {
        return value === 'invite' || value === 'recovery';
    }

    private updatePageCopy(type: Extract<EmailOtpType, 'invite' | 'recovery'>): void {
        if (type === 'invite') {
            this.pageTitle.set('Activa tu cuenta');
            this.pageSubtitle.set('Crea tu contraseña para empezar a usar tu portal de cliente.');
            return;
        }

        this.pageTitle.set('Restablece tu contraseña');
        this.pageSubtitle.set('Define una nueva contraseña para volver a entrar a tu cuenta.');
    }

    private clearSensitiveUrl(): void {
        if (typeof window === 'undefined') return;
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    private async initializePasswordAction(): Promise<void> {
        this.initializing.set(true);
        this.errorMessage.set('');
        this.passwordActionClient = this.createTransientClient();

        try {
            if (typeof window === 'undefined') {
                this.errorMessage.set('Este enlace solo puede abrirse desde un navegador.');
                return;
            }

            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const searchParams = new URLSearchParams(window.location.search);
            const tokenHash = searchParams.get('token_hash');
            const modeParam = (searchParams.get('mode') || '').toLowerCase();
            const typeParam = (searchParams.get('type') || hashParams.get('type') || 'recovery').toLowerCase();
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            const code = searchParams.get('code');

            if (!this.isSupportedEmailOtpType(typeParam)) {
                this.errorMessage.set('El enlace no es válido o expiró. Solicita uno nuevo.');
                return;
            }

            this.updatePageCopy(modeParam === 'invite' ? 'invite' : typeParam);

            if (tokenHash) {
                const { data, error } = await this.passwordActionClient.auth.verifyOtp({
                    token_hash: tokenHash,
                    type: typeParam
                });
                if (error) throw error;
                this.resolvedEmail.set(data.user?.email || data.session?.user?.email || '');
                this.clearSensitiveUrl();
                return;
            }

            if (accessToken && refreshToken) {
                const { data, error } = await this.passwordActionClient.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
                if (error) throw error;
                this.resolvedEmail.set(data.session?.user?.email || '');
                this.clearSensitiveUrl();
                return;
            }

            if (code) {
                const { data, error } = await this.passwordActionClient.auth.exchangeCodeForSession(code);
                if (error) throw error;
                this.resolvedEmail.set(data.session?.user?.email || '');
                this.clearSensitiveUrl();
                return;
            }

            this.errorMessage.set('El enlace no es válido o expiró. Solicita uno nuevo.');
        } catch (error) {
            console.error('Error initializing password action:', error);
            this.errorMessage.set('No se pudo validar el enlace. Solicita uno nuevo e inténtalo nuevamente.');
        } finally {
            this.initializing.set(false);
        }
    }

    async onSubmit(): Promise<void> {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        this.errorMessage.set('');
        this.successMessage.set('');

        try {
            if (!this.passwordActionClient) {
                throw new Error('No se encontró una sesión temporal válida para actualizar la contraseña.');
            }

            const password = this.form.get('password')?.value;
            const { error } = await this.passwordActionClient.auth.updateUser({ password });
            if (error) throw error;
            await this.passwordActionClient.auth.signOut().catch(() => null);

            this.successMessage.set('Contraseña guardada correctamente. Ahora inicia sesión con tu correo.');
            setTimeout(() => {
                void this.router.navigate(['/login'], {
                    queryParams: {
                        passwordSet: '1',
                        email: this.resolvedEmail() || undefined
                    }
                });
            }, 700);
        } catch (error: any) {
            this.errorMessage.set(error?.message || 'No se pudo actualizar la contraseña.');
        } finally {
            this.loading.set(false);
        }
    }

    private passwordComplexityValidator(control: AbstractControl): ValidationErrors | null {
        const value = control.value || '';
        const hasLowercase = /[a-z]/.test(value);
        const hasUppercase = /[A-Z]/.test(value);
        const hasNumber = /\d/.test(value);

        if (!hasLowercase || !hasUppercase || !hasNumber) {
            return { passwordComplexity: true };
        }

        return null;
    }

    private passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
        const password = group.get('password')?.value;
        const confirmPassword = group.get('confirmPassword')?.value;
        return password === confirmPassword ? null : { passwordMismatch: true };
    }

    get password() {
        return this.form.get('password');
    }

    get confirmPassword() {
        return this.form.get('confirmPassword');
    }
}
