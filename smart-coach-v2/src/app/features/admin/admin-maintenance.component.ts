import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { afterNextRender, Component, computed, inject, Injector, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { AdminCoachRecord } from './admin-data.service';
import { AdminMaintenanceError, AdminMaintenanceService, MaintenanceGym } from './admin-maintenance.service';

type MaintenanceAction = { kind: 'delete'; gym: MaintenanceGym } | { kind: 'owner'; gym: MaintenanceGym };

@Component({
  selector: 'app-admin-maintenance',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './admin-maintenance.component.html',
  styleUrl: './admin-maintenance.component.scss'
})
export class AdminMaintenanceComponent implements OnInit {
  readonly pagination = createListPagination(() => this.filtered(), () => this.query());
  readonly page = this.pagination.page;
  readonly visible = this.pagination.visibleItems;

  private readonly data = inject(AdminMaintenanceService);
  private readonly injector = inject(Injector);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly gyms = signal<MaintenanceGym[]>([]);
  readonly availableOwners = signal<AdminCoachRecord[]>([]);
  readonly query = signal('');
  readonly action = signal<MaintenanceAction | null>(null);
  readonly selectedOwner = signal('');
  readonly confirmation = signal('');
  readonly filtered = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    return this.gyms().filter((gym) => !term || `${gym.name} ${gym.ownerName} ${gym.ownerEmail}`.toLocaleLowerCase('es').includes(term));
  });
  readonly totalPages = this.pagination.totalPages;
  readonly ownerOptions = computed(() => this.availableOwners().map((coach) => ({ value: coach.id, label: `${coach.name} · ${coach.email}` })));
  readonly chosenOwner = computed(() => this.availableOwners().find((coach) => coach.id === this.selectedOwner()));
  readonly canConfirm = computed(() => {
    const action = this.action();
    return !this.saving() && !!action && (action.kind === 'delete'
      ? this.confirmation().trim() === action.gym.name.trim()
      : !!this.chosenOwner());
  });

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    if (this.saving()) return;
    this.loading.set(true);
    this.error.set('');
    this.cancelAction();
    try {
      const directory = await this.data.load();
      this.gyms.set(directory.gyms);
      this.availableOwners.set(directory.availableOwners);
      this.page.set(1);
    } catch (error) {
      this.gyms.set([]);
      this.availableOwners.set([]);
      this.error.set(error instanceof AdminMaintenanceError ? error.message : 'No pudimos cargar los gimnasios. Revisa la conexión y vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  updateQuery(value: string): void { this.query.set(value); this.page.set(1); }

  goToPage(page: number): void { this.page.set(Math.min(Math.max(1, page), this.totalPages())); }

  beginAction(kind: 'delete' | 'owner', gym: MaintenanceGym): void {
    if (this.saving() || this.loading()) return;
    this.action.set({ kind, gym });
    this.selectedOwner.set('');
    this.confirmation.set('');
    this.error.set('');
    this.notice.set('');
    afterNextRender(() => {
      if (this.action()?.gym.id !== gym.id || this.action()?.kind !== kind) return;
      const heading = document.getElementById('maintenance-action-title');
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' });
      heading?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  cancelAction(): void {
    if (this.saving()) return;
    const action = this.action();
    this.action.set(null);
    this.selectedOwner.set('');
    this.confirmation.set('');
    if (action) setTimeout(() => document.getElementById(`maintenance-${action.kind}-${action.gym.id}`)?.focus());
  }

  async confirmAction(): Promise<void> {
    const action = this.action();
    if (!action || !this.canConfirm()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      if (action.kind === 'delete') await this.data.deleteGym(action.gym, this.confirmation());
      else await this.data.assignOwner(action.gym, this.selectedOwner());
      this.action.set(null);
      this.saving.set(false);
      await this.load();
      this.notice.set(action.kind === 'delete' ? `Se eliminó el gimnasio ${action.gym.name}.` : `Se actualizó el propietario de ${action.gym.name}.`);
    } catch (error) {
      this.action.set(null);
      this.error.set(error instanceof AdminMaintenanceError ? error.message : action.kind === 'delete'
        ? 'No pudimos completar la eliminación. Puede haber cambios parciales. Actualiza la lista y revisa el gimnasio antes de repetir.'
        : 'No pudimos asignar el propietario. Actualiza la lista y revisa la cuenta antes de repetir.');
    } finally {
      this.saving.set(false);
    }
  }
}
