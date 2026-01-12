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
                    <h1>Crear Cuenta</h1>
                    <p>Únete a Smart Coach y gestiona tus entrenamientos</p>
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
                        <input 
                            id="password" 
                            type="password" 
                            formControlName="password" 
                            placeholder="Mínimo 8 caracteres, mayúsculas, minúsculas y números"
                            [class.error]="isFieldInvalid('password')"
                        >
                        <span *ngIf="isFieldInvalid('password')" class="error-message">
                            <span *ngIf="signupForm.get('password')?.errors?.['required']">La contraseña es requerida</span>
                            <span *ngIf="signupForm.get('password')?.errors?.['minlength']">Mínimo 8 caracteres</span>
                            <span *ngIf="signupForm.get('password')?.errors?.['passwordComplexity']">Debe contener mayúsculas, minúsculas y números</span>
                        </span>
                    </div>

                    <div class="form-group">
                        <label for="confirmPassword">Confirmar Contraseña</label>
                        <input 
                            id="confirmPassword" 
                            type="password" 
                            formControlName="confirmPassword" 
                            placeholder="Repite tu contraseña"
                            [class.error]="signupForm.errors?.['passwordMismatch'] && signupForm.get('confirmPassword')?.touched"
                        >
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

    async onSubmit() {
        if (this.signupForm.valid) {
            this.isLoading.set(true);
            this.errorMessage.set('');

            const { name, email, password } = this.signupForm.value;

            try {
                await this.authService.register({
                    email: email!,
                    password: password!,
                    name: name!
                });
                this.router.navigate(['/dashboard']);
            } catch (error: any) {
                console.error('Registration error:', error);
                this.errorMessage.set(this.getErrorMessage(error));
            } finally {
                this.isLoading.set(false);
            }
        } else {
            this.signupForm.markAllAsTouched();
        }
    }

    private getErrorMessage(error: any): string {
        if (error.code === 'auth/email-already-in-use') {
            return 'Este correo ya está registrado.';
        }
        return 'Ocurrió un error al registrarse. Intenta nuevamente.';
    }
}
