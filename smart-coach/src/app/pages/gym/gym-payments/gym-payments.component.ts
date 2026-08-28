import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith, tap } from 'rxjs/operators';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { PaymentService } from '../../../services/payment.service';
import { ClientService } from '../../../services/client.service';
import { MembershipPlanService } from '../../../services/membership-plan.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmService } from '../../../services/confirm.service';
import { Client } from '../../../models/client.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { CreatePaymentData, Payment } from '../../../models/payment.model';
import { MembershipPlan } from '../../../models/membership-plan.model';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { hasGymOwnerAccess } from '../../../models/gym-coach.model';

type FilterStatus = 'all' | 'overdue' | 'due-soon' | 'paid';
type ActiveTab = 'payments' | 'plans' | 'finance';
type FinanceRange = 'day' | 'week' | 'month' | 'year';

interface FinanceBucket {
  label: string;
  total: number;
  count: number;
}

@Component({
  selector: 'app-gym-payments',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, ButtonComponent, ReactiveFormsModule],
  templateUrl: './gym-payments.component.html',
  styleUrls: ['./gym-payments.component.scss']
})
export class GymPaymentsComponent {
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private paymentService = inject(PaymentService);
  private clientService = inject(ClientService);
  private membershipPlanService = inject(MembershipPlanService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);
  private authService = inject(AuthService);
  private coachService = inject(CoachService);
  private gymService = inject(GymService);

  gymId = signal<string>('');
  clients = signal<Client[]>([]);
  payments = signal<Payment[]>([]);
  membershipPlans = signal<MembershipPlan[]>([]);
  loading = signal(true);
  savingPlan = signal(false);
  canManagePlans = signal(false);
  chargeModalOpen = signal(false);
  chargingClient = signal<Client | null>(null);
  chargeAmount = signal<number | null>(null);
  charging = signal(false);

  activeTab = signal<ActiveTab>('payments');

  // Search & Filter for clients list
  searchControl = new FormControl('');
  filterStatus = signal<FilterStatus>('all');

