import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    loginForm: FormGroup;
    errorMessage = signal<string>('');
    infoMessage = signal<string>('');
    loading = signal<boolean>(false);
    showPassword = signal<boolean>(false);
    private awaitingEmailConfirmation = false;

    constructor() {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]]
        });

        this.route.queryParamMap.subscribe((params) => {
            const emailFromQuery = params.get('email') || '';
            if (emailFromQuery) {
                this.loginForm.patchValue({ email: emailFromQuery });
            }

            this.awaitingEmailConfirmation = params.get('registered') === '1';

            if (params.get('passwordSet') === '1') {
                this.infoMessage.set('Tu contraseña quedó lista. Ahora puedes iniciar sesión con ese correo.');
            } else if (this.awaitingEmailConfirmation) {
                this.infoMessage.set('Tu cuenta fue creada. Revisa tu correo y confirma la cuenta antes de iniciar sesión.');
            } else {
                this.infoMessage.set('');
            }
        });
    }

    async onSubmit(): Promise<void> {
        if (this.loginForm.invalid) {
            return;
        }

        this.loading.set(true);
        this.errorMessage.set('');

        const { email, password } = this.loginForm.value;

        try {
            await this.authService.signInWithEmail(email, password);
        } catch (error: any) {
            const baseMessage = error.message || 'Error al iniciar sesión. Inténtalo de nuevo.';
            const shouldShowConfirmationHint =
                this.awaitingEmailConfirmation &&
                (baseMessage === 'Correo o contraseña incorrectos.' ||
                    baseMessage === 'Ocurrió un error. Inténtalo nuevamente.');

            this.errorMessage.set(
                shouldShowConfirmationHint
                    ? 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada o spam.'
                    : baseMessage
            );
        } finally {
            this.loading.set(false);
        }
    }

    async signInWithGoogle(): Promise<void> {
        this.loading.set(true);
        this.errorMessage.set('');

        try {
            await this.authService.signInWithGoogle();
        } catch (error: any) {
            this.errorMessage.set(error.message || 'Error al iniciar sesión con Google. Inténtalo de nuevo.');
        } finally {
            this.loading.set(false);
        }
    }

    get email() {
        return this.loginForm.get('email');
    }

    get password() {
        return this.loginForm.get('password');
    }

    togglePasswordVisibility(): void {
        this.showPassword.update((value) => !value);
    }
}
