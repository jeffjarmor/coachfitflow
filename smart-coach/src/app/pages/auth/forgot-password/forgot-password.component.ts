import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
    selector: 'app-forgot-password',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent],
    templateUrl: './forgot-password.component.html',
    styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);

    forgotPasswordForm: FormGroup;
    loading = signal<boolean>(false);
    errorMessage = signal<string>('');
    successMessage = signal<string>('');

    constructor() {
        this.forgotPasswordForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]]
        });
    }

    async onSubmit(): Promise<void> {
        if (this.forgotPasswordForm.invalid) {
            this.forgotPasswordForm.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        this.errorMessage.set('');
        this.successMessage.set('');

        const { email } = this.forgotPasswordForm.value;

        try {
            await this.authService.sendPasswordReset(email);
            this.successMessage.set('Te enviamos un correo para restablecer tu contraseña. Revisa tu bandeja de entrada y spam.');
        } catch (error: any) {
            this.errorMessage.set(error.message || 'No se pudo enviar el correo de recuperación. Inténtalo de nuevo.');
        } finally {
            this.loading.set(false);
        }
    }

    get email() {
        return this.forgotPasswordForm.get('email');
    }
}
