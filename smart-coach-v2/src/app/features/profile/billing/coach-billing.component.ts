import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { CoachBillingService, BillingSimulationScenario } from '../../../core/data/coach-billing.service';
import {
  CoachBillingSnapshot,
  billingState,
  checkoutCallbackAction,
  formatBillingInterval,
  formatBillingPrice
} from '../../../core/data/coach-billing.models';
import { CoachDataService, CoachProfile } from '../../../core/data/coach-data.service';
import { hasActiveIndependentPro } from '../../../core/data/plan-access';

type BillingView = 'overview' | 'review' | 'payment' | 'bank' | 'confirming' | 'confirmed' | 'failed' | 'replace' | 'card_saved' | 'cancel' | 'cancelled';
type OnvoSdk = {
  pay: (options: {
    onError: (data: unknown) => void;
    onSuccess: (data: unknown) => void;
    publicKey: string;
    subscriptionId: string;
    paymentType: 'subscription';
    customerId: string;
    locale: 'en';
  }) => { render: (selector: string) => unknown };
};

declare global {
  interface Window { onvo?: OnvoSdk; }
}

@Component({
  selector: 'app-coach-billing',
  standalone: true,
  templateUrl: './coach-billing.component.html',
  styleUrl: './coach-billing.component.scss'
})
export class CoachBillingComponent implements OnInit {
  @Input({ required: true }) profile!: CoachProfile;
  @Output() readonly profileUpdated = new EventEmitter<CoachProfile>();
  @ViewChild('paymentHost') private paymentHost?: ElementRef<HTMLDivElement>;

  private readonly auth = inject(AuthService);
  private readonly billing = inject(CoachBillingService);
  private readonly coachData = inject(CoachDataService);

  readonly snapshot = signal<CoachBillingSnapshot | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly sdkLoading = signal(false);
  readonly view = signal<BillingView>('overview');
  readonly error = signal('');
  readonly notice = signal('');
  readonly cardError = signal('');
  readonly localScenario = signal<BillingSimulationScenario | null>(null);
  readonly state = computed(() => {
    const data = this.snapshot();
    if (!data) return 'loading';
    if (!data.subscription && hasActiveIndependentPro(this.profile)) return 'legacy';
    return billingState(data);
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const snapshot = await this.billing.status();
      this.snapshot.set(snapshot);
      if (snapshot.mode === 'simulator' && !snapshot.configured) {
        this.notice.set(snapshot.configurationMessage || 'The local billing simulator is not configured yet.');
      }
      await this.refreshProfileForConfirmedServerState(snapshot);
    } catch {
      this.error.set('We couldn’t load your billing details. Check your local connection and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  get isSimulator(): boolean {
    return this.snapshot()?.mode === 'simulator';
  }

  get formattedPrice(): string {
    const plan = this.snapshot()?.plan;
    return plan ? formatBillingPrice(plan) : 'Price not configured';
  }

  get formattedInterval(): string {
    const plan = this.snapshot()?.plan;
    return plan ? formatBillingInterval(plan) : 'Billing interval not configured';
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
    return !!data?.configured && ['standard', 'canceled'].includes(this.state()) && !this.hasCurrentProAccess();
  }

  hasCurrentProAccess(): boolean {
    const snapshot = this.snapshot();
    return hasActiveIndependentPro(this.profile)
      || (snapshot?.subscription?.status === 'canceled' && !!snapshot.subscription.paidThrough && this.isFutureDate(snapshot.subscription.paidThrough));
  }

  get canManagePaymentMethod(): boolean {
    const status = this.snapshot()?.subscription?.status;
    return !!this.snapshot()?.subscription && !!this.snapshot()?.configured
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
      } else if (updated.checkout?.mode === 'onvo_test' && updated.checkout.subscriptionId && updated.checkout.customerId) {
        this.view.set('payment');
        setTimeout(() => { void this.mountOnvoCheckout(); }, 0);
      } else {
        this.error.set('Your subscription is waiting for a payment session. Check its status before trying again.');
        this.view.set('confirming');
      }
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      this.error.set(code === 'legacy_pro_active'
        ? 'Pro access is already paid for through the date shown. You can start billing after that date.'
        : 'We couldn’t start checkout. Your plan has not changed. Try again.');
      this.view.set('review');
    } finally {
      this.busy.set(false);
    }
  }

