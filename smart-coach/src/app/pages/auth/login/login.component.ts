import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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

    loginForm: FormGroup;
    errorMessage = signal<string>('');
    loading = signal<boolean>(false);

    constructor() {
        this.loginForm = this.fb.group({
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(6)]]
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
            this.errorMessage.set(error.message || 'Error al iniciar sesión. Inténtalo de nuevo.');
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
}
