import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { localCalendarDate } from '../../core/data/plan-access';
import { GymContextService } from './gym-context.service';
import {
  GymBillingMembership,
  GymBillingState,
  GymMembershipPlan,
  GymPaymentRecord,
  GymSubscriptionStatus
} from './gym-payments.models';
import { GymPaymentsService } from './gym-payments.service';
import { SiteChartComponent } from '../../shared/charts/site-chart.component';
import { SiteChartPoint } from '../../shared/charts/site-chart.theme';

type PaymentsTab = 'billing' | 'plans' | 'finance';
type BillingFilter = 'all' | 'overdue' | 'due-soon' | 'active';
const positiveAmount: ValidatorFn = ({ value }) => value == null
  || (typeof value === 'number' && Number.isFinite(value) && value > 0) ? null : { positiveAmount: true };

@Component({
  selector: 'app-gym-payments',
  standalone: true,
  imports: [ListPaginationComponent, ReactiveFormsModule, RouterLink, CustomSelectComponent, SiteChartComponent],
  templateUrl: './gym-payments.component.html',
  styleUrl: './gym-payments.component.scss'
})
export class GymPaymentsComponent implements OnInit {
  readonly membershipPagination = createListPagination(() => this.filteredMemberships(), () => JSON.stringify([this.search(), this.filter()]));
  readonly paymentPagination = createListPagination(() => this.payments());
  readonly planPagination = createListPagination(() => this.plans());

  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly paymentsData = inject(GymPaymentsService);
  private readonly gyms = inject(GymContextService);

  readonly gymId = this.route.snapshot.paramMap.get('id') || '';
  readonly context = this.gyms.activeGym;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly tab = signal<PaymentsTab>('billing');
  readonly filter = signal<BillingFilter>('all');
  readonly search = signal('');
  readonly memberships = signal<GymBillingMembership[]>([]);
  readonly plans = signal<GymMembershipPlan[]>([]);
  readonly planSelectOptions = computed(() => this.plans().map((plan) => ({
    value: plan.id,
    label: `${plan.name} · ${this.formatMoney(plan.price, plan.currency)}`
  })));
  readonly payments = signal<GymPaymentRecord[]>([]);
  readonly paymentTarget = signal<GymBillingMembership | null>(null);
  readonly billingTarget = signal<GymBillingMembership | null>(null);
  readonly editingPlan = signal<GymMembershipPlan | null>(null);
  readonly planDialogOpen = signal(false);
  readonly deletePlanTarget = signal<GymMembershipPlan | null>(null);