  async resumePro(): Promise<void> {
    if (this.busy() || this.state() !== 'canceling') return;
    this.busy.set(true);
    this.error.set('');
    try {
      const updated = await this.billing.subscribe();
      this.snapshot.set(updated);
      this.notice.set('Your Pro renewal is active again. No new first-period charge was started.');
      this.view.set('overview');
      await this.refreshProfileForConfirmedServerState(updated);
    } catch {
      this.error.set('We couldn’t keep your Pro subscription active. Try again.');
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
      this.error.set('The local test scenario could not be completed. No plan change was confirmed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  async reconcile(): Promise<void> {
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
      } else {
        this.view.set('confirming');
      }
    } catch {
      this.error.set('We couldn’t confirm the latest payment. Check again before starting another one.');
      this.view.set('confirming');
    } finally {
      this.busy.set(false);
    }
  }

  onCheckoutCallback(kind: 'success' | 'error'): void {
    const action = checkoutCallbackAction(kind);
    if (action !== 'reconcile') return;
    if (kind === 'error') this.error.set('The payment could not be completed. We’re checking the final status before you retry.');
    this.view.set('confirming');
    void this.reconcile();
  }

  goToPaymentRetry(): void {
    this.error.set('');
    this.view.set('payment');
    if (this.snapshot()?.mode === 'onvo_test') setTimeout(() => { void this.mountOnvoCheckout(); }, 0);
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
      this.cardError.set('We couldn’t update this payment method. Check the details and try again.');
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
      this.error.set('We couldn’t schedule the cancellation. Your subscription has not changed. Try again.');
    } finally {
      this.busy.set(false);
    }
  }

  backToOverview(): void {
    this.error.set('');
    this.cardError.set('');
    this.view.set('overview');
  }

  statusLabel(): string {
    switch (this.state()) {
      case 'setup': return 'Setup needed';
      case 'standard': return 'Standard';
      case 'legacy': return 'Pro access';
      case 'active': return 'Active';
      case 'canceling': return 'Cancellation scheduled';
      case 'canceled': return 'Canceled';
      case 'past_due': return 'Payment failed';
      case 'action_required': return 'Action needed';
      case 'payment_pending': return 'Payment pending';
      default: return 'Loading';
    }
  }

  statusMessage(): string {
    switch (this.state()) {
      case 'setup': return this.snapshot()?.configurationMessage || 'The Pro plan is not available yet. Try again later or contact support.';
      case 'standard': return 'You don’t have an active Pro subscription.';
      case 'legacy': return `Your existing Pro access is paid through ${this.formatDate(this.profile.nextPlanPaymentDate)}. Automatic billing is not managing this access yet.`;
      case 'active': return 'Your Pro features are active for this billing period.';
      case 'canceling': return `Your subscription will not renew. Pro access continues through ${this.formatDate(this.currentPeriodEnd)}.`;
      case 'canceled': return this.paidThrough && this.isFutureDate(this.paidThrough)
        ? `Your subscription is canceled. Pro access remains available through ${this.formatDate(this.paidThrough)}.`
        : 'Your subscription is canceled and your Pro access has ended.';
      case 'past_due': return 'Your last payment could not be confirmed. Update your payment method, then check the latest status.';
      case 'action_required': return 'Complete your bank’s verification, then return here to check the payment.';
      case 'payment_pending': return 'Your payment is being checked. Your plan will update after the server confirms it.';
      default: return '';
    }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'the end of this billing period';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'the end of this billing period';
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }

  formatInvoiceAmount(amount: number, currency: string): string {
    return formatBillingPrice({ amount, currency });
  }

  invoiceStatus(status: string): string {
    if (status.toLowerCase() === 'paid') return 'Paid';
    if (['failed', 'unpaid', 'past_due'].includes(status.toLowerCase())) return 'Failed';
    if (['pending', 'open', 'draft'].includes(status.toLowerCase())) return 'Pending';
    return 'Processing';
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
    const checkout = this.snapshot()?.checkout;
    const snapshot = this.snapshot();
    const host = this.paymentHost?.nativeElement;
    if (!checkout || !host || this.view() !== 'payment') return;
    this.sdkLoading.set(true);
    try {
      if (snapshot?.mode !== 'onvo_test' || checkout.mode !== 'onvo_test' || !checkout.publishableKey.startsWith('onvo_test_')) {
        throw new Error('Test checkout key unavailable');
      }
      await this.loadOnvoScript();
      if (!window.onvo) throw new Error('SDK unavailable');
      host.replaceChildren();
      window.onvo.pay({
        onError: () => this.onCheckoutCallback('error'),
        onSuccess: () => this.onCheckoutCallback('success'),
        publicKey: checkout.publishableKey,
        subscriptionId: checkout.subscriptionId,
        paymentType: 'subscription',
        customerId: checkout.customerId,
        locale: 'en'
      }).render('#coach-onvo-checkout');
    } catch {
      this.error.set('ONVO checkout could not be loaded. Your plan has not changed. Check your connection and try again.');
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
