
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, DashboardData } from '../../core/data/coach-data.service';
import { isPaidPlanCurrent, localCalendarDate } from '../../core/data/plan-access';
import { AnnouncementsComponent } from '../../shared/announcements.component';
import { ZUMMITH_CONTACT } from '../../core/config/contact';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, AnnouncementsComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly contact = ZUMMITH_CONTACT;
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly data = signal<DashboardData | null>(null);
  readonly planBannerVisible = signal(true);
  readonly planBannerClosing = signal(false);
  private bannerCloseTimer?: ReturnType<typeof setTimeout>;
  readonly planStatus = computed<'active' | 'pending' | 'standard'>(() => {
    const coach = this.data()?.coach;
    if (!coach || coach.coachPlan !== 'paid') return 'standard';
    if (!coach.nextPlanPaymentDate) return 'pending';
    return isPaidPlanCurrent(coach.nextPlanPaymentDate)
      ? 'active'
      : 'pending';
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.bannerCloseTimer);
  }

  dismissPlanBanner(title: HTMLHeadingElement): void {
    if (this.planBannerClosing()) return;
    title.focus({ preventScroll: true });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.planBannerVisible.set(false);
      return;
    }
    this.planBannerClosing.set(true);
    this.bannerCloseTimer = setTimeout(() => this.planBannerVisible.set(false), 360);
  }

  async load(): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId) return;

    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await this.coachData.getDashboard(coachId));
    } catch {
      this.error.set('No pudimos cargar tu resumen. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha definida';
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${value.slice(0, 10)}T12:00:00`));
  }

  renewalLabel(): string {
    const value = this.data()?.coach.nextPlanPaymentDate;
    if (!value) return 'Confirma el estado de tu suscripción.';
    const renewal = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
    const today = Date.parse(`${localCalendarDate()}T00:00:00Z`);
    const days = Math.round((renewal - today) / 86_400_000);
    if (days < 0) return 'El pago está vencido.';
    if (days === 0) return 'El pago vence hoy.';
    return `Faltan ${days} ${days === 1 ? 'día' : 'días'}.`;
  }
}
