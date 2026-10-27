
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/auth/supabase.service';

@Component({
  selector: 'app-set-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './set-password.component.html',
  styleUrl: './set-password.component.scss'
})
export class SetPasswordComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly passwordClient: SupabaseClient = this.supabase.createPasswordActionClient();
  private readonly initialization: Promise<boolean>;

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal('');

  readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8), this.passwordComplexity]],
    confirmation: ['', [Validators.required]]
  });

  constructor() {
    this.initialization = this.initializePasswordAction();
  }

  ngOnDestroy(): void {
    void this.passwordClient.auth.dispose();
  }

  private passwordComplexity(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value || '');
    return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
      ? null
      : { passwordComplexity: true };
  }

  private async initializePasswordAction(): Promise<boolean> {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const type = search.get('type') || hash.get('type') || 'recovery';
    const tokenHash = search.get('token_hash');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const code = search.get('code');

    try {
      if (type !== 'invite' && type !== 'recovery') throw new Error('invalid-password-link');
      if (tokenHash) {
        const { data, error } = await this.passwordClient.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error || !data.session) throw error || new Error('missing-password-session');
      } else if (accessToken && refreshToken) {
        const { data, error } = await this.passwordClient.auth.setSession({
          access_token: accessToken, refresh_token: refreshToken
        });
        if (error || !data.session) throw error || new Error('missing-password-session');
      } else if (code) {
        const { data, error } = await this.passwordClient.auth.exchangeCodeForSession(code, {
          flowId: search.get('sb_flow_id') || undefined
        });
        if (error || !data.session) throw error || new Error('missing-password-session');
      } else {
        throw new Error('missing-password-link');
      }
      return true;
    } catch {
      this.errorMessage.set('El enlace no es válido o expiró. Solicita uno nuevo.');
      return false;
    } finally {
      // Neither valid nor expired links should leave credentials in browser history.
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.errorMessage.set('');
    if (this.form.invalid) return;
    if (this.form.controls.password.value !== this.form.controls.confirmation.value) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    this.loading.set(true);
    try {
      if (!await this.initialization) {
        throw new Error('El enlace no es válido o expiró. Solicita uno nuevo.');
      }
      const { error } = await this.passwordClient.auth.updateUser({ password: this.form.controls.password.value });
      if (error) throw new Error('El enlace venció o no pudimos guardar la contraseña. Solicita uno nuevo.');
      await this.passwordClient.auth.signOut({ scope: 'local' });
      await this.router.navigate(['/login'], { queryParams: { passwordUpdated: '1' } });
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No pudimos guardar la contraseña.');
    } finally {
      this.loading.set(false);
    }
  }
}
