import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
    selector: 'app-set-password',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent],
    templateUrl: './set-password.component.html',
    styleUrls: ['./set-password.component.scss']
})
export class SetPasswordComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);

    form: FormGroup;
    loading = signal<boolean>(false);
    initializing = signal<boolean>(true);
    errorMessage = signal<string>('');
    successMessage = signal<string>('');

    constructor() {
        this.form = this.fb.group({
            password: ['', [Validators.required, Validators.minLength(8), this.passwordComplexityValidator]],
            confirmPassword: ['', [Validators.required]]
        }, { validators: this.passwordMatchValidator });

        void this.initializeRecoverySession();
    }

    private async initializeRecoverySession(): Promise<void> {
        this.initializing.set(true);
        this.errorMessage.set('');

        try {
            await this.authService.waitForAuthReady(8000);

            let user = await this.authService.ensureSession();
            if (!user) {
                await new Promise(resolve => setTimeout(resolve, 600));
                user = await this.authService.ensureSession();
            }

            if (!user) {
                this.errorMessage.set('El enlace no es válido o expiró. Solicita un nuevo correo de recuperación.');
            }
        } catch (error) {
            console.error('Error initializing recovery session:', error);
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
            const password = this.form.get('password')?.value;
            await this.authService.updateCurrentUserPassword(password);
            await this.authService.activateGymClientAccessForCurrentUser();

            this.successMessage.set('Contraseña actualizada correctamente. Redirigiendo...');
            setTimeout(() => {
                void this.router.navigate(['/client/portal']);
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
