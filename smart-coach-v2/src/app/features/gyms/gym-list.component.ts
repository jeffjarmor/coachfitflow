import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminDataService, AdminCoachRecord } from '../admin/admin-data.service';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { gymHome } from './gym-access.guard';
import { GymContextService } from './gym-context.service';

@Component({
  selector: 'app-gym-list',
  standalone: true,
  imports: [ListPaginationComponent, RouterLink, FormsModule, CustomSelectComponent],
  templateUrl: './gym-list.component.html',
  styleUrl: './gym-list.component.scss'
})
export class GymListComponent implements OnInit {
  readonly pagination = createListPagination(() => this.gyms());
  readonly adminPagination = createListPagination(() => this.gyms());

  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gymContext = inject(GymContextService);
  private readonly route = inject(ActivatedRoute);

  private readonly adminData = inject(AdminDataService);
  readonly coaches = signal<AdminCoachRecord[]>([]);
  readonly ownerOptions = computed(() => this.coaches().map(coach => ({value: coach.id, label: `${coach.name} · ${coach.email}`})));
  readonly ownerSelection: Record<string, string> = {};
  readonly busy = signal(false);

  readonly gymHome = gymHome;
  readonly isAdmin = computed(() => this.coachData.currentProfile()?.role === 'admin');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly gyms = this.gymContext.gyms;
  readonly activeGym = this.gymContext.activeGym;

  async ngOnInit(): Promise<void> {
    const access = this.route.snapshot.queryParamMap.get('access');
    const joined = this.route.snapshot.queryParamMap.get('joined');
    if (access === 'gym-required') {
      this.notice.set('Ese gimnasio no está disponible para tu cuenta. Selecciona uno de tus espacios.');
    } else if (joined === '1') {
      this.notice.set('Te uniste al gimnasio correctamente.');
    }
    await this.load();
  }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.ensureCoachProfileForCurrentUser();
      const profile = await this.coachData.getProfile(userId);
      await this.gymContext.loadAccessibleGyms(userId, profile.role, true);
      if (profile.role === 'admin') this.coaches.set((await this.adminData.listCoaches()).filter(coach => coach.role !== 'admin'));
    } catch {
      this.error.set('No pudimos cargar tus gimnasios. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  async assignOwner(gymId: string): Promise<void> {
    const ownerId = this.ownerSelection[gymId];
    if (!this.isAdmin() || !ownerId || this.busy()) return;
    if (!window.confirm('¿Asignar el propietario principal? El anterior pasará a entrenador.')) return;
    this.busy.set(true);
    try { await this.adminData.assignGymOwner(gymId, ownerId); await this.load(); this.notice.set('Propietario asignado.'); }
    catch { this.error.set('No pudimos asignar el propietario.'); }
    finally { this.busy.set(false); }
  }

  async deleteGym(gymId: string): Promise<void> {
    if (!this.isAdmin() || this.busy()) return;
    if (!window.confirm('¿Eliminar este gimnasio y sus planes, membresías, pagos y rutinas? Esta acción no se puede deshacer.')) return;
    this.busy.set(true);
    try { await this.adminData.deleteGym(gymId); await this.load(); this.notice.set('Gimnasio eliminado.'); }
    catch { this.error.set('No pudimos eliminar el gimnasio.'); }
    finally { this.busy.set(false); }
  }
}