  readonly canConfigureMemberships = computed(() => !!this.context()?.permissions.canEditClients);
  readonly canManagePlans = computed(() => {
    const role = this.context()?.role;
    return role === 'owner' || role === 'admin';
  });
  readonly filteredMemberships = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('es');
    const filter = this.filter();
    return this.memberships().filter((membership) => {
      const matchesQuery = !query || `${membership.clientName} ${membership.clientEmail} ${membership.planName || ''}`
        .toLocaleLowerCase('es').includes(query);
      if (!matchesQuery || filter === 'all') return matchesQuery;
      const state = this.billingState(membership);
      return filter === 'active' ? state === 'active' : state === filter;
    });
  });
  readonly metrics = computed(() => {
    const memberships = this.memberships();
    const now = new Date();
    const paidThisMonth = this.payments().filter((payment) => {
      if (payment.status !== 'paid' || !payment.paidDate) return false;
      const date = new Date(payment.paidDate);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
    return {
      overdue: memberships.filter((membership) => this.billingState(membership) === 'overdue').length,
      dueSoon: memberships.filter((membership) => this.billingState(membership) === 'due-soon').length,
      withoutPlan: memberships.filter((membership) => !membership.planId).length,
      paidThisMonth: paidThisMonth.reduce((total, payment) => total + payment.amount, 0)
    };
  });

  readonly financeRange = signal<'day' | 'week' | 'month' | 'year'>('month');
  readonly financePlan = signal('');
  readonly financePlanOptions = computed(() => [{value: '', label: 'Todos los planes'}, ...this.plans().map(plan => ({value:plan.id,label:plan.name}))]);
  readonly financePayments = computed(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (this.financeRange() === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    if (this.financeRange() === 'month') start.setDate(1);
    if (this.financeRange() === 'year') start.setMonth(0, 1);
    const end = new Date(start);
    if (this.financeRange() === 'day') end.setDate(end.getDate() + 1);
    if (this.financeRange() === 'week') end.setDate(end.getDate() + 7);
    if (this.financeRange() === 'month') end.setMonth(end.getMonth() + 1);
    if (this.financeRange() === 'year') end.setFullYear(end.getFullYear() + 1);
    return this.payments().filter(payment => payment.status === 'paid' && payment.paidDate
      && new Date(payment.paidDate) >= start && new Date(payment.paidDate) < end
      && (!this.financePlan() || payment.planId === this.financePlan()));
  });
  readonly financeTotals = computed(() => {
    const totals = new Map<string, { currency: string; total: number; count: number; average: number }>();
    for (const payment of this.financePayments()) {
      const item = totals.get(payment.currency) || { currency: payment.currency, total: 0, count: 0, average: 0 };
      item.total += payment.amount; item.count++; item.average = item.total / item.count;
      totals.set(payment.currency, item);
    }
    return [...totals.values()];
  });
  readonly financeCharts = computed(() => {
    const currencies = new Map<string, Map<string, SiteChartPoint>>();
    for (const payment of this.financePayments()) {
      const date = new Date(payment.paidDate!);
      const yearly = this.financeRange() === 'year';
      const key = localCalendarDate(yearly ? new Date(date.getFullYear(), date.getMonth(), 1) : date);
      const label = new Intl.DateTimeFormat('es-CR', yearly ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }).format(date);
      const buckets = currencies.get(payment.currency) ?? new Map<string, SiteChartPoint>();
      const bucket = buckets.get(key) ?? { label, date: key, value: 0 };
      bucket.value += payment.amount;
      buckets.set(key, bucket);
      currencies.set(payment.currency, buckets);
    }
    return [...currencies].map(([currency, buckets]) => ({
      currency, points: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date))
    }));
  });

  readonly paymentForm = this.fb.nonNullable.group({
    amount: this.fb.control<number | null>(null, [Validators.required, positiveAmount]),
    method: ['cash', Validators.required],
    paidDate: [localCalendarDate(), Validators.required],
    notes: ['']
  });
  readonly billingForm = this.fb.nonNullable.group({
    planId: [''],
    dueDate: [''],
    status: ['active' as GymSubscriptionStatus, Validators.required]
  });
  readonly planForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    currency: ['CRC', Validators.required],
    description: [''],
    active: [true]
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.gymId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await this.paymentsData.load(this.gymId);
      this.memberships.set(data.memberships);
      this.plans.set(data.plans);
      this.payments.set(data.payments);
    } catch {
      this.error.set('No pudimos cargar los cobros. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: PaymentsTab): void {
    this.tab.set(tab);
    this.error.set('');
  }

  setFilter(filter: BillingFilter): void {
    this.filter.set(filter);
  }

  openPayment(membership: GymBillingMembership): void {
    this.paymentTarget.set(membership);
    this.paymentForm.reset({
      amount: membership.planPrice != null && membership.planPrice > 0 ? membership.planPrice : null,
      method: 'cash',
      paidDate: localCalendarDate(),
      notes: membership.planName ? `Pago de ${membership.planName}` : ''
    });
  }

  closePayment(): void {
    if (!this.saving()) this.paymentTarget.set(null);
  }

  async submitPayment(): Promise<void> {
    const membership = this.paymentTarget();
    if (!membership || this.paymentForm.invalid || this.saving()) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const value = this.paymentForm.getRawValue();
      await this.paymentsData.registerPayment(this.gymId, membership.id, {
        amount: Number(value.amount),
        currency: membership.currency || 'CRC',
        method: value.method,
        paidDate: value.paidDate,
        notes: value.notes
      });
      this.paymentTarget.set(null);
      await this.load();
      this.notice.set(`Pago de ${membership.clientName} registrado. El próximo vencimiento quedó actualizado.`);
    } catch (error: any) {
      if (error?.code === 'PAYMENT_RECORDED_MEMBERSHIP_PENDING') {
        this.paymentTarget.set(null);
        await this.load();
        this.error.set(error.message);
      } else if (error?.code === 'PAYMENT_MEMBERSHIP_PERMISSION_REQUIRED') {
        this.error.set(error.message);
      } else {
        this.error.set('No pudimos registrar el pago. Confirma el monto y vuelve a intentarlo.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  openBilling(membership: GymBillingMembership): void {
    if (!this.canConfigureMemberships()) return;
    for (const control of [this.billingForm.controls.planId, this.billingForm.controls.status]) {
      if (this.canManagePlans()) control.enable(); else control.disable();
    }
    this.billingTarget.set(membership);
    this.billingForm.reset({
      planId: membership.planId || '',
      dueDate: membership.nextDueDate?.slice(0, 10) || '',
      status: membership.subscriptionStatus
    });
  }

  closeBilling(): void {
    if (!this.saving()) this.billingTarget.set(null);
  }

  async submitBilling(): Promise<void> {
    const membership = this.billingTarget();
    if (!membership || this.billingForm.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const value = this.billingForm.getRawValue();
      await this.paymentsData.configureMembership(this.gymId, membership.id, {
        planId: value.planId || null,
        dueDate: value.dueDate || null,
        status: value.status
      }, this.canManagePlans());
      this.billingTarget.set(null);
      await this.load();
      this.notice.set(`Membresía de ${membership.clientName} actualizada.`);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No pudimos actualizar la membresía.');
    } finally {
      this.saving.set(false);
    }
  }

  openPlan(plan?: GymMembershipPlan): void {
    if (!this.canManagePlans()) return;
    this.editingPlan.set(plan || null);
    this.planForm.reset({
      name: plan?.name || '',
      price: plan?.price ?? null,
      currency: plan?.currency || 'CRC',
      description: plan?.description || '',
      active: plan?.active ?? true
    });
    this.planDialogOpen.set(true);
  }

  closePlan(): void {
    if (!this.saving()) this.planDialogOpen.set(false);
  }

  async submitPlan(): Promise<void> {
    if (this.planForm.invalid || this.saving()) {
      this.planForm.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const value = this.planForm.getRawValue();
      await this.paymentsData.savePlan(this.gymId, {
        name: value.name,
        price: Number(value.price),
        currency: value.currency,
        description: value.description,
        active: value.active
      }, this.editingPlan()?.id);
      const edited = !!this.editingPlan();
      this.planDialogOpen.set(false);
      this.editingPlan.set(null);
      await this.load();
      this.notice.set(edited ? 'Los cambios del plan se guardaron.' : 'El plan quedó disponible para asignarlo.');
    } catch {
      this.error.set('No pudimos guardar el plan. Revisa los datos e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  requestDeletePlan(plan: GymMembershipPlan): void {
    if (!this.canManagePlans()) return;
    if (this.memberships().some((membership) => membership.planId === plan.id)) {
      this.error.set('Este plan todavía está asignado. Cambia esas membresías antes de eliminarlo.');
      return;
    }
    this.deletePlanTarget.set(plan);
  }

  async confirmDeletePlan(): Promise<void> {
    const plan = this.deletePlanTarget();
    if (!plan || this.saving()) return;
    this.saving.set(true);
    try {
      await this.paymentsData.deletePlan(this.gymId, plan.id);
      this.deletePlanTarget.set(null);
      await this.load();
      this.notice.set('El plan se eliminó.');
    } catch {
      this.error.set('No pudimos eliminar el plan. Inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  billingState(membership: GymBillingMembership): GymBillingState {
    if (membership.subscriptionStatus === 'inactive') return 'inactive';
    if (membership.subscriptionStatus === 'pending') return 'pending';
    if (membership.subscriptionStatus === 'overdue') return 'overdue';
    if (!membership.nextDueDate) return 'pending';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(membership.nextDueDate);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate < today) return 'overdue';
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 5);
    return dueDate <= soon ? 'due-soon' : 'active';
  }

  stateLabel(state: GymBillingState): string {
    if (state === 'overdue') return 'Vencido';
    if (state === 'due-soon') return 'Próximo';
    if (state === 'pending') return 'Pendiente';
    if (state === 'inactive') return 'Inactivo';
    return 'Al día';
  }

  methodLabel(method: string | null | undefined): string {
    if (method === 'cash') return 'Efectivo';
    if (method === 'card') return 'Tarjeta';
    if (method === 'transfer') return 'Transferencia';
    if (method === 'sinpe') return 'SINPE';
    return method || 'Sin método';
  }

  planAssignmentCount(planId: string): number {
    return this.memberships().filter((membership) => membership.planId === planId).length;
  }

  formatMoney(amount: number, currency = 'CRC'): string {
    return new Intl.NumberFormat('es-CR', {
      style: 'currency', currency, maximumFractionDigits: currency === 'CRC' ? 0 : 2
    }).format(amount || 0);
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${value.slice(0, 10)}T12:00:00`));
  }
}
