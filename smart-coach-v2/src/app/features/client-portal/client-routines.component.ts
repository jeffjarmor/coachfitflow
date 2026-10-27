import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClientPortalContext, ClientPortalDataService, ClientPortalRoutine } from './client-portal-data.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';

@Component({
  selector: 'app-client-routines',
  standalone: true,
  imports: [ListPaginationComponent, RouterLink, ClientPortalHeaderComponent, AppFooterComponent],
  templateUrl: './client-routines.component.html',
  styleUrl: './client-routines.component.scss'
})
export class ClientRoutinesComponent implements OnInit {
  readonly pagination = createListPagination(() => this.routines(), () => this.context()?.key);

  private readonly auth = inject(AuthService);
  private readonly portal = inject(ClientPortalDataService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly context = signal<ClientPortalContext | null>(null);
  readonly routines = signal<ClientPortalRoutine[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const context = this.portal.initialContext(userId, await this.portal.listContexts(userId));
      if (!context) {
        this.error.set('No encontramos un perfil de cliente activo para esta cuenta.');
        return;
      }
      this.context.set(context);
      this.routines.set(await this.portal.getRoutines(context));
    } catch {
      this.error.set('No pudimos cargar tus rutinas. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin fecha definida';
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
      : 'Sin fecha definida';
  }
}
