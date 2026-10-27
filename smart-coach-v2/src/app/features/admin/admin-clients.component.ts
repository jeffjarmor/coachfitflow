import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminClientRecord, AdminCoachRecord, AdminDataService } from './admin-data.service';

@Component({
  selector: 'app-admin-clients',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './admin-clients.component.html',
  styleUrl: './admin-clients.component.scss'
})
export class AdminClientsComponent implements OnInit {
  readonly pagination = createListPagination(() => this.filtered(), () => JSON.stringify([this.query(), this.scope()]));
  readonly page = this.pagination.page;
  readonly visible = this.pagination.visibleItems;

  private readonly route = inject(ActivatedRoute);
  private readonly data = inject(AdminDataService);

  readonly coachId = this.route.snapshot.paramMap.get('id') || '';
  readonly loading = signal(true);
  readonly error = signal('');
  readonly clients = signal<AdminClientRecord[]>([]);
  readonly coach = signal<AdminCoachRecord | null>(null);
  readonly query = signal('');
  readonly scope = signal<'all' | 'independent' | 'gym'>('all');
  readonly filtered = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    return this.clients().filter((client) =>
      (this.scope() === 'all' || client.scope === this.scope())
      && (!term || `${client.name} ${client.email} ${client.coachName} ${client.goal} ${client.gymName || ''}`
        .toLocaleLowerCase('es').includes(term))
    );
  });
  readonly totalPages = this.pagination.totalPages;
  readonly gymClients = computed(() => this.clients().filter((client) => client.scope === 'gym').length);
  readonly routineCount = computed(() => this.clients().reduce((total, client) => total + client.routineCount, 0));

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [clients, coach] = await Promise.all([
        this.data.listClients(this.coachId || undefined),
        this.coachId ? this.data.getCoach(this.coachId) : Promise.resolve(null)
      ]);
      this.clients.set(clients);
      this.coach.set(coach);
      this.page.set(1);
    } catch {
      this.error.set('No pudimos cargar los clientes. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  updateQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  updateScope(value: 'all' | 'independent' | 'gym'): void {
    this.scope.set(value);
    this.page.set(1);
  }

  goToPage(value: number): void {
    this.page.set(Math.min(Math.max(value, 1), this.totalPages()));
    document.querySelector<HTMLElement>('.admin-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  contextLabel(client: AdminClientRecord): string {
    return client.scope === 'gym' ? client.gymName || 'Gimnasio' : 'Entrenador independiente';
  }
}
