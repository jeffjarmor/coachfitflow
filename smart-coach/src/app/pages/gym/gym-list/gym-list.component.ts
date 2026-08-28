import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { Gym } from '../../../models/gym.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { hasGymOwnerAccess } from '../../../models/gym-coach.model';

@Component({
  selector: 'app-gym-list',
  standalone: true,
  imports: [CommonModule, ButtonComponent, PageHeaderComponent],
  templateUrl: './gym-list.component.html',
  styleUrls: ['./gym-list.component.scss']
})
export class GymListComponent implements OnInit {
  private authService = inject(AuthService);
  private coachService = inject(CoachService);
  private gymService = inject(GymService);
  private router = inject(Router);

  gyms = signal<Gym[]>([]);
  loading = signal(true);
  isAdmin = signal(false);

  async ngOnInit() {
    await this.loadGyms();
  }

  async loadGyms() {
    try {
      this.loading.set(true);
      const userId = this.authService.getCurrentUserId();
      if (!userId) return;

      const coach = await this.coachService.getCoachProfile(userId);
      if (!coach) return;

      this.isAdmin.set(coach.role === 'admin');

      const accessible = await this.gymService.getAccessibleGyms(userId, coach.role === 'admin');
      const gymsData = accessible.sort(
        (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime()
      );

      this.gyms.set(gymsData);
    } catch (error) {
      console.error('Error loading gyms:', error);
    } finally {
      this.loading.set(false);
    }
  }

  createGym() {
    this.router.navigate(['/gym/onboarding']);
  }

  async goToGymDashboard(gym: Gym) {
    const userId = this.authService.getCurrentUserId();
    if (!userId) return;

    const coach = await this.coachService.getCoachProfile(userId);
    if (coach?.role !== 'admin') {
      await this.coachService.setActiveGymContext(userId, gym.id);
    }

    const staffMember = coach?.role === 'admin'
      ? null
      : await this.gymService.getGymCoach(gym.id, userId);

    if (coach?.role === 'admin' || hasGymOwnerAccess(gym, staffMember, userId)) {
      await this.router.navigate(['/gym/dashboard', gym.id]);
    } else {
      await this.router.navigate(['/dashboard']);
    }
  }
}
