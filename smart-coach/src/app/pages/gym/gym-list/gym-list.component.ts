import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { Gym } from '../../../models/gym.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';

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

      const all = await this.gymService.getAllGyms();
      const gymsData = coach.role === 'admin'
        ? all.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
        : all.filter(g => g.ownerId === userId);

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

  goToGymDashboard(gym: Gym) {
    this.router.navigate(['/gym/dashboard', gym.id]);
  }
}
