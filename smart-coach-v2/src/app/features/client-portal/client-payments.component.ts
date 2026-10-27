import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClientPortalBilling, ClientPortalContext, ClientPortalDataService } from './client-portal-data.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';

@Component({
  selector: 'app-client-payments',
  standalone: true,
  imports: [ListPaginationComponent, RouterLink, ClientPortalHeaderComponent, AppFooterComponent],
  templateUrl: './client-payments.component.html',
  styleUrl: './client-payments.component.scss'
})
export class ClientPaymentsComponent implements OnInit {
  readonly pagination = createListPagination(() => this.billing()?.payments || [], () => this.context()?.key);

  private readonly auth = inject(AuthService);
  private readonly portal = inject(ClientPortalDataService);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly context = signal<ClientPortalContext | null>(null);
  readonly billing = signal<ClientPortalBilling | null>(null);

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const context = this.portal.initialContext(userId, await this.portal.listContexts(userId));
      if (!context) { this.error.set('No encontramos un perfil de cliente activo para esta cuenta.'); return; }
      this.context.set(context);
      this.billing.set(await this.portal.getBilling(context));
    } catch {
      this.error.set('No pudimos cargar el estado de tu membresía. Revisa tu conexión e inténtalo de nuevo.');
    } finally { this.loading.set(false); }
  }

  statusLabel(status: ClientPortalBilling['subscriptionStatus']): string {
    return ({ active: 'Al día', pending: 'Pendiente', overdue: 'Vencida', inactive: 'Inactiva' })[status];
  }

  paymentStatus(status: ClientPortalBilling['payments'][number]['status']): string {
    return ({ paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido', cancelled: 'Cancelado' })[status];
  }

  methodLabel(method: string | null): string {
    if (!method) return 'Método no indicado';
    return ({ cash: 'Efectivo', sinpe: 'SINPE', transfer: 'Transferencia', card: 'Tarjeta' } as Record<string, string>)[method] || method;
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin fecha definida';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Sin fecha definida';
  }

  formatMoney(value: number | null, currency: string): string {
    if (value == null) return 'Monto no definido';
    try { return new Intl.NumberFormat('es-CR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value); }
    catch { return `${new Intl.NumberFormat('es-CR').format(value)} ${currency}`; }
  }
}
