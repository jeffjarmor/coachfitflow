import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { GymService } from '../../../services/gym.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
  selector: 'app-gym-join',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent],
  templateUrl: './gym-join.component.html',
  styleUrls: ['./gym-join.component.scss']
})
export class GymJoinComponent {
  private fb = inject(FormBuilder);
  private gymService = inject(GymService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  joinForm: FormGroup;
  loading = signal(false);
  gymName = signal<string | null>(null);
  success = signal(false);

  constructor() {
    this.joinForm = this.fb.group({
      accessCode: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
  }

  formatAccessCode(event: Event) {
    const input = event.target as HTMLInputElement;
    // Convert to uppercase and remove non-alphanumeric characters
    let value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Limit to 6 characters
    value = value.substring(0, 6);
    this.joinForm.patchValue({ accessCode: value }, { emitEvent: false });
  }

  async onSubmit() {
    if (this.joinForm.invalid) {
      this.toastService.error('Por favor ingresa un código válido');
      return;
    }

    this.loading.set(true);

    try {
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        throw new Error('Usuario no autenticado');
      }

      const accessCode = this.joinForm.value.accessCode;
      const gym = await this.gymService.joinGym(userId, accessCode);

      this.gymName.set(gym.name);
      this.success.set(true);
      this.toastService.success(`¡Te has unido a ${gym.name}!`);
    } catch (error: any) {
      console.error('Error joining gym:', error);
      if (error.message === 'Invalid access code') {
        this.toastService.error('Código de acceso inválido');
      } else if (error.message === 'You are already a member of this gym') {
        this.toastService.error('Ya eres miembro de este gimnasio');
      } else {
        this.toastService.error('Error al unirse al gimnasio');
      }
    } finally {
      this.loading.set(false);
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }
}
