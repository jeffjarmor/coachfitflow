
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal('');
  readonly infoMessage = signal('');
  private awaitingEmailConfirmation = false;

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const email = params.get('email');
    if (email) this.form.patchValue({ email });
    this.awaitingEmailConfirmation = params.get('registered') === '1';
    if (params.get('blocked') === 'coach-subscription-pending') {
      this.errorMessage.set('El acceso al portal está pausado porque la suscripción Pro del entrenador está pendiente. Inténtalo nuevamente cuando el plan esté activo.');
    } else if (params.get('passwordUpdated') === '1' || params.get('passwordSet') === '1') {
      this.infoMessage.set('Tu contraseña quedó lista. Ya puedes iniciar sesión con ese correo.');
    } else if (this.awaitingEmailConfirmation) {
      this.infoMessage.set('Tu cuenta fue creada. Revisa tu correo y confirma la cuenta antes de iniciar sesión.');
    } else if (params.get('recovery') === '1') {
      this.infoMessage.set('Escribe tu correo y pulsa «¿La olvidaste?» para recibir el enlace de recuperación.');
    }
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.loading.set(true);
    this.errorMessage.set('');
    this.infoMessage.set('');
    try {
      const homePath = await this.auth.signIn(this.form.controls.email.value, this.form.controls.password.value);
      const returnUrl = this.getSafeReturnUrl(homePath);
      window.location.replace(new URL(returnUrl, window.location.origin).toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos iniciar sesión.';
      this.errorMessage.set(this.awaitingEmailConfirmation && message === 'Correo o contraseña incorrectos.'
        ? 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada o spam.'
        : message);
    } finally {
      this.loading.set(false);
    }
  }

  async continueWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No pudimos continuar con Google.');
      this.loading.set(false);
    }
  }

  async recoverPassword(): Promise<void> {
    const email = this.form.controls.email;
    email.markAsTouched();
    if (email.invalid) {
      this.errorMessage.set('Escribe un correo válido para recuperar tu contraseña.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.auth.requestPasswordReset(email.value);
      this.infoMessage.set('Revisa tu correo. Te enviamos un enlace de recuperación.');
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No pudimos enviar el correo.');
    } finally {
      this.loading.set(false);
    }
  }

  private getSafeReturnUrl(homePath: '/dashboard' | '/client/portal'): string {
    const requestedUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!requestedUrl) {
      return homePath;
    }

    try {
      const requestedDestination = new URL(requestedUrl, window.location.origin);
      if (requestedDestination.origin !== window.location.origin) {
        return homePath;
      }

      if (homePath === '/client/portal' && !requestedDestination.pathname.startsWith('/client/')) {
        return homePath;
      }
      if (homePath === '/dashboard' && requestedDestination.pathname.startsWith('/client/')) {
        return homePath;
      }

      return `${requestedDestination.pathname}${requestedDestination.search}${requestedDestination.hash}`;
    } catch {
      return homePath;
    }
  }
}
