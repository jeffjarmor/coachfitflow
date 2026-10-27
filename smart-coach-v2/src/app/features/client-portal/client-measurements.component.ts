import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  ClientPortalContext,
  ClientPortalDataService,
  ClientPortalMeasurement
} from './client-portal-data.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';
import { SiteChartComponent } from '../../shared/charts/site-chart.component';
import { measurementChartPoints, MeasurementMetric } from '../../shared/charts/measurement-chart';

@Component({
  selector: 'app-client-measurements',
  standalone: true,
  imports: [ListPaginationComponent, RouterLink, ClientPortalHeaderComponent, AppFooterComponent, SiteChartComponent],
  templateUrl: './client-measurements.component.html',
  styleUrl: './client-measurements.component.scss'
})
export class ClientMeasurementsComponent implements OnInit {
  readonly pagination = createListPagination(() => this.measurements(), () => this.context()?.key);

  private readonly auth = inject(AuthService);
  private readonly portal = inject(ClientPortalDataService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly context = signal<ClientPortalContext | null>(null);
  readonly measurements = signal<ClientPortalMeasurement[]>([]);
  readonly selectedMetric = signal<MeasurementMetric>('weight');
  readonly historyExpanded = signal(false);
  readonly latest = computed(() => this.measurements()[0] ?? null);
  readonly chartPoints = computed(() => measurementChartPoints(this.measurements(), this.selectedMetric(), 10));

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
      this.measurements.set(await this.portal.getMeasurements(context));
    } catch {
      this.error.set('No pudimos cargar tus mediciones. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  selectMetric(metric: MeasurementMetric): void {
    this.selectedMetric.set(metric);
  }

  toggleHistory(): void {
    this.historyExpanded.update(expanded => !expanded);
  }

  metricLabel(metric: MeasurementMetric = this.selectedMetric()): string {
    return ({ weight: 'Peso', bodyFatPercentage: 'Grasa corporal', muscleMass: 'Masa muscular' })[metric];
  }

  metricUnit(metric: MeasurementMetric = this.selectedMetric()): string {
    return metric === 'bodyFatPercentage' ? '%' : 'kg';
  }

  changeText(metric: MeasurementMetric): string {
    const comparable = this.measurements().flatMap(measurement => {
      const value = measurement[metric];
      return value == null || !Number.isFinite(Number(value)) ? [] : [Number(value)];
    });
    if (comparable.length < 2) return 'Sin control anterior comparable';
    const difference = comparable[0] - comparable[1];
    if (difference === 0) return 'Sin cambio desde el control anterior';
    return `${difference > 0 ? '↑' : '↓'} ${this.formatValue(Math.abs(difference), this.metricUnit(metric))} desde el anterior`;
  }

  formatDate(value: string): string {
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Sin fecha';
  }

  formatValue(value: number | null, unit = '', maximumFractionDigits = 1): string {
    if (value == null || !Number.isFinite(Number(value))) return 'Sin registrar';
    const formatted = new Intl.NumberFormat('es-CR', { maximumFractionDigits }).format(Number(value));
    return unit ? `${formatted} ${unit}` : formatted;
  }

}