  searchQuery = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(250),
      distinctUntilChanged(),
      tap(() => this.currentPage.set(1))
    ),
    { initialValue: '' }
  );

  // Pagination
  currentPage = signal(1);
  itemsPerPage = 10;

  // Membership creation form
  membershipForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    price: [null, [Validators.required, Validators.min(0)]],
    description: [''],
    active: [true]
  });
  editingPlanId = signal<string | null>(null);

  // Finance controls
  financeRange = signal<FinanceRange>('month');
  selectedPlanFilter = signal<string>('all');

  filteredClients = computed(() => {
    const query = this.searchQuery()?.toLowerCase() || '';
    const status = this.filterStatus();
    const all = this.clients();

    return all.filter(c => {
      const matchesSearch =
        !query ||
        c.name.toLowerCase().includes(query) ||
        c.email.toLowerCase().includes(query);

      if (!matchesSearch) return false;
      if (status === 'all') return true;
      return this.getClientStatus(c) === status;
    });
  });

  paginatedClients = computed(() => {
    const clients = this.filteredClients();
    const start = (this.currentPage() - 1) * this.itemsPerPage;
    return clients.slice(start, start + this.itemsPerPage);
  });

  totalPages = computed(() => Math.ceil(this.filteredClients().length / this.itemsPerPage) || 1);

  paidPaymentsInRange = computed(() => {
    const { start, end } = this.getRangeBounds(this.financeRange());
    const selectedPlan = this.selectedPlanFilter();

    return this.payments().filter(payment => {
      if (payment.status !== 'paid') return false;
      if (selectedPlan !== 'all' && payment.membershipPlanId !== selectedPlan) return false;

      const paidDate = this.toDate(payment.paidDate || payment.createdAt);
      return paidDate >= start && paidDate <= end;
    });
  });

  financeTotals = computed(() => {
    const items = this.paidPaymentsInRange();
    const total = items.reduce((acc, item) => acc + (item.amount || 0), 0);
    return {
      total,
      paymentsCount: items.length,
      average: items.length ? total / items.length : 0
    };
  });

  financeChart = computed<FinanceBucket[]>(() => {
    const range = this.financeRange();
    const payments = this.paidPaymentsInRange();
    return this.buildBuckets(range, payments);
  });

  chartMax = computed(() => Math.max(...this.financeChart().map(b => b.total), 1));

  constructor() {
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.gymId.set(params['id']);
        this.loadData();
      }
    });
  }

  async loadData() {
    const id = this.gymId();
    if (!id) return;

    try {
      this.loading.set(true);
      const userId = this.authService.getCurrentUserId();
      const [clientsData, plans, payments, gym, coach, staffMember] = await Promise.all([
        this.clientService.getGymClients(id),
        this.membershipPlanService.getPlans(id),
        this.paymentService.getAllPayments(id),
        this.gymService.getGym(id),
        userId ? this.coachService.getCoachProfile(userId) : Promise.resolve(null),
        userId ? this.gymService.getGymCoach(id, userId) : Promise.resolve(null)
      ]);
      this.canManagePlans.set(
        !!userId && (coach?.role === 'admin' || hasGymOwnerAccess(gym, staffMember, userId))
      );

      const plansById = new Map((plans || []).map(p => [p.id, p]));
      const normalizedClients = (clientsData || []).map((client) => {
        const linkedPlan = client.membershipPlanId ? plansById.get(client.membershipPlanId) : undefined;
        return {
          ...client,
          membershipPlanName: client.membershipPlanName || linkedPlan?.name || '',
          membershipPrice: client.membershipPrice ?? linkedPlan?.price ?? 0,
          membershipCurrency: client.membershipCurrency || linkedPlan?.currency || 'CRC'
        } as Client;
      });

      this.clients.set(normalizedClients);
      this.membershipPlans.set(plans);
      this.payments.set(payments);
    } catch (error) {
      console.error('Error loading payments module data:', error);
      this.toastService.error('Error al cargar pagos y membresías');
    } finally {
      this.loading.set(false);
    }
  }

  setActiveTab(tab: ActiveTab) {
    this.activeTab.set(tab);
  }

  setFilter(status: FilterStatus) {
    this.filterStatus.set(status);
    this.currentPage.set(1);
  }

  setFinanceRange(range: FinanceRange) {
    this.financeRange.set(range);
  }

  setPlanFilter(planId: string) {
    this.selectedPlanFilter.set(planId);
  }

  getClientStatus(client: Client): 'overdue' | 'due-soon' | 'paid' {
    if (!client.nextPaymentDueDate) return 'overdue';

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const date = this.toDate(client.nextPaymentDueDate);
    date.setHours(0, 0, 0, 0);

    if (date < now) return 'overdue';

    const threeDays = new Date(now);
    threeDays.setDate(now.getDate() + 3);

    if (date <= threeDays) return 'due-soon';
    return 'paid';
  }

  async updateDueDate(client: Client, event: Event) {
    const target = event.target as HTMLInputElement;
    const newDateStr = target.value;
    if (!newDateStr) return;

    const newDate = new Date(newDateStr);

    try {
      await this.clientService.updateGymClient(this.gymId(), client.id, {
        nextPaymentDueDate: newDate
      });
      await this.loadData();
      this.toastService.success('Fecha de cobro actualizada');
    } catch (err) {
      console.error('Error updating due date', err);
      this.toastService.error('No se pudo actualizar la fecha');
    }
  }

  openChargeModal(client: Client) {
    const baseAmount = client.membershipPrice ?? 0;
    this.chargingClient.set(client);
    this.chargeAmount.set(baseAmount > 0 ? baseAmount : null);
    this.chargeModalOpen.set(true);
  }

  closeChargeModal(force = false) {
    if (this.charging() && !force) return;
    this.chargeModalOpen.set(false);
    this.chargingClient.set(null);
    this.chargeAmount.set(null);
  }

  async confirmCharge() {
    const client = this.chargingClient();
    if (!client) return;

    const amount = Number(this.chargeAmount() ?? 0);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      this.toastService.error('Ingresa un monto válido para registrar el pago.');
      return;
    }

    try {
      this.charging.set(true);
      const paymentData: CreatePaymentData = {
        clientId: client.id || '',
        clientName: client.name,
        membershipPlanId: client.membershipPlanId,
        membershipPlanName: client.membershipPlanName,
        amount,
        currency: client.membershipCurrency || 'CRC',
        method: 'cash',
        notes: client.membershipPlanName ? `Pago membresía: ${client.membershipPlanName}` : 'Pago mensual',
        dueDate: new Date()
      };

      await this.paymentService.registerPayment(this.gymId(), paymentData);
      await this.loadData();
      this.toastService.success('Pago registrado correctamente.');
      this.charging.set(false);
      this.closeChargeModal(true);
    } catch (error) {
      console.error('Error registering payment', error);
      this.toastService.error('No se pudo registrar el pago.');
    } finally {
      this.charging.set(false);
    }
  }

  async createMembershipPlan() {
    if (!this.canManagePlans()) return;
    if (this.membershipForm.invalid) {
      this.membershipForm.markAllAsTouched();
      return;
    }

    try {
      this.savingPlan.set(true);
      const v = this.membershipForm.value;
      const payload = {
        name: (v.name || '').trim(),
        price: Number(v.price || 0),
        description: (v.description || '').trim(),
        active: !!v.active,
        currency: 'CRC'
      };

      if (this.editingPlanId()) {
        const planId = this.editingPlanId()!;
        await this.membershipPlanService.updatePlan(this.gymId(), planId, payload);
        this.toastService.success('Membresía actualizada');
      } else {
        await this.membershipPlanService.createPlan(this.gymId(), payload);
        this.toastService.success('Membresía creada');
      }

      this.cancelEditPlan();
      await this.loadData();
    } catch (error) {
      console.error('Error creating membership plan:', error);
      this.toastService.error('No se pudo guardar la membresía.');
    } finally {
      this.savingPlan.set(false);
    }
  }

  startEditPlan(plan: MembershipPlan) {
    if (!this.canManagePlans()) return;
    this.editingPlanId.set(plan.id);
    this.membershipForm.patchValue({
      name: plan.name,
      price: plan.price,
      description: plan.description || '',
      active: plan.active
    });
  }

  cancelEditPlan() {
    this.editingPlanId.set(null);
    this.membershipForm.reset({ name: '', price: null, description: '', active: true });
  }

  async togglePlanStatus(plan: MembershipPlan) {
    if (!this.canManagePlans()) return;
    try {
      await this.membershipPlanService.updatePlan(this.gymId(), plan.id, { active: !plan.active });
      await this.loadData();
      this.toastService.success('Estado de membresía actualizado');
    } catch (error) {
      console.error('Error updating plan status:', error);
      this.toastService.error('No se pudo actualizar la membresía.');
    }
  }

  async deletePlan(plan: MembershipPlan) {
    if (!this.canManagePlans()) return;
    const inUse = this.clients().some(c => c.membershipPlanId === plan.id);
    if (inUse) {
      this.toastService.error('No puedes eliminar una membresía que ya está asignada a clientes.');
      return;
    }

    const confirmed = await this.confirmService.confirm({
      title: 'Eliminar membresía',
      message: `¿Eliminar la membresía "${plan.name}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      await this.membershipPlanService.deletePlan(this.gymId(), plan.id);
      await this.loadData();
      this.toastService.success('Membresía eliminada');
    } catch (error) {
      console.error('Error deleting plan:', error);
      this.toastService.error('No se pudo eliminar la membresía.');
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(p => p + 1);
  }

  prevPage() {
    if (this.currentPage() > 1) this.currentPage.update(p => p - 1);
  }

  private toDate(value: any): Date {
    if (!value) return new Date(0);
    if (value instanceof Date) return new Date(value);
    if (typeof value?.toDate === 'function') return value.toDate();
    return new Date(value);
  }

  private getRangeBounds(range: FinanceRange): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (range === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (range === 'week') {
      const day = now.getDay(); // 0=Sun
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(now.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    if (range === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    // year
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  private buildBuckets(range: FinanceRange, payments: Payment[]): FinanceBucket[] {
    if (range === 'day') {
      const buckets: FinanceBucket[] = Array.from({ length: 24 }, (_, h) => ({
        label: `${h.toString().padStart(2, '0')}h`,
        total: 0,
        count: 0
      }));
      payments.forEach(p => {
        const d = this.toDate(p.paidDate || p.createdAt);
        const h = d.getHours();
        buckets[h].total += p.amount || 0;
        buckets[h].count += 1;
      });
      return buckets;
    }

    if (range === 'week') {
      const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      const buckets: FinanceBucket[] = labels.map(l => ({ label: l, total: 0, count: 0 }));
      payments.forEach(p => {
        const d = this.toDate(p.paidDate || p.createdAt);
        const day = d.getDay();
        const idx = day === 0 ? 6 : day - 1;
        buckets[idx].total += p.amount || 0;
        buckets[idx].count += 1;
      });
      return buckets;
    }

    if (range === 'month') {
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const buckets: FinanceBucket[] = Array.from({ length: daysInMonth }, (_, i) => ({
        label: `${i + 1}`,
        total: 0,
        count: 0
      }));
      payments.forEach(p => {
        const d = this.toDate(p.paidDate || p.createdAt);
        const idx = d.getDate() - 1;
        if (idx >= 0 && idx < buckets.length) {
          buckets[idx].total += p.amount || 0;
          buckets[idx].count += 1;
        }
      });
      return buckets;
    }

    // year
    const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const buckets: FinanceBucket[] = labels.map(l => ({ label: l, total: 0, count: 0 }));
    payments.forEach(p => {
      const d = this.toDate(p.paidDate || p.createdAt);
      const idx = d.getMonth();
      buckets[idx].total += p.amount || 0;
      buckets[idx].count += 1;
    });
    return buckets;
  }
}
