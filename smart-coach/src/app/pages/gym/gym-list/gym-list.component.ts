import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Firestore, collection, query, where, getDocs, orderBy } from '@angular/fire/firestore';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
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
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private coachService = inject(CoachService);
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

      const gymsRef = collection(this.firestore, 'gyms');
      let q;

      if (coach.role === 'admin') {
        // Admin sees all gyms
        q = query(gymsRef, orderBy('createdAt', 'desc'));
      } else {
        // Owner sees their created gyms
        q = query(gymsRef, where('ownerId', '==', userId));
      }

      const snapshot = await getDocs(q);
      const gymsData = snapshot.docs.map(doc => doc.data() as Gym);
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
    // Navigate to dashboard with specific gym ID context
    this.router.navigate(['/gym/dashboard', gym.id]);
  }
}
