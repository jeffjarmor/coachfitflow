import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  ClientPortalContext,
  ClientPortalDataService,
  ClientPortalHistorySession,
  ClientPortalHistorySet,
  ClientPortalProfile
} from './client-portal-data.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { ClientPortalPdfService } from './client-portal-pdf.service';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';

@Component({
  selector: 'app-client-training-history',
  standalone: true,
  imports: [ListPaginationComponent, RouterLink, ClientPortalHeaderComponent, AppFooterComponent],
  templateUrl: './client-training-history.component.html',
  styleUrl: './client-training-history.component.scss'
})
export class ClientTrainingHistoryComponent implements OnInit {
  readonly pagination = createListPagination(() => this.sessions(), () => this.context()?.key);

  private readonly auth = inject(AuthService);
  private readonly portal = inject(ClientPortalDataService);
  private readonly pdf = inject(ClientPortalPdfService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly downloadError = signal('');
  readonly downloading = signal(false);
  readonly context = signal<ClientPortalContext | null>(null);
  readonly profile = signal<ClientPortalProfile | null>(null);
  readonly sessions = signal<ClientPortalHistorySession[]>([]);
  readonly completedCount = computed(() => this.sessions().filter(session => session.status === 'completed').length);
  readonly setCount = computed(() => this.allSets().length);
  readonly averageRir = computed(() => {
    const values = this.allSets().flatMap(set => set.rir == null ? [] : [set.rir]);
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.error.set('');
    this.downloadError.set('');
    try {
      const context = this.portal.initialContext(userId, await this.portal.listContexts(userId));
      if (!context) {
        this.error.set('No encontramos un perfil de cliente activo para esta cuenta.');
        return;
      }
      this.context.set(context);
      const [profile, sessions] = await Promise.all([
        this.portal.getProfile(context),
        this.portal.getTrainingHistory(context)
      ]);
      this.profile.set(profile);
      this.sessions.set(sessions);
    } catch {
      this.error.set('No pudimos cargar tu historial. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async downloadHistory(): Promise<void> {
    const context = this.context();
    const profile = this.profile();
    if (!context || !profile || !this.sessions().length || this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set('');
    try {
      await this.pdf.downloadHistory(this.sessions(), profile.name, context.label);
    } catch {
      this.downloadError.set('No pudimos generar el PDF. Inténtalo nuevamente.');
    } finally {
      this.downloading.set(false);
    }
  }

  formatDate(value: string): string {
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Sin fecha';
  }

  formatNumber(value: number | null, suffix = ''): string {
    if (value == null) return '—';
    const formatted = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value);
    return suffix ? `${formatted} ${suffix}` : formatted;
  }

  sessionSetCount(session: ClientPortalHistorySession): number {
    return session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
  }

  private allSets(): ClientPortalHistorySet[] {
    return this.sessions().flatMap(session => session.exercises.flatMap(exercise => exercise.sets));
  }
}
