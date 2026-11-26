import { Component, ElementRef, EventEmitter, Injector, Input, OnInit, Output, ViewChild, afterNextRender, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ZUMMITH_CONTACT } from '../../../core/config/contact';
import { CoachBillingService, BillingSimulationScenario } from '../../../core/data/coach-billing.service';
import {
  CoachBillingSnapshot,
  billingState,
  checkoutCallbackAction,
  formatBillingInterval,
  formatBillingPrice,
  getOnvoBillingCheckout
} from '../../../core/data/coach-billing.models';
import {
  COACH_BILLING_WITHDRAWAL_LABELS,
  CoachBillingWithdrawalRequest,
  CoachBillingWithdrawalService,
  CoachBillingWithdrawalSubscription
} from '../../../core/data/coach-billing-withdrawal.service';
import { CoachDataService, CoachProfile } from '../../../core/data/coach-data.service';
import { hasActiveIndependentPro } from '../../../core/data/plan-access';
import { MonthCalendarComponent } from '../../../shared/month-calendar.component';

type BillingView = 'overview' | 'review' | 'payment' | 'bank' | 'confirming' | 'confirmed' | 'failed' | 'replace' | 'card_saved' | 'cancel' | 'cancelled' | 'withdrawal';
type OnvoSdk = {
  pay: (options: {
    onError: (data: unknown) => void;
    onSuccess: (data: unknown) => void;
    publicKey: string;
    subscriptionId: string;
    paymentType: 'subscription';
    customerId: string;
    locale: 'es';
  }) => { render: (selector: string) => unknown };
};

const billingDateFormatter = new Intl.DateTimeFormat('es-CR', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Costa_Rica'
});
const withdrawalDateFormatter = new Intl.DateTimeFormat('es-CR', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Costa_Rica'
});
const invoiceStatusLabels = {
  paid: 'Pagado',
  failed: 'Fallido',
  pending: 'Pendiente',
  processing: 'En proceso'
};

declare global {
  interface Window { onvo?: OnvoSdk; }
}

@Component({
  selector: 'app-coach-billing',
  standalone: true,
  imports: [MonthCalendarComponent, RouterLink],
  templateUrl: './coach-billing.component.html',
  styleUrl: './coach-billing.component.scss'
})
export class CoachBillingComponent implements OnInit {
  @Input({ required: true }) profile!: CoachProfile;
  @Output() readonly profileUpdated = new EventEmitter<CoachProfile>();
  @ViewChild('paymentHost') private paymentHost?: ElementRef<HTMLDivElement>;
  @ViewChild('withdrawalHeading') private withdrawalHeading?: ElementRef<HTMLHeadingElement>;

  private readonly auth = inject(AuthService);
  private readonly billing = inject(CoachBillingService);
  private readonly withdrawal = inject(CoachBillingWithdrawalService);
  private readonly coachData = inject(CoachDataService);
  private readonly injector = inject(Injector);

  readonly contact = ZUMMITH_CONTACT;
  readonly billingAvailable = this.billing.available;
  readonly snapshot = signal<CoachBillingSnapshot | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly sdkLoading = signal(false);
  readonly view = signal<BillingView>('overview');
  readonly error = signal('');
  readonly notice = signal('');
  readonly cardError = signal('');
  readonly localScenario = signal<BillingSimulationScenario | null>(null);
  readonly withdrawalRequests = signal<CoachBillingWithdrawalRequest[]>([]);
  readonly withdrawalLoading = signal(true);
  readonly withdrawalError = signal('');
  readonly withdrawalNotice = signal('');
  readonly withdrawalSubscriptionChanged = signal(false);
  readonly withdrawalLabels = COACH_BILLING_WITHDRAWAL_LABELS;
  private readonly withdrawalSubscription = signal<CoachBillingWithdrawalSubscription | null>(null);
  readonly canRequestWithdrawal = computed(() => {
    const subscription = this.withdrawalSubscription();
    return !!subscription?.subscription_id && !this.withdrawalLoading() && !this.withdrawalError()
      && !this.withdrawalRequests().some(request => request.billing_mode === subscription.mode
        && request.subscription_id === subscription.subscription_id);
  });
  readonly state = computed(() => {
    const data = this.snapshot();
    if (!data) return 'loading';
    if (!data.subscription && hasActiveIndependentPro(this.profile)) return 'legacy';
    return billingState(data);
  });

