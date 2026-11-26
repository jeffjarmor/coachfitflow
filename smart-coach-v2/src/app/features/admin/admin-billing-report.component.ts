import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { createListPagination, LIST_PAGE_SIZES } from '../../shared/list-pagination';
import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { MonthCalendarComponent } from '../../shared/month-calendar.component';
import { SiteChartComponent } from '../../shared/charts/site-chart.component';
import { AdminBillingDataService, AdminBillingReport, BillingCurrency } from './admin-billing-data.service';
import { adminBillingCsv } from './admin-billing-csv';

type ChartMetric = 'netMinor' | 'grossMinor';

@Component({
  selector: 'app-admin-billing-report',
  standalone: true,
  imports: [FormsModule, CustomSelectComponent, ListPaginationComponent, MonthCalendarComponent, SiteChartComponent],
  templateUrl: './admin-billing-report.component.html',
  styleUrl: './admin-billing-report.component.scss'
})
export class AdminBillingReportComponent implements OnInit {
  private readonly data = inject(AdminBillingDataService);
  private requestId = 0;

  readonly month = signal(this.currentMonth());
  readonly currency = signal<BillingCurrency>('USD');
  readonly chartMetric = signal<ChartMetric>('netMinor');
  readonly settlementId = signal('');
  readonly loading = signal(true);
  readonly error = signal('');
  readonly report = signal<AdminBillingReport | null>(null);
  readonly monthLabel = computed(() => new Intl.DateTimeFormat('es-CR', {
    month: 'long', timeZone: 'America/Costa_Rica'
  }).format(new Date(`${this.month()}-01T12:00:00-06:00`)));
  readonly settlementOptions = computed(() => [
    { value: '', label: 'Todas' },
    ...(this.report()?.settlements ?? []).map((row) => ({
      value: row.id,
      label: row.reference || this.formatDate(row.date)
    }))
  ]);
  readonly visibleSettlements = computed(() => (this.report()?.settlements ?? []).filter(
    (row) => !this.settlementId() || row.id === this.settlementId()
  ));
  readonly hasPayoutFees = computed(() => this.visibleSettlements().some((row) => row.payoutFeeMinor != null));
  readonly paidMovementsCount = computed(() => (this.report()?.movements ?? []).filter((row) => row.status === 'paid').length);
  readonly movementsPagination = createListPagination(() => this.report()?.movements ?? [], () => `${this.month()}:${this.currency()}`);
  readonly firstPageSize = LIST_PAGE_SIZES[0];
  readonly recordedInvoiceMinor = computed(() => (this.report()?.movements ?? []).reduce((sum, item) => sum + item.amountMinor, 0));
  readonly netSettledMinor = computed(() => this.sumSettlements('netMinor'));
  readonly collectionPoints = computed(() => this.dailyPoints(
    this.report()?.movements.filter((row) => row.status === 'paid') ?? [],
    (row) => row.amountMinor
  ));
  readonly settlementPoints = computed(() => {
    const metric = this.chartMetric();
    return this.dailyPoints(this.visibleSettlements(), (row) => row[metric]);
  });

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    const request = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);
    try {
      const report = await this.data.report(this.month(), this.currency());
      if (request === this.requestId) {
        if (!report.settlements.some((row) => row.id === this.settlementId())) this.settlementId.set('');
        this.report.set(report);
      }
    } catch {
      if (request === this.requestId) this.error.set('No pudimos cargar la conciliación de este período. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }

  updateMonth(value: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value === this.month()) return;
    this.month.set(value);
    void this.load();
  }

  updateCurrency(value: string): void {
    if (!['USD', 'CRC'].includes(value) || value === this.currency()) return;
    this.currency.set(value as BillingCurrency);
    void this.load();
  }

  amount(minor: number | null | undefined): string {
    if (minor == null || !Number.isFinite(minor)) return 'No disponible';
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: this.currency(), minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  }

  decimalAmount(minor: number | null): string {
    if (minor == null || !Number.isFinite(minor)) return 'No disponible';
    return new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100);
  }

  formatDate(value: string | null | undefined): string {
    const date = this.safeDate(value);
    return date ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Costa_Rica' }).format(date) : 'Sin fecha';
  }

  formatDay(value: string): string {
    const date = this.safeDate(value);
    return date ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', timeZone: 'America/Costa_Rica' }).format(date) : value;
  }

  statusLabel(value: string): string {
    switch (value) {
      case 'paid': return 'Pagada';
      case 'draft': return 'Borrador';
      case 'open': return 'Pendiente';
      case 'void': return 'Anulada';
      case 'uncollectible': return 'Incobrable';
      case 'failed': return 'Fallida';
      default: return 'Registrada';
    }
  }

  previousComparison(): string {
    const report = this.report();
    if (!report) return '';
    return `Mes anterior: ${this.amount(report.previousCollectedMinor)}`;
  }

  settlementTotal(field: 'grossMinor' | 'feesMinor' | 'payoutFeeMinor' | 'retentionsMinor' | 'netMinor'): string {
    return this.amount(this.sumSettlements(field));
  }

  exportCsv(): void {
    const report = this.report();
    if (!report) return;
    const blob = new Blob([adminBillingCsv(report, this.currency())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `conciliacion-${this.month()}-${this.currency().toLowerCase()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private currentMonth(): string {
    const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Costa_Rica' }).formatToParts(new Date());
    return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
  }

  private safeDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value.length === 10 ? `${value}T12:00:00-06:00` : value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  private localDate(value: string): string {
    const date = this.safeDate(value);
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
  }

  private dailyPoints<T extends { date: string }>(rows: readonly T[], amount: (row: T) => number) {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const day = this.localDate(row.date);
      if (day) totals.set(day, (totals.get(day) ?? 0) + amount(row));
    }
    return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, minor]) => ({
      date,
      label: this.formatDay(date),
      value: minor / 100
    }));
  }

  private sumSettlements(field: 'grossMinor' | 'feesMinor' | 'payoutFeeMinor' | 'retentionsMinor' | 'netMinor'): number | null {
    const rows = this.visibleSettlements();
    if (!rows.length || rows.some((row) => row[field] == null || !Number.isFinite(row[field]))) return null;
    return rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
  }
}
