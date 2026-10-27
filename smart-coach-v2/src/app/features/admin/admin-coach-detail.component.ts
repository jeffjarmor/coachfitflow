import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AdminClientRecord, AdminCoachPlan, AdminCoachRecord, AdminDataService } from './admin-data.service';

@Component({
  selector: 'app-admin-coach-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './admin-coach-detail.component.html',
  styleUrl: './admin-coach-detail.component.scss'
})
export class AdminCoachDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly data = inject(AdminDataService);

  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly gyms = signal<Array<{id: string; name: string; ownerId: string | null}>>([]);
  readonly gymOptions = computed(() => this.gyms().map(gym => ({value: gym.id, label: gym.name})));
  readonly selectedGym = signal('');

  readonly coachId = this.route.snapshot.paramMap.get('id') || '';
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly coach = signal<AdminCoachRecord | null>(null);
  readonly clients = signal<AdminClientRecord[]>([]);
  readonly selectedPlan = signal<AdminCoachPlan>('standard');
  readonly paymentDate = signal('');

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.coachId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const [coach, clients, gyms] = await Promise.all([
        this.data.getCoach(this.coachId),
        this.data.listClients(this.coachId),
        this.data.listGyms()
      ]);
      if (!coach) {
        this.error.set('La cuenta ya no existe o no está disponible.');
        return;
      }
      this.coach.set(coach);
      this.clients.set(clients);
      this.gyms.set(gyms);
      this.selectedPlan.set(coach.coachPlan);
      this.paymentDate.set(coach.nextPlanPaymentDate || '');
    } catch {
      this.error.set('No pudimos cargar la cuenta. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  updatePlan(plan: AdminCoachPlan): void {
    this.selectedPlan.set(plan);
    if (plan === 'paid' && !this.paymentDate()) {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      this.paymentDate.set(next.toISOString().slice(0, 10));
    }
  }

  async savePlan(): Promise<void> {
    if (this.saving() || !this.coach()) return;
    if (this.selectedPlan() === 'paid' && !this.paymentDate()) {
      this.error.set('Define la próxima fecha de pago para activar el plan Pro.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.data.updateCoachPlan(this.coachId, this.selectedPlan(), this.paymentDate() || null);
      await this.load();
      this.notice.set('El plan de la cuenta se actualizó correctamente.');
    } catch {
      this.error.set('No pudimos actualizar el plan. Inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async assignOwner(): Promise<void> {
    if (!this.selectedGym() || this.saving()) return;
    if (!window.confirm('¿Asignar esta cuenta como propietario principal del gimnasio? El propietario anterior pasará a entrenador.')) return;
    this.saving.set(true);
    try { await this.data.assignGymOwner(this.selectedGym(), this.coachId); await this.load(); this.notice.set('Propietario asignado.'); }
    catch { this.error.set('No pudimos asignar el propietario. Inténtalo nuevamente.'); }
    finally { this.saving.set(false); }
  }

  async deleteAccount(): Promise<void> {
    if (this.auth.user()?.id === this.coachId || this.saving()) return;
    if (!window.confirm('¿Eliminar esta cuenta, sus gimnasios propios y su trabajo? Esta acción no se puede deshacer.')) return;
    this.saving.set(true);
    try { await this.data.deleteCoach(this.coachId); await this.router.navigate(['/admin/coaches']); }
    catch { this.error.set('No pudimos eliminar la cuenta. Inténtalo nuevamente.'); }
    finally { this.saving.set(false); }
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${value.slice(0, 10)}T12:00:00`));
  }

  affiliationRole(role: string): string {
    return ({ owner: 'Propietario', trainer: 'Entrenador', receptionist: 'Recepción' } as Record<string, string>)[role] || role;
  }
}
