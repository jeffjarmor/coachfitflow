import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GymService } from '../../../services/gym.service';
import { PaymentService } from '../../../services/payment.service';
import { ClientService } from '../../../services/client.service';
import { RoutineService } from '../../../services/routine.service';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { ToastService } from '../../../services/toast.service';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { Gym } from '../../../models/gym.model';
import { GymCoach } from '../../../models/gym-coach.model';
import { Client } from '../../../models/client.model';
import { Payment } from '../../../models/payment.model';

@Component({
  selector: 'app-gym-dashboard',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, ButtonComponent],
  templateUrl: './gym-dashboard.component.html',
  styleUrls: ['./gym-dashboard.component.scss']
})
export class GymDashboardComponent implements OnInit {
  private gymService = inject(GymService);
  private paymentService = inject(PaymentService);
  private clientService = inject(ClientService);
  private routineService = inject(RoutineService);
  private authService = inject(AuthService);
  private coachService = inject(CoachService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  gym = signal<Gym | null>(null);
  coaches = signal<GymCoach[]>([]);
  clients = signal<Client[]>([]);
  overduePayments = signal<Payment[]>([]);
  totalRoutines = signal(0);
  loading = signal(true);

  // Computed stats
  stats = computed(() => ({
    totalClients: this.clients().length,
    totalCoaches: this.coaches().length,
    totalRoutines: this.totalRoutines(),
    overduePayments: this.overduePayments().length
  }));

  async ngOnInit() {
    await this.loadDashboardData();
  }

  async loadDashboardData() {
    try {
      this.loading.set(true);
      const userId = this.authService.getCurrentUserId();
      if (!userId) {
        this.router.navigate(['/login']);
        return;
      }

      // Check if gym ID is provided in route (for owners/admins viewing specific gym)
      const routeGymId = this.route.snapshot.paramMap.get('id');
      let targetGymId = routeGymId;

      // If no route ID, fall back to coach's assigned gym
      if (!targetGymId) {
        const coach = await this.coachService.getCoachProfile(userId);
        if (coach && coach.gymId) {
          targetGymId = coach.gymId;
        } else {
          // Not in a gym and no ID provided
          this.toastService.error('No estás asociado a ningún gimnasio');
          this.router.navigate(['/dashboard']);
          return;
        }
      }

      // 1. Load Gym Data First
      const gym = await this.gymService.getGym(targetGymId!);

      if (!gym) {
        this.toastService.error('Gimnasio no encontrado');
        this.router.navigate(['/dashboard']);
        return;
      }

      // 2. Security Check: Only Gym Owner or Admin can view this dashboard
      const coachWrapper = await this.coachService.getCoachProfile(userId);
      const isOwner = gym.ownerId === userId;
      const isAdmin = coachWrapper?.role === 'admin';

      console.log('GymDashboard Access Check:', {
        gymId: gym.id,
        currentUserId: userId,
        gymOwnerId: gym.ownerId,
        isOwner,
        isAdmin,
      });

      if (!isOwner && !isAdmin) {
        console.warn('Access denied to Gym Dashboard for user:', userId);
        this.router.navigate(['/dashboard']);
        return;
      }

      // 3. Load remaining data only if authorized
      const [coaches, clients, routines, overduePayments] = await Promise.all([
        this.gymService.getGymCoaches(targetGymId!),
        this.clientService.getGymClients(targetGymId!),
        this.routineService.getAllGymRoutines(targetGymId!),
        this.paymentService.getOverduePayments(targetGymId!)
      ]);

      this.gym.set(gym);

      // Filter out admins from display
      const filteredCoaches = coaches.filter(c => (c.role as string) !== 'admin');
      this.coaches.set(filteredCoaches);

      this.clients.set(clients);
      this.totalRoutines.set(routines.length);
      this.overduePayments.set(overduePayments);

    } catch (error) {
      console.error('Error loading gym dashboard:', error);
      this.toastService.error('Error al cargar el dashboard');
      this.router.navigate(['/dashboard']);
    } finally {
      this.loading.set(false);
    }
  }

  copyAccessCode() {
    const code = this.gym()?.accessCode;
    if (code) {
      navigator.clipboard.writeText(code);
      this.toastService.success('Código copiado al portapapeles');
    }
  }

  goToClients() {
    this.router.navigate(['/clients']);
  }

  goToPayments() {
    const gymId = this.gym()?.id;
    if (gymId) {
      this.router.navigate(['/gym/payments', gymId]);
    }
  }

  goToStaff() {
    const gymId = this.gym()?.id;
    if (gymId) {
      this.router.navigate(['/gym/staff', gymId]);
    }
  }

  navigateToSettings() {
    const id = this.gym()?.id;
    if (id) {
      this.router.navigate(['/gym/settings', id]);
    }
  }

  getRoleLabel(role: string): string {
    const roleLabels: Record<string, string> = {
      'owner': 'Dueño',
      'trainer': 'Entrenador',
      'receptionist': 'Recepcionista'
    };
    return roleLabels[role] || role;
  }
}
