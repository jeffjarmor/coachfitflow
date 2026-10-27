import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';

import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, WorkspaceItem, WorkspaceKind } from '../../core/data/coach-data.service';
import { ContextHelpComponent, ContextHelpStep } from '../../shared/context-help/context-help.component';
import { GymContextService } from '../gyms/gym-context.service';

interface WorkspaceConfig {
  title: string;
  description: string;
  search: string;
  emptyTitle: string;
  emptyDescription: string;
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, ContextHelpComponent],
  templateUrl: './workspace.component.html',
  styleUrl: './workspace.component.scss'
})
export class WorkspaceComponent implements OnInit, OnDestroy {
  readonly pagination = createListPagination(() => this.filteredItems(), () => JSON.stringify([this.kind(), this.query()]));
  readonly page = this.pagination.page;
  readonly visibleItems = this.pagination.visibleItems;

  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly notice = signal('');
  readonly searchInput = signal('');
  readonly query = signal('');
  readonly items = signal<WorkspaceItem[]>([]);
  readonly kind = signal<WorkspaceKind>('clients');
  readonly gymId = this.route.snapshot.paramMap.get('gymId') || '';
  readonly gymContext = computed(() => this.gyms.activeGym());
  readonly canAddClient = computed(() => !this.gymId || !!this.gymContext()?.permissions.canEditClients);
  readonly canCreateRoutine = computed(() => !this.gymId || !!this.gymContext()?.permissions.canCreateRoutines);
  readonly clientHelpSteps: ContextHelpStep[] = [
    { title: 'Encuentra un cliente', description: 'Escribe el nombre, correo, objetivo o teléfono. La búsqueda espera un instante antes de filtrar para evitar saltos mientras escribes.' },
    { title: 'Navega por páginas', description: 'La lista comienza con 5 clientes por página. Puedes elegir 5, 10 o 20. Al cambiar la búsqueda siempre volverás a la primera página.' },
    { title: 'Abre la ficha', description: 'Selecciona una tarjeta para revisar perfil, rutinas, mediciones, hojas de competidor y actividad RIR.' },
    { title: 'Agrega un cliente', description: 'Usa “Agregar cliente” para crear el perfil. Si tu plan Pro está activo, podrás enviarle acceso al portal.' }
  ];

  readonly configs: Record<WorkspaceKind, WorkspaceConfig> = {
    clients: {
      title: 'Clientes', description: 'Perfiles, objetivos y datos de contacto en una vista clara.',
      search: 'Buscar cliente', emptyTitle: 'Aún no hay clientes', emptyDescription: 'Los clientes que agregues aparecerán en esta lista.'
    },
    routines: {
      title: 'Rutinas', description: 'Consulta los planes activos y el historial de trabajo.',
      search: 'Buscar rutina', emptyTitle: 'Aún no hay rutinas', emptyDescription: 'Las rutinas creadas aparecerán organizadas aquí.'
    },
    exercises: {
      title: 'Ejercicios', description: 'Encuentra ejercicios globales y los que guardaste para tu cuenta.',
      search: 'Buscar ejercicio', emptyTitle: 'No encontramos ejercicios', emptyDescription: 'Cambia la búsqueda o agrega ejercicios a tu biblioteca.'
    },
    measurements: {
      title: 'Mediciones', description: 'Encuentra un control reciente y continúa en el historial completo del cliente.',
      search: 'Buscar por cliente', emptyTitle: 'Aún no hay mediciones', emptyDescription: 'Los registros de progreso aparecerán en esta sección.'
    }
  };

  readonly config = computed(() => this.configs[this.kind()]);
  readonly filteredItems = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    if (!term) return this.items();
    return this.items().filter((item) =>
      `${item.title} ${item.subtitle} ${item.detail} ${item.status || ''}`.toLocaleLowerCase('es').includes(term)
    );
  });
  readonly totalPages = this.pagination.totalPages;
  readonly visibleRange = this.pagination.range;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('result') === 'deleted') {
      this.notice.set('El cliente y su información relacionada se eliminaron correctamente.');
    }
    if (this.route.snapshot.queryParamMap.get('result') === 'routine-deleted') {
      this.notice.set('La rutina y su planificación se eliminaron correctamente.');
    }
    this.route.data.subscribe((data) => {
      this.kind.set(data['kind'] as WorkspaceKind);
      this.searchInput.set('');
      this.query.set('');
      this.page.set(1);
      void this.load();
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  onSearchInput(value: string): void {
    this.searchInput.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.query.set(value);
      this.page.set(1);
    }, 300);
  }

  clearSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchInput.set('');
    this.query.set('');
    this.page.set(1);
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 1), this.totalPages()));
    document.querySelector<HTMLElement>('.workspace-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  itemRoute(item: WorkspaceItem): string[] | null {
    if (this.kind() === 'routines') return this.gymId ? ['/gym', this.gymId, 'routines', item.id] : ['/routines', item.id];
    if (this.kind() === 'measurements' && item.parentId) return this.clientRoute(item.parentId);
    return null;
  }

  clientRoute(clientId: string): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients', clientId] : ['/clients', clientId];
  }

  createRoute(kind: 'client' | 'routine'): string[] {
    const resource = kind === 'client' ? 'clients' : 'routines';
    return this.gymId ? ['/gym', this.gymId, resource, 'new'] : [`/${resource}/new`];
  }

  itemQueryParams(item: WorkspaceItem): Record<string, string> | null {
    return this.kind() === 'measurements' && item.parentId ? { tab: 'measurements' } : null;
  }

  async load(): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId) return;

    this.loading.set(true);
    this.error.set('');
    try {
      this.items.set(await this.coachData.loadWorkspace(this.kind(), coachId, this.gymId || undefined));
    } catch {
      this.items.set([]);
      this.error.set(`No pudimos cargar ${this.config().title.toLocaleLowerCase('es')}. Revisa tu conexión e inténtalo nuevamente.`);
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
  }

  calculateAge(value: string | null | undefined): number {
    if (!value) return 0;
    const birthDate = new Date(`${value}T12:00:00`);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const month = today.getMonth() - birthDate.getMonth();
    if (month < 0 || (month === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return Math.max(age, 0);
  }
}
