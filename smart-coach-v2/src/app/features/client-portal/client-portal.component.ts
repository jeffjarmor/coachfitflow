import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';
import {
  ClientPortalContext,
  ClientPortalDataService,
  ClientPortalOverview
} from './client-portal-data.service';

type PortalSection = 'routines' | 'measurements' | 'payments' | 'profile';

@Component({
  selector: 'app-client-portal',
  standalone: true,
  imports: [ListPaginationComponent, ClientPortalHeaderComponent, RouterLink, CustomSelectComponent, AppFooterComponent],
  templateUrl: './client-portal.component.html',
  styleUrl: './client-portal.component.scss'
})
export class ClientPortalComponent implements OnInit {
  readonly routinePagination = createListPagination(() => this.overview()?.routines || [], () => this.currentContext()?.key);
  readonly measurementPagination = createListPagination(() => this.overview()?.measurements || [], () => this.currentContext()?.key);

  private readonly auth = inject(AuthService);
  private readonly data = inject(ClientPortalDataService);
  private readonly router = inject(Router);
  private loadSequence = 0;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly contexts = signal<ClientPortalContext[]>([]);
  readonly currentContext = signal<ClientPortalContext | null>(null);
  readonly overview = signal<ClientPortalOverview | null>(null);
  readonly expandedSection = signal<PortalSection | null>('routines');
  readonly firstName = computed(() => this.overview()?.clientName.trim().split(/\s+/)[0] || 'bienvenido');

  toggleSection(section: PortalSection): void {
    this.expandedSection.update(current => current === section ? null : section);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      await this.router.navigateByUrl('/login');
      return;
    }

    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set('');
    try {
      const contexts = await this.data.listContexts(userId);
      if (sequence !== this.loadSequence) return;
      const selected = this.data.initialContext(userId, contexts);
      this.contexts.set(contexts.filter(context => context.available));
      if (!selected) {
        this.overview.set(null);
        this.currentContext.set(null);
        this.error.set(contexts.length
          ? 'El acceso a tu portal está pausado. Consulta con tu entrenador o gimnasio.'
          : 'No encontramos un perfil de cliente vinculado a esta cuenta.');
        return;
      }
      this.currentContext.set(selected);
      this.data.rememberContext(userId, selected);
      this.overview.set(await this.data.getOverview(selected));
    } catch {
      if (sequence === this.loadSequence) {
        this.error.set('No pudimos cargar tu información. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  async switchContext(key: string): Promise<void> {
    const userId = this.auth.user()?.id;
    const selected = this.contexts().find(context => context.key === key);
    if (!userId || !selected || selected.key === this.currentContext()?.key) return;

    const sequence = ++this.loadSequence;
    this.currentContext.set(selected);
    this.data.rememberContext(userId, selected);
    this.loading.set(true);
    this.error.set('');
    try {
      const overview = await this.data.getOverview(selected);
      if (sequence === this.loadSequence) this.overview.set(overview);
    } catch {
      if (sequence === this.loadSequence) {
        this.overview.set(null);
        this.error.set('No pudimos cambiar de perfil. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin fecha definida';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
      : 'Sin fecha definida';
  }

  formatNumber(value: number | null, unit: string): string {
    return value == null ? 'Sin registrar' : `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
