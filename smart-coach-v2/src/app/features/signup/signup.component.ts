import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmationPassword = signal(false);
  readonly showConfirmation = signal(false);
  readonly errorMessage = signal('');
  readonly confirmationEmail = signal('');

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), this.passwordComplexity]],
    confirmation: ['', Validators.required]
  }, { validators: this.passwordMatch });

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.errorMessage.set('');
    if (this.form.invalid) return;

    this.loading.set(true);
    try {
      const value = this.form.getRawValue();
      const result = await this.auth.signUp(value.name, value.email, value.password);
      if (!result.requiresEmailConfirmation) {
        await this.router.navigateByUrl('/dashboard');
        return;
      }

      this.confirmationEmail.set(value.email.trim().toLocaleLowerCase('es'));
      this.showConfirmation.set(true);
      this.form.controls.password.reset();
      this.form.controls.confirmation.reset();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : 'No pudimos crear tu cuenta.');
    } finally {
      this.loading.set(false);
    }
  }

  private passwordComplexity(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value || '');
    return /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
      ? null
      : { passwordComplexity: true };
  }

  private passwordMatch(group: AbstractControl): ValidationErrors | null {
    return group.get('password')?.value === group.get('confirmation')?.value
      ? null
      : { passwordMismatch: true };
  }
}
