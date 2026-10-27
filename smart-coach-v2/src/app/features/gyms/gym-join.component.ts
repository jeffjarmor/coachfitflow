import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { gymHome } from './gym-access.guard';
import { GymContextService } from './gym-context.service';

@Component({
  selector: 'app-gym-join',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './gym-join.component.html',
  styleUrl: './gym-join.component.scss'
})
export class GymJoinComponent {
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);
  private readonly router = inject(Router);

  readonly accessCode = signal('');
  readonly submitting = signal(false);
  readonly error = signal('');

  updateCode(value: string): void {
    this.accessCode.set(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12));
    this.error.set('');
  }

  async submit(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || this.submitting()) return;
    if (!this.accessCode().trim()) {
      this.error.set('Escribe el código de acceso del gimnasio.');
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    try {
      await this.auth.ensureCoachProfileForCurrentUser();
      const profile = await this.coachData.getProfile(userId);
      const context = await this.gyms.joinByAccessCode(userId, profile.role, this.accessCode());
      await this.coachData.getProfile(userId);
      await this.router.navigate(gymHome(context), { queryParams: { joined: '1' } });
    } catch (error: any) {
      this.error.set(String(error?.message || 'No pudimos unirte al gimnasio. Inténtalo nuevamente.'));
    } finally {
      this.submitting.set(false);
    }
  }
}

