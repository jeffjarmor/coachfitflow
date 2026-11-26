import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  AdminCoachBillingWithdrawalRequest,
  CoachBillingWithdrawalService,
  CoachBillingWithdrawalStatus
} from '../../core/data/coach-billing-withdrawal.service';
import { CustomSelectComponent } from '../../shared/custom-select.component';

type Resolution = Exclude<CoachBillingWithdrawalStatus, 'pending'>;

const pageSize = 10;
const costaRica = 'America/Costa_Rica';
const dateFormat = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeZone: costaRica });
const timestampFormat = new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium', timeStyle: 'short', timeZone: costaRica });

@Component({
  selector: 'app-admin-billing-withdrawals',
  imports: [FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './admin-billing-withdrawals.component.html',
  styleUrl: './admin-billing-withdrawals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminBillingWithdrawalsComponent implements OnInit {
  private readonly service = inject(CoachBillingWithdrawalService);
  private readonly detail = viewChild.required<ElementRef<HTMLDialogElement>>('detail');
  private readonly listTitle = viewChild.required<ElementRef<HTMLHeadingElement>>('listTitle');
  private listRequest = 0;

  protected readonly statusOptions: { value: CoachBillingWithdrawalStatus; label: string }[] = [
    { value: 'pending', label: 'Pendientes' },
    { value: 'approved', label: 'Aprobadas' },
    { value: 'rejected', label: 'Rechazadas' }
  ];
  protected readonly statusLabels: Record<CoachBillingWithdrawalStatus, string> = {
    pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada'
  };
  protected readonly refundReminder = 'Gestioná el reintegro por el medio de pago original y los cambios de la suscripción por separado.';
  protected readonly filter = signal<CoachBillingWithdrawalStatus>('pending');
  protected readonly filterLabel = computed(() => this.statusOptions.find(option => option.value === this.filter())?.label.toLocaleLowerCase('es'));
  protected readonly rows = signal<AdminCoachBillingWithdrawalRequest[]>([]);
  protected readonly page = signal(0);
  protected readonly hasNextPage = signal(false);
  protected readonly loading = signal(true);
  protected readonly listError = signal('');
  protected readonly feedback = signal('');

  protected readonly selected = signal<AdminCoachBillingWithdrawalRequest | null>(null);
  protected readonly decision = signal<Resolution | null>(null);
  protected readonly note = signal('');
  protected readonly saving = signal(false);
  protected readonly resolutionError = signal('');

  ngOnInit(): void { void this.load(); }

  protected setFilter(value: string): void {
    const status = this.statusOptions.find(option => option.value === value);
    if (!status || status.value === this.filter()) return;
    this.filter.set(status.value);
    this.feedback.set('');
    void this.load(0);
  }

  protected async load(page = this.page()): Promise<void> {
    const request = ++this.listRequest;
    this.page.set(page);
    this.listError.set('');
    this.loading.set(true);
    try {
      const rows = await this.service.listForAdmin(this.filter(), page * pageSize, pageSize + 1);
      if (request !== this.listRequest) return;
      this.rows.set(rows.slice(0, pageSize));
      this.hasNextPage.set(rows.length > pageSize);
    } catch {
      if (request === this.listRequest) {
        this.listError.set('No pudimos cargar las solicitudes de retracto.');
      }
    } finally {
      if (request === this.listRequest) this.loading.set(false);
    }
  }

  protected open(request: AdminCoachBillingWithdrawalRequest): void {
    this.selected.set(request);
    this.decision.set(null);
    this.note.set('');
    this.resolutionError.set('');
    this.detail().nativeElement.showModal();
  }

  protected close(): void {
    if (!this.saving()) this.detail().nativeElement.close();
  }

  protected cancel(event: Event): void {
    if (this.saving()) event.preventDefault();
  }

  protected changePage(page: number): void {
    this.listTitle().nativeElement.focus();
    void this.load(page);
  }

  protected async save(): Promise<void> {
    const request = this.selected();
    const decision = this.decision();
    const note = this.note().trim();
    if (request?.status !== 'pending' || !decision || !note || this.saving()) return;

    this.saving.set(true);
    this.resolutionError.set('');
    try {
      await this.service.resolve(request.id, decision, note);
      this.detail().nativeElement.close();
      this.feedback.set(`Solicitud ${this.statusLabels[decision].toLocaleLowerCase('es')}.`);
      this.listTitle().nativeElement.focus();
      await this.load(0);
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
      if (code === '55000' || code === 'P0002') {
        this.detail().nativeElement.close();
        this.feedback.set(code === '55000'
          ? 'Otra resolución ya quedó registrada. Revisá las solicitudes aprobadas o rechazadas.'
          : 'Esta solicitud ya no está disponible.');
        this.listTitle().nativeElement.focus();
        await this.load(0);
      } else {
        this.resolutionError.set('No pudimos guardar la resolución. Podés reintentar.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected formatDate(value: string | null, includeTime = false): string {
    if (!value) return 'Sin fecha registrada';
    const date = new Date(value.length === 10 ? `${value}T12:00:00-06:00` : value);
    return Number.isFinite(date.getTime()) ? (includeTime ? timestampFormat : dateFormat).format(date) : 'Sin fecha registrada';
  }

  protected requesterName(request: AdminCoachBillingWithdrawalRequest): string {
    return request.coach?.name || request.coach?.email || (request.coach_id ? 'Entrenador' : 'Cuenta eliminada');
  }
}
