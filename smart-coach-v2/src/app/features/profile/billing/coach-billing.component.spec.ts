import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../core/auth/auth.service';
import type { CoachBillingSnapshot } from '../../../core/data/coach-billing.models';
import { CoachBillingService } from '../../../core/data/coach-billing.service';
import { CoachBillingWithdrawalService } from '../../../core/data/coach-billing-withdrawal.service';
import { CoachDataService } from '../../../core/data/coach-data.service';
import { CoachBillingComponent } from './coach-billing.component';

describe('CoachBillingComponent bank verification', () => {
  const originalSdk = window.ONVO;

  afterEach(() => { window.ONVO = originalSdk; });

  it('resumes the same intent and waits for server confirmation before showing Pro', async () => {
    const key = 'onvo_live_publishable_key_example';
    const pending: CoachBillingSnapshot = {
      mode: 'onvo_live', configured: true, canSubscribe: true, publicKey: key,
      nextAction: { type: 'onvo_3ds', paymentIntentId: 'intent_pending' },
      plan: { id: 'price-pro', name: 'Pro', amount: 1815, currency: 'USD', interval: 'month', intervalCount: 1 },
      subscription: {
        id: 'sub-pro', status: 'incomplete', customerId: 'customer-pro', paymentMethodId: null,
        currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
        cancelAt: null, canceledAt: null, paidThrough: null
      },
      paymentMethod: null, invoices: [],
      checkout: { subscriptionId: 'sub-pro', customerId: 'customer-pro', publishableKey: key, mode: 'onvo_live' }
    };
    const handleNextAction = jasmine.createSpy('handleNextAction').and.resolveTo({});
    const createOnvo = jasmine.createSpy('ONVO').and.returnValue({ handleNextAction });
    window.ONVO = createOnvo;
    const subscribe = jasmine.createSpy('subscribe');
    const reconcile = jasmine.createSpy('reconcile').and.resolveTo(pending);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { user: () => null } },
      { provide: CoachBillingService, useValue: { available: true, subscribe, reconcile } },
      { provide: CoachBillingWithdrawalService, useValue: {} },
      { provide: CoachDataService, useValue: {} }
    ] });
    const component = TestBed.runInInjectionContext(() => new CoachBillingComponent());
    component.snapshot.set(pending);
    component.view.set('bank');

    await component.continueBankVerification();

    expect(createOnvo).toHaveBeenCalledOnceWith(key);
    expect(handleNextAction).toHaveBeenCalledOnceWith({ paymentIntentId: 'intent_pending' });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(subscribe).not.toHaveBeenCalled();
    expect(component.view()).toBe('bank');

    const active = { ...pending, nextAction: null, subscription: { ...pending.subscription, status: 'active' } };
    reconcile.and.resolveTo(active);
    await component.reconcile();
    expect(component.view()).toBe('confirming');

    reconcile.and.resolveTo({ ...active, subscription: { ...active.subscription, paidThrough: '2026-12-25' } });
    await component.reconcile();
    expect(component.view()).toBe('confirmed');
  });
});