  async ngOnInit(): Promise<void> {
    if (!this.billingAvailable) {
      this.loading.set(false);
      this.withdrawalLoading.set(false);
      return;
    }
    await Promise.all([this.load(), this.loadWithdrawal()]);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const snapshot = await this.billing.status();
      this.snapshot.set(snapshot);
      await this.refreshProfileForConfirmedServerState(snapshot);
    } catch {
      this.error.set('Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadWithdrawal(): Promise<void> {
    this.withdrawalLoading.set(true);
    this.withdrawalError.set('');
    try {
      const [subscription, requests] = await Promise.all([
        this.withdrawal.currentSubscription(this.profile.id),
        this.withdrawal.listForCoach(this.profile.id)
      ]);
      this.withdrawalSubscription.set(subscription);
      this.withdrawalRequests.set(requests);
    } catch {
      this.withdrawalError.set('No pudimos consultar el trámite de retracto. Intentá de nuevo.');
    } finally {
      this.withdrawalLoading.set(false);
    }
  }

  get isSimulator(): boolean {
    return this.snapshot()?.mode === 'simulator';
  }

  get isLiveBilling(): boolean {
    return this.snapshot()?.mode === 'onvo_live';
  }

  get proPlanName(): string {
    const name = this.snapshot()?.plan.name || 'Pro';
    return this.isSimulator && name === 'Pro (local simulation)' ? 'Pro (simulación local)' : name;
  }

  get formattedPrice(): string {
    const plan = this.snapshot()?.plan;
    return plan ? formatBillingPrice(plan) : 'Precio sin configurar';
  }

  get formattedInterval(): string {
    const plan = this.snapshot()?.plan;
    return plan ? formatBillingInterval(plan) : 'Frecuencia de cobro sin configurar';
  }

  get currentPeriodEnd(): string | null {
    const subscription = this.snapshot()?.subscription;
    return subscription?.cancelAt || subscription?.currentPeriodEnd || subscription?.paidThrough || null;
  }

  get paidThrough(): string | null {
    return this.snapshot()?.subscription?.paidThrough || this.snapshot()?.subscription?.currentPeriodEnd || null;
  }

  get latestUnpaidInvoice(): CoachBillingSnapshot['invoices'][number] | null {
    const unpaid = (this.snapshot()?.invoices || []).filter(invoice => !['paid', 'succeeded'].includes(invoice.status.toLowerCase()));
    return unpaid.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
  }

  get canReviewPlan(): boolean {
    const data = this.snapshot();
    return !!data?.configured && (data.mode !== 'onvo_live' || data.canSubscribe === true)
      && ['standard', 'canceled'].includes(this.state()) && !this.hasCurrentProAccess();
  }

  get canResumeSubscription(): boolean {
    const data = this.snapshot();
    return this.state() === 'canceling' && !!data?.configured && (data.mode !== 'onvo_live' || data.canSubscribe === true);
  }

  get canResumeCheckout(): boolean {
    return this.state() === 'payment_pending' && !!getOnvoBillingCheckout(this.snapshot());
  }

  hasCurrentProAccess(): boolean {
    const snapshot = this.snapshot();
    return hasActiveIndependentPro(this.profile)
      || (snapshot?.subscription?.status === 'canceled' && !!snapshot.subscription.paidThrough && this.isFutureDate(snapshot.subscription.paidThrough));
  }

  get canManagePaymentMethod(): boolean {
    const status = this.snapshot()?.subscription?.status;
    return !this.isLiveBilling && !!this.snapshot()?.subscription && !!this.snapshot()?.configured
      && ['active', 'trialing', 'past_due', 'unpaid'].includes(status || '');
  }

  startReview(): void {
    if (!this.canReviewPlan || this.busy()) return;
    this.error.set('');
    this.notice.set('');
    this.view.set('review');
  }

  async continueToPayment(): Promise<void> {
    if (this.busy()) return;
    const data = this.snapshot();
    if (!data?.configured || !this.canReviewPlan) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const updated = await this.billing.subscribe();
      this.snapshot.set(updated);
      this.localScenario.set(null);
      if (updated.mode === 'simulator') {
        this.view.set('payment');
      } else if (updated.subscription?.status === 'active' || updated.subscription?.status === 'trialing') {
        this.view.set('confirmed');
        await this.refreshProfileForConfirmedServerState(updated);
      } else if (getOnvoBillingCheckout(updated)) {
        this.goToPaymentRetry();
      } else {
        this.error.set('La sesión de pago está pendiente. Consulta el estado del pago antes de volver a intentarlo.');
        this.view.set('confirming');
      }
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      this.error.set(code === 'legacy_pro_active'
        ? 'Tu acceso a Pro ya está pagado hasta la fecha indicada. Puedes iniciar la suscripción después de esa fecha.'
        : 'No pudimos iniciar el pago. Tu plan sigue igual. Inténtalo de nuevo.');
      this.view.set('review');
    } finally {
      this.busy.set(false);
    }
  }

