import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminCoachRecord, AdminDataService } from './admin-data.service';

@Component({
  selector: 'app-admin-coaches',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './admin-coaches.component.html',
  styleUrl: './admin-coaches.component.scss'
})
export class AdminCoachesComponent implements OnInit {
  readonly pagination = createListPagination(() => this.filtered(), () => JSON.stringify([this.query(), this.plan()]));
  readonly page = this.pagination.page;
  readonly visible = this.pagination.visibleItems;

  private readonly data = inject(AdminDataService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly coaches = signal<AdminCoachRecord[]>([]);
  readonly query = signal('');
  readonly plan = signal<'all' | 'standard' | 'paid'>('all');
  readonly filtered = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    return this.coaches().filter((coach) =>
      (this.plan() === 'all' || coach.coachPlan === this.plan())
      && (!term || `${coach.name} ${coach.email} ${coach.affiliations.map((item) => item.gymName).join(' ')}`
        .toLocaleLowerCase('es').includes(term))
    );
  });
  readonly totalPages = this.pagination.totalPages;
  readonly paidCount = computed(() => this.coaches().filter((coach) => coach.coachPlan === 'paid').length);
  readonly gymCount = computed(() => new Set(this.coaches().flatMap((coach) => coach.affiliations.map((item) => item.gymId))).size);
  readonly clientCount = computed(() => this.coaches().reduce((total, coach) => total + coach.clientCount, 0));

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.coaches.set(await this.data.listCoaches());
      this.page.set(1);
    } catch {
      this.error.set('No pudimos cargar los entrenadores. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  updateQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  updatePlan(value: 'all' | 'standard' | 'paid'): void {
    this.plan.set(value);
    this.page.set(1);
  }

  goToPage(value: number): void {
    this.page.set(Math.min(Math.max(value, 1), this.totalPages()));
    document.querySelector<HTMLElement>('.admin-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  coachType(coach: AdminCoachRecord): string {
    if (coach.role === 'admin') return 'Administrador';
    if (coach.affiliations.length) return 'Equipo de gimnasio';
    return 'Entrenador independiente';
  }
}
