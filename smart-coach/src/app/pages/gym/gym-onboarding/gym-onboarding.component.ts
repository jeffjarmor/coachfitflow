import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { GymService } from '../../../services/gym.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';

@Component({
  selector: 'app-gym-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, PageHeaderComponent],
  templateUrl: './gym-onboarding.component.html',
  styleUrls: ['./gym-onboarding.component.scss']
})
export class GymOnboardingComponent {
  private fb = inject(FormBuilder);
  private gymService = inject(GymService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  gymForm: FormGroup;
  loading = signal(false);
  accessCode = signal<string | null>(null);
  currentStep = signal(1); // 1: Form, 2: Success with code

  constructor() {
    this.gymForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.email]],
      phone: [''],
      address: ['']
    });
  }

  async onSubmit() {
    if (this.gymForm.invalid) {
      this.toastService.error('Por favor completa todos los campos requeridos');
      return;
    }

    this.loading.set(true);

    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      // This route is admin-only. Ownership is assigned separately from Admin.
      const gym = await this.gymService.createGym({
        ...this.gymForm.value,
        ownerId: undefined
      });

      this.accessCode.set(gym.accessCode);
      this.currentStep.set(2);
      this.toastService.success('¡Gimnasio creado exitosamente!');
    } catch (error) {
      console.error('Error creating gym:', error);
      this.toastService.error('Error al crear el gimnasio');
    } finally {
      this.loading.set(false);
    }
  }

  copyAccessCode() {
    const code = this.accessCode();
    if (code) {
      navigator.clipboard.writeText(code);
      this.toastService.success('Código copiado al portapapeles');
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
