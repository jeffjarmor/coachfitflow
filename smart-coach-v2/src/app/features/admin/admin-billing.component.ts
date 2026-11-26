import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { createListPagination } from '../../shared/list-pagination';
import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { AdminBillingDataService, AdminBillingCoachPlan } from './admin-billing-data.service';
import { AdminBillingReportComponent } from './admin-billing-report.component';
import { AdminBillingWithdrawalsComponent } from './admin-billing-withdrawals.component';

type PlanFilter = 'all' | 'standard' | 'paid';
type AccessStatus = 'active' | 'expiring' | 'expired' | 'standard' | 'unknown';
type AccessFilter = 'all' | Exclude<AccessStatus, 'unknown'>;
type BillingTab = 'plans' | 'charts' | 'withdrawals';
const billingTabs: BillingTab[] = ['plans', 'charts', 'withdrawals'];

@Component({
  selector: 'app-admin-billing',
  standalone: true,
  imports: [FormsModule, RouterLink, ListPaginationComponent, CustomSelectComponent, AdminBillingReportComponent, AdminBillingWithdrawalsComponent],
  templateUrl: './admin-billing.component.html',
  styleUrl: './admin-billing.component.scss'
})
export class AdminBillingComponent implements OnInit {
  private readonly data = inject(AdminBillingDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly today = signal(this.todayCostaRica());
  private plansRequest = 0;

  readonly tab = signal<BillingTab>('plans');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly plans = signal<AdminBillingCoachPlan[]>([]);
  readonly query = signal('');
  readonly planFilter = signal<PlanFilter>('all');
  readonly accessFilter = signal<AccessFilter>('all');
  readonly filtered = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    const accessFilter = this.accessFilter();
    return this.plans().filter((row) => {
      const access = this.accessStatus(row);
      return (this.planFilter() === 'all' || row.plan === this.planFilter())
        && (accessFilter === 'all' || access === accessFilter || (accessFilter === 'active' && access === 'expiring'))
        && (!term || `${row.name} ${row.email}`.toLocaleLowerCase('es').includes(term));
    });
  });
  readonly pagination = createListPagination(() => this.filtered(), () => JSON.stringify([this.query(), this.planFilter(), this.accessFilter()]));
  readonly activeProCount = computed(() => this.plans().filter((row) => ['active', 'expiring'].includes(this.accessStatus(row))).length);
  readonly expiringProCount = computed(() => this.plans().filter((row) => this.accessStatus(row) === 'expiring').length);
  readonly standardCount = computed(() => this.plans().filter((row) => row.plan === 'standard').length);
  readonly expiredProCount = computed(() => this.plans().filter((row) => row.plan === 'paid' && this.accessStatus(row) === 'expired').length);

  ngOnInit(): void {
    this.route.queryParamMap.pipe(
      map((params): BillingTab => {
        const tab = params.get('tab');
        return tab === 'charts' || tab === 'withdrawals' ? tab : 'plans';
      }),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((next) => {
      this.tab.set(next);
      if (next === 'plans') void this.loadPlans();
    });
  }

  setTab(next: BillingTab): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: next === 'plans' ? null : next },
      queryParamsHandling: 'merge'
    });
  }

  tabKey(event: KeyboardEvent): void {
    const active = billingTabs.indexOf(this.tab());
    let index: number;
    switch (event.key) {
      case 'ArrowLeft': index = (active + billingTabs.length - 1) % billingTabs.length; break;
      case 'ArrowRight': index = (active + 1) % billingTabs.length; break;
      case 'Home': index = 0; break;
      case 'End': index = billingTabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    this.setTab(billingTabs[index]);
    (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
  }

  async loadPlans(): Promise<void> {
    const request = ++this.plansRequest;
    this.loading.set(true);
    this.error.set('');
    try {
      const rows = await this.data.listPlans();
      if (request !== this.plansRequest) return;
      this.today.set(this.todayCostaRica());
      this.plans.set(rows);
      this.pagination.reset();
    } catch {
      if (request === this.plansRequest) this.error.set('No pudimos cargar los planes. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      if (request === this.plansRequest) this.loading.set(false);
    }
  }

  accessStatus(row: AdminBillingCoachPlan): AccessStatus {
    if (row.plan !== 'paid') return 'standard';
    const day = row.accessThrough?.slice(0, 10) ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'unknown';
    const remaining = Date.parse(`${day}T00:00:00Z`) - Date.parse(`${this.today()}T00:00:00Z`);
    if (!Number.isFinite(remaining)) return 'unknown';
    if (remaining < 0) return 'expired';
    return remaining <= 7 * 86_400_000 ? 'expiring' : 'active';
  }

  readonly accessLabels: Record<AccessStatus, string> = {
    active: 'Vigente', expiring: 'Vence pronto', expired: 'Vencido', standard: 'Sin Pro', unknown: 'Fecha no registrada'
  };

  renewalLabel(value: AdminBillingCoachPlan['renewal']): string {
    switch (value) {
      case 'automatic': return 'Automática';
      case 'disabled': return 'Desactivada';
      case 'pending': return 'Pendiente';
      case 'failed': return 'Fallida';
      default: return 'Sin renovación registrada';
    }
  }

  initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return words.length > 1
      ? `${words[0][0]}${words.at(-1)?.[0]}`.toLocaleUpperCase('es')
      : words[0].slice(0, 2).toLocaleUpperCase('es');
  }

  accessDate(value: string | null): string {
    const day = value?.slice(0, 10) ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'Sin fecha registrada';
    const date = new Date(`${day}T12:00:00-06:00`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return 'Sin fecha registrada';
    return date.toLocaleDateString('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' });
  }

  private todayCostaRica(): string {
    const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Costa_Rica' }).formatToParts(new Date());
    return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
  }
}
