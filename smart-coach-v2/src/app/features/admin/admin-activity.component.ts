import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminActivityAccessError, AdminActivityService, AdminActivitySummary, localActivityDate } from './admin-activity.service';
import { SiteChartComponent } from '../../shared/charts/site-chart.component';

@Component({
  selector: 'app-admin-activity',
  standalone: true,
  imports: [DecimalPipe, RouterLink, SiteChartComponent],
  templateUrl: './admin-activity.component.html',
  styleUrl: './admin-activity.component.scss'
})
export class AdminActivityComponent implements OnInit {
  private readonly data = inject(AdminActivityService);
  private readonly dayFormat = new Intl.DateTimeFormat('es-CR', { weekday: 'short', day: 'numeric', month: 'short' });
  private readonly dateTimeFormat = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short' });
  private readonly dateFormat = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short' });

  readonly loading = signal(true);
  readonly error = signal('');
  readonly forbidden = signal(false);
  readonly summary = signal<AdminActivitySummary | null>(null);
  readonly empty = computed(() => this.summary()?.total.logins === 0 && this.summary()?.total.routines === 0);
  readonly activityCharts = computed(() => {
    const days = [...(this.summary()?.daily || [])].sort((a, b) => a.date.localeCompare(b.date));
    return [
      { label: 'Inicios de sesión', points: days.map(day => ({ date: day.date, label: this.formatDay(day.date), value: day.logins })) },
      { label: 'Rutinas creadas', points: days.map(day => ({ date: day.date, label: this.formatDay(day.date), value: day.routines })) }
    ];
  });
  readonly todayDate = computed(() => this.summary() ? localActivityDate(new Date(this.summary()!.to)) : '');

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.forbidden.set(false);
    this.summary.set(null);
    try {
      this.summary.set(await this.data.load());
    } catch (error) {
      const forbidden = error instanceof AdminActivityAccessError;
      this.forbidden.set(forbidden);
      this.error.set(forbidden ? error.message : 'No pudimos cargar la actividad. Revisa la conexión y vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }

  formatDay(date: string): string { return this.dayFormat.format(new Date(`${date}T12:00:00`)); }
  formatUpdatedAt(date: string): string { return this.dateTimeFormat.format(new Date(date)); }
  formatPeriod(date: string): string { return this.dateFormat.format(new Date(date)); }
}