  async resumePro(): Promise<void> {
    if (this.busy() || !this.canResumeSubscription) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await this.billing.subscribe();
      this.snapshot.set(updated);
      this.notice.set('Reactivamos la renovación de Pro sin iniciar un cobro nuevo.');
      this.view.set('overview');
      await this.refreshProfileForConfirmedServerState(updated);
    } catch {
      this.error.set('No pudimos reactivar la renovación de Pro. Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  async simulate(scenario: BillingSimulationScenario): Promise<void> {
    if (!this.isSimulator || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.localScenario.set(scenario);
    try {
      const updated = await this.billing.simulate(scenario);
      this.snapshot.set(updated);
      if (scenario === 'requires_action' || updated.nextAction?.type === 'simulated_bank') {
        this.view.set('bank');
      } else if (scenario === 'decline' || scenario === 'renewal_failed' || billingState(updated) === 'past_due') {
        this.view.set('failed');
      } else if (billingState(updated) === 'active' || billingState(updated) === 'canceling') {
        this.view.set('confirmed');
        await this.refreshProfileForConfirmedServerState(updated);
      } else {
        this.view.set('confirming');
      }
    } catch {
      this.error.set('No pudimos completar la simulación. Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  async reconcile(resumeCheckout = false): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await this.billing.reconcile();
      this.snapshot.set(updated);
      const state = billingState(updated);
      if (state === 'active' || state === 'canceling') {
        this.view.set('confirmed');
        await this.refreshProfileForConfirmedServerState(updated);
      } else if (state === 'action_required') {
        this.view.set('bank');
      } else if (state === 'past_due' || state === 'canceled') {
        this.view.set('failed');
      } else if (resumeCheckout && this.canResumeCheckout) {
        this.goToPaymentRetry();
      } else {
        this.view.set('confirming');
      }
    } catch {
      this.error.set('No pudimos confirmar el último pago. Consulta su estado antes de iniciar otro.');
      this.view.set('confirming');
    } finally {
      this.busy.set(false);
    }
  }

  onCheckoutCallback(kind: 'success' | 'error'): void {
    const action = checkoutCallbackAction(kind);
    if (action !== 'reconcile') return;
    if (kind === 'error') this.error.set('No pudimos completar el pago. Estamos verificando su estado antes de que vuelvas a intentarlo.');
    this.view.set('confirming');
    void this.reconcile();
  }

  goToPaymentRetry(): void {
    if (!this.isSimulator && !getOnvoBillingCheckout(this.snapshot())) return;
    this.error.set('');
    this.view.set('payment');
    if (!this.isSimulator) setTimeout(() => { void this.mountOnvoCheckout(); }, 0);
  }

  openBankAction(): void {
    const url = this.bankActionUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  get bankActionUrl(): string | null {
    const url = this.snapshot()?.nextAction?.url;
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  startReplacement(): void {
    if (!this.canManagePaymentMethod || this.busy()) return;
    this.cardError.set('');
    this.error.set('');
    this.view.set('replace');
  }

  async replacePaymentMethod(event: SubmitEvent, form: HTMLFormElement): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const snapshot = this.snapshot();
    if (!snapshot || !this.canManagePaymentMethod) return;
    this.busy.set(true);
    this.cardError.set('');
    this.error.set('');
    try {
      const paymentMethodId = snapshot.mode === 'simulator'
        ? 'sim-pm-replacement'
        : await this.billing.tokenizeReplacementCard(form, snapshot, { name: this.profile.name, email: this.profile.email });
      const updated = await this.billing.changePaymentMethod(paymentMethodId);
      this.snapshot.set(updated);
      this.view.set('card_saved');
      await this.refreshProfileForConfirmedServerState(updated);
    } catch {
      this.cardError.set('No pudimos actualizar el método de pago. Revisa los datos e inténtalo de nuevo.');
    } finally {
      form.reset();
      this.busy.set(false);
    }
  }

  startCancellation(): void {
    if (this.busy() || this.state() !== 'active') return;
    this.error.set('');
    this.view.set('cancel');
  }

  async confirmCancellation(): Promise<void> {
    if (this.busy() || this.state() !== 'active') return;
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await this.billing.cancel();
      this.snapshot.set(updated);
      this.view.set('cancelled');
      await this.refreshProfileForConfirmedServerState(updated);
    } catch {
      this.error.set('No pudimos programar la cancelación. Tu suscripción sigue activa. Inténtalo de nuevo.');
    } finally {
      this.busy.set(false);
    }
  }

  startWithdrawal(): void {
    if (this.busy() || !this.canRequestWithdrawal()) return;
    this.withdrawalError.set('');
    this.withdrawalNotice.set('');
    this.withdrawalSubscriptionChanged.set(false);
    this.view.set('withdrawal');
    this.focusWithdrawalHeading();
  }

  async confirmWithdrawal(): Promise<void> {
    const subscriptionId = this.withdrawalSubscription()?.subscription_id;
    if (this.busy() || this.view() !== 'withdrawal' || !subscriptionId) return;
    this.busy.set(true);
    this.withdrawalError.set('');
    try {
      const receipt = await this.withdrawal.request(subscriptionId);
      this.withdrawalRequests.update(requests => [receipt, ...requests.filter(request => request.id !== receipt.id)]);
      this.withdrawalNotice.set('Recibimos tu solicitud de retracto. Podés consultar su estado aquí.');
      this.view.set('overview');
      this.focusWithdrawalHeading();
    } catch (error: unknown) {
      if ((error as { code?: string } | null)?.code === '22023') {
        this.view.set('overview');
        await this.loadWithdrawal();
        this.withdrawalSubscriptionChanged.set(true);
        this.focusWithdrawalHeading();
      } else {
        this.withdrawalError.set('No pudimos confirmar el envío. Intentá de nuevo para obtener tu número de solicitud.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  private focusWithdrawalHeading(): void {
    afterNextRender(() => this.withdrawalHeading?.nativeElement.focus(), { injector: this.injector });
  }

  formatWithdrawalDate(value: string): string {
    return withdrawalDateFormatter.format(new Date(value));
  }

  backToOverview(): void {
    const leavingWithdrawal = this.view() === 'withdrawal';
    this.error.set('');
    this.cardError.set('');
    this.view.set('overview');
    if (leavingWithdrawal) {
      this.withdrawalError.set('');
      this.focusWithdrawalHeading();
    } else {
      void this.loadWithdrawal();
    }
  }

  statusLabel(): string {
    switch (this.state()) {
      case 'setup': return 'Sin configurar';
      case 'standard': return 'Estándar';
      case 'legacy': return 'Acceso Pro';
      case 'active': return 'Activa';
      case 'canceling': return 'Cancelación programada';
      case 'canceled': return 'Cancelada';
      case 'past_due': return 'Pago fallido';
      case 'action_required': return 'Acción requerida';
      case 'payment_pending': return 'Pago pendiente';
      default: return 'Cargando';
    }
  }

  statusMessage(): string {
    switch (this.state()) {
      case 'setup': return this.isSimulator
        ? 'El simulador local de facturación todavía no está configurado.'
        : 'El plan Pro no está disponible en este momento. Inténtalo más tarde o contacta a soporte.';
      case 'standard': return 'Tu cuenta está en el plan Estándar.';
      case 'legacy': return `Tu acceso a Pro está pagado hasta ${this.formatDate(this.profile.nextPlanPaymentDate)}. El cobro automático aún está desactivado.`;
      case 'active': return 'Tus funciones Pro están activas durante este período.';
      case 'canceling': return `Tu suscripción dejará de renovarse. Mantendrás el acceso a Pro hasta ${this.formatDate(this.currentPeriodEnd)}.`;
      case 'canceled': return this.paidThrough && this.isFutureDate(this.paidThrough)
        ? `Tu suscripción está cancelada. Mantendrás el acceso a Pro hasta ${this.formatDate(this.paidThrough)}.`
        : 'Tu suscripción está cancelada y tu acceso a Pro terminó.';
      case 'past_due': return this.isLiveBilling
        ? 'No pudimos confirmar el último pago. Consultá su estado o escribinos si necesitás actualizar el método de pago.'
        : 'No pudimos confirmar el último pago. Actualiza el método de pago y vuelve a consultar el estado.';
      case 'action_required': return 'Completa la verificación de tu banco y vuelve aquí para consultar el estado del pago.';
      case 'payment_pending': return 'Estamos verificando tu pago. Tu plan se actualizará cuando lo confirmemos.';
      default: return '';
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'el final de este período de facturación';
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
    return Number.isNaN(date.getTime()) ? 'el final de este período de facturación' : billingDateFormatter.format(date);
  }

  formatInvoiceAmount(amount: number, currency: string): string {
    return formatBillingPrice({ amount, currency });
  }

  invoiceStatus(status: string): string {
    return invoiceStatusLabels[this.invoiceStatusKind(status)];
  }

  invoiceStatusKind(status: string): keyof typeof invoiceStatusLabels {
    const value = status.toLowerCase();
    if (value === 'paid') return 'paid';
    if (['failed', 'unpaid', 'past_due'].includes(value)) return 'failed';
    if (['pending', 'open', 'draft'].includes(value)) return 'pending';
    return 'processing';
  }

  get canStartSubscription(): boolean {
    return this.canReviewPlan;
  }

  get simulatorRenewalActionAvailable(): boolean {
    return this.isSimulator && ['active', 'canceling'].includes(this.state());
  }

  private async refreshProfileForConfirmedServerState(snapshot: CoachBillingSnapshot): Promise<void> {
    if (!snapshot.subscription || !['active', 'trialing', 'canceled', 'past_due', 'unpaid'].includes(snapshot.subscription.status)) return;
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      const profile = await this.coachData.getProfile(userId);
      this.profileUpdated.emit(profile);
    } catch {
      // Billing state is still server-confirmed; profile reload can be retried by reopening this section.
    }
  }

  private async mountOnvoCheckout(): Promise<void> {
    const checkout = getOnvoBillingCheckout(this.snapshot());
    const host = this.paymentHost?.nativeElement;
    if (!checkout || !host || this.view() !== 'payment') return;
    this.sdkLoading.set(true);
    try {
      await this.loadOnvoScript();
      if (this.view() !== 'payment' || this.paymentHost?.nativeElement !== host
        || getOnvoBillingCheckout(this.snapshot()) !== checkout) return;
      if (!window.onvo) throw new Error('SDK unavailable');
      host.replaceChildren();
      window.onvo.pay({
        onError: () => this.onCheckoutCallback('error'),
        onSuccess: () => this.onCheckoutCallback('success'),
        publicKey: checkout.publishableKey,
        subscriptionId: checkout.subscriptionId,
        paymentType: 'subscription',
        customerId: checkout.customerId,
        locale: 'es'
      }).render('#coach-onvo-checkout');
    } catch {
      this.error.set('No pudimos cargar el formulario de pago de ONVO. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.sdkLoading.set(false);
    }
  }

  private loadOnvoScript(): Promise<void> {
    if (window.onvo) return Promise.resolve();
    const current = document.querySelector<HTMLScriptElement>('script[data-coach-onvo-sdk]');
    if (current?.dataset['loaded'] === 'true') return Promise.resolve();
    if (current?.dataset['loading'] === 'true') {
      return new Promise((resolve, reject) => {
        current.addEventListener('load', () => resolve(), { once: true });
        current.addEventListener('error', () => reject(new Error('SDK unavailable')), { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = current || document.createElement('script');
      script.src = 'https://sdk.onvopay.com/sdk.js';
      script.async = true;
      script.dataset['coachOnvoSdk'] = 'true';
      script.dataset['loading'] = 'true';
      script.addEventListener('load', () => {
        script.dataset['loading'] = 'false';
        script.dataset['loaded'] = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => {
        script.dataset['loading'] = 'false';
        reject(new Error('SDK unavailable'));
      }, { once: true });
      if (!current) document.head.append(script);
    });
  }

  private isFutureDate(value: string): boolean {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.getTime() >= new Date().setHours(0, 0, 0, 0);
  }
}
