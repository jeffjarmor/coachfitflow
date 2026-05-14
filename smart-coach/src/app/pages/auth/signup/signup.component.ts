import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
    selector: 'app-signup',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent],
    template: `
        <div class="signup-container">
            <div class="signup-card">
                <div class="header">
                    <img class="auth-logo" src="/brand/coach-fitflow-icon-lime.svg" alt="Zummith">
                    <h1>Crear Cuenta</h1>
                    <p>Únete a Zummith y gestiona tus entrenamientos</p>
                </div>

                <div *ngIf="errorMessage()" class="alert alert-error">
                    {{ errorMessage() }}
                </div>

                <form [formGroup]="signupForm" (ngSubmit)="onSubmit()" class="signup-form">
                    <div class="form-group">
                        <label for="name">Nombre Completo</label>
                        <input
                            id="name"
                            type="text"
                            formControlName="name"
                            placeholder="Tu nombre"
                            [class.error]="isFieldInvalid('name')"
                        >
                        <span *ngIf="isFieldInvalid('name')" class="error-message">
                            El nombre es requerido
                        </span>
                    </div>

                    <div class="form-group">
                        <label for="email">Correo Electrónico</label>
                        <input
                            id="email"
                            type="email"
                            formControlName="email"
                            placeholder="ejemplo@correo.com"
                            [class.error]="isFieldInvalid('email')"
                        >
                        <span *ngIf="isFieldInvalid('email')" class="error-message">
                            Ingresa un correo válido
                        </span>
                    </div>

                    <div class="form-group">
                        <label for="password">Contraseña</label>
                        <div class="password-field">
                            <input
                                id="password"
                                [type]="showPassword() ? 'text' : 'password'"
                                formControlName="password"
                                placeholder="Mínimo 8 caracteres, mayúsculas, minúsculas y números"
                                [class.error]="isFieldInvalid('password')"
                            >
                            <button
                                type="button"
                                class="password-toggle"
                                (click)="togglePasswordVisibility()"
                                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                            >
                                {{ showPassword() ? 'Ocultar' : 'Ver' }}
                            </button>
                        </div>
                        <span *ngIf="isFieldInvalid('password')" class="error-message">
                            <span *ngIf="signupForm.get('password')?.errors?.['required']">La contraseña es requerida</span>
                            <span *ngIf="signupForm.get('password')?.errors?.['minlength']">Mínimo 8 caracteres</span>
                            <span *ngIf="signupForm.get('password')?.errors?.['passwordComplexity']">Debe contener mayúsculas, minúsculas y números</span>
                        </span>
                    </div>

                    <div class="form-group">
                        <label for="confirmPassword">Confirmar Contraseña</label>
                        <div class="password-field">
                            <input
                                id="confirmPassword"
                                [type]="showConfirmPassword() ? 'text' : 'password'"
                                formControlName="confirmPassword"
                                placeholder="Repite tu contraseña"
                                [class.error]="signupForm.errors?.['passwordMismatch'] && signupForm.get('confirmPassword')?.touched"
                            >
                            <button
                                type="button"
                                class="password-toggle"
                                (click)="toggleConfirmPasswordVisibility()"
                                [attr.aria-label]="showConfirmPassword() ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'"
                            >
                                {{ showConfirmPassword() ? 'Ocultar' : 'Ver' }}
                            </button>
                        </div>
                        <span *ngIf="signupForm.errors?.['passwordMismatch'] && signupForm.get('confirmPassword')?.touched" class="error-message">
                            Las contraseñas no coinciden
                        </span>
                    </div>

                    <app-button
                        type="submit"
                        variant="primary"
                        [loading]="isLoading()"
                        [disabled]="signupForm.invalid || isLoading()"
                        class="submit-btn"
                    >
                        Registrarse
                    </app-button>
                </form>

                <div class="login-link">
                    ¿Ya tienes una cuenta? <a routerLink="/login">Inicia Sesión</a>
                </div>
            </div>

            <div class="modal-backdrop" *ngIf="showConfirmationModal()" (click)="goToLoginAfterSignup()">
                <div class="confirmation-modal" (click)="$event.stopPropagation()">
                    <div class="modal-icon">✓</div>
                    <h2>Revisa tu correo</h2>
                    <p>
                        Enviamos un correo de validación a <strong>{{ confirmationEmail() }}</strong>.
                        Debes confirmar esa cuenta antes de iniciar sesión.
                    </p>
                    <div class="modal-actions">
                        <app-button variant="primary" [fullWidth]="true" (click)="goToLoginAfterSignup()">
                            Ir a iniciar sesión
                        </app-button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styleUrls: ['./signup.component.scss']
})
export class SignupComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    isLoading = signal(false);
    errorMessage = signal('');
    showPassword = signal(false);
    showConfirmPassword = signal(false);
    confirmationEmail = signal('');
    showConfirmationModal = signal(false);

    signupForm = this.fb.group({
        name: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(8), this.passwordComplexityValidator]],
        confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });

    passwordComplexityValidator(control: any) {
        const value = control.value;
        if (!value) return null;

        const hasUpperCase = /[A-Z]/.test(value);
        const hasLowerCase = /[a-z]/.test(value);
        const hasNumber = /[0-9]/.test(value);

        if (!hasUpperCase || !hasLowerCase || !hasNumber) {
            return { 'passwordComplexity': true };
        }
        return null;
    }

    passwordMatchValidator(g: any) {
        return g.get('password').value === g.get('confirmPassword').value
            ? null : { 'passwordMismatch': true };
    }

    isFieldInvalid(fieldName: string): boolean {
        const field = this.signupForm.get(fieldName);
        return !!(field && field.invalid && (field.dirty || field.touched));
    }

    togglePasswordVisibility(): void {
        this.showPassword.update((value) => !value);
    }

    toggleConfirmPasswordVisibility(): void {
        this.showConfirmPassword.update((value) => !value);
    }

    goToLoginAfterSignup(): void {
        this.showConfirmationModal.set(false);
        this.router.navigate(['/login'], {
            queryParams: { registered: '1' }
        });
    }

    async onSubmit() {
        if (this.signupForm.valid) {
            this.isLoading.set(true);
            this.errorMessage.set('');

            const { name, email, password } = this.signupForm.value;

            try {
                const result = await this.authService.register({
                    email: email!,
                    password: password!,
                    name: name!
                });

                if (result.requiresEmailConfirmation) {
                    this.confirmationEmail.set(email!);
                    this.showConfirmationModal.set(true);
                    this.signupForm.patchValue({
                        password: '',
                        confirmPassword: ''
                    });
                }
            } catch (error: any) {
                this.errorMessage.set(error?.message || 'Ocurrió un error al registrarse. Intenta nuevamente.');
            } finally {
                this.isLoading.set(false);
            }
        } else {
            this.signupForm.markAllAsTouched();
        }
    }
}
