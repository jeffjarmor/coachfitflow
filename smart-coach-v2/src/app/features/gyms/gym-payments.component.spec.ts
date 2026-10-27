import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { GymContextService } from './gym-context.service';
import { GymContext } from './gym.models';
import { GymPaymentsComponent } from './gym-payments.component';
import { GymBillingMembership, GymMembershipPlan } from './gym-payments.models';
import { GymPaymentsService } from './gym-payments.service';

const ownerContext: GymContext = {
  gym: { id: 'gym', name: 'Gimnasio de prueba', accessCode: 'TEST12' }, role: 'owner', roleLabel: 'Dueño', primaryOwner: true,
  permissions: { canEditClients: true, canCreateRoutines: true, canViewPayments: true, canManageStaff: true, canManageSettings: true }
};
const membership: GymBillingMembership = {
  id: 'membership', clientId: 'client', clientName: 'Cliente de prueba', clientEmail: 'client@example.invalid',
  planId: 'plan', planName: 'Mensual', planPrice: 25.5, currency: 'USD', subscriptionStatus: 'active'
};

describe('Gym payment and plan DOM form contracts', () => {
  let fixture: ComponentFixture<GymPaymentsComponent>;
  let component: GymPaymentsComponent;
  let data: jasmine.SpyObj<GymPaymentsService>;

  beforeEach(async () => {
    data = jasmine.createSpyObj<GymPaymentsService>('GymPaymentsService', ['load', 'registerPayment', 'savePlan']);
    data.load.and.resolveTo({ memberships: [membership], plans: [], payments: [] });
    data.registerPayment.and.resolveTo('receipt');
    data.savePlan.and.resolveTo('plan');
    await TestBed.configureTestingModule({ imports: [GymPaymentsComponent], providers: [
      provideRouter([]), { provide: GymPaymentsService, useValue: data },
      { provide: GymContextService, useValue: { activeGym: signal(ownerContext) } }
    ] }).compileComponents();
    spyOn(TestBed.inject(ActivatedRoute).snapshot.paramMap, 'get').and.callFake(key => key === 'id' ? 'gym' : null);
    fixture = TestBed.createComponent(GymPaymentsComponent);
    component = fixture.componentInstance;
    await settle();
  });

  async function settle(): Promise<void> { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function form(): HTMLFormElement { return fixture.nativeElement.querySelector('[role="dialog"] form'); }
  function input(id: string): HTMLInputElement | HTMLTextAreaElement { return fixture.nativeElement.querySelector(`#${id}`); }
  function enter(id: string, value: string): void {
    const control = input(id); control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true })); control.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }
  async function submit(): Promise<void> {
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle();
  }

  it('defaults to the Costa Rica calendar day at night even when UTC has advanced to the following day', () => {
    const instant = new Date('2026-10-16T00:30:00Z');
    // Fix the local calendar to Costa Rica independently of the CI browser's
    // own timezone, while the mocked instant and its ISO date remain in UTC.
    const localParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Costa_Rica', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(instant);
    const part = (type: string) => Number(localParts.find(value => value.type === type)!.value);
    jasmine.clock().install();
    jasmine.clock().mockDate(instant);
    try {
      spyOn(Date.prototype, 'getFullYear').and.returnValue(part('year'));
      spyOn(Date.prototype, 'getMonth').and.returnValue(part('month') - 1);
      spyOn(Date.prototype, 'getDate').and.returnValue(part('day'));
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-16');
      const fresh = TestBed.runInInjectionContext(() => new GymPaymentsComponent());
      expect(fresh.paymentForm.controls.paidDate.value).toBe('2026-10-15');
      component.openPayment(membership); fixture.detectChanges();
      expect(input('payment-date').value).toBe('2026-10-15');
    } finally { jasmine.clock().uninstall(); }
  });

  it('accepts a positive fractional payment allowed by the original app and passes a number to the service', async () => {
    component.openPayment(membership); await settle();
    enter('payment-amount', '0.50');
    expect(component.paymentForm.valid).toBeTrue();
    expect((input('payment-amount') as HTMLInputElement).validity.valid).toBeTrue();
    await submit();
    expect(data.registerPayment).toHaveBeenCalledOnceWith('gym', membership.id,
      jasmine.objectContaining({ amount: 0.5, currency: 'USD', method: 'cash' }));
    expect(component.paymentTarget()).toBeNull();
  });

  it('does not create a free plan merely because the user left its required price untouched', async () => {
    component.openPlan(); await settle(); enter('plan-name', 'Plan sin precio');
    expect(input('plan-price').value).toBe('');
    expect(component.planForm.invalid).toBeTrue();
    await submit();
    expect(data.savePlan).not.toHaveBeenCalled();
    expect(component.planDialogOpen()).toBeTrue();
  });

  it('preserves an explicitly entered zero price and edits decimal prices without replacing inactive state', async () => {
    component.openPlan(); await settle(); enter('plan-name', 'Plan gratuito'); enter('plan-price', '0');
    await submit();
    expect(data.savePlan).toHaveBeenCalledWith('gym', jasmine.objectContaining({ price: 0 }), undefined);
    const plan: GymMembershipPlan = { id: 'free', gymId: 'gym', name: 'Plan gratuito', price: 0, currency: 'USD', active: false };
    component.openPlan(plan); await settle();
    expect(input('plan-price').value).toBe('0');
    enter('plan-price', '49.95');
    expect(component.planForm.valid).toBeTrue();
    await submit();
    expect(data.savePlan).toHaveBeenCalledWith('gym', jasmine.objectContaining({ price: 49.95, currency: 'USD', active: false }), plan.id);
  });

  it('rejects cleared, zero and negative payment amounts instead of coercing them into a receipt', async () => {
    component.openPayment(membership); await settle();
    for (const value of ['', '0', '-1']) {
      enter('payment-amount', value);
      if (!value) expect(component.paymentForm.controls.amount.value).toBeNull();
      await submit();
      expect(data.registerPayment).not.toHaveBeenCalled();
      expect(component.paymentTarget()).toBe(membership);
    }
  });

  it('retains a failed payment draft and retries its exact numeric amount and notes explicitly', async () => {
    component.openPayment(membership); await settle();
    enter('payment-amount', '5.25'); enter('payment-notes', 'Referencia que se conserva');
    data.registerPayment.and.rejectWith(new Error('connection interrupted'));
    await submit();
    const first = data.registerPayment.calls.argsFor(0);
    expect(component.paymentTarget()).toBe(membership);
    expect(input('payment-amount').value).toBe('5.25');
    expect(input('payment-notes').value).toBe('Referencia que se conserva');
    expect(component.saving()).toBeFalse();
    expect(component.error()).toContain('No pudimos registrar el pago');
    data.registerPayment.and.resolveTo('receipt'); await submit();
    expect(data.registerPayment.calls.count()).toBe(2);
    expect(data.registerPayment.calls.argsFor(1)).toEqual(first);
  });

  it('closes the payment form after a committed receipt whose membership update failed, preventing a duplicate retry', async () => {
    component.openPayment(membership); await settle();
    data.registerPayment.and.rejectWith(Object.assign(new Error('El pago ya quedó registrado. Ajusta la membresía sin registrar otro pago.'), {
      code: 'PAYMENT_RECORDED_MEMBERSHIP_PENDING', paymentId: 'receipt'
    }));
    await submit();
    expect(data.registerPayment.calls.count()).toBe(1);
    expect(component.paymentTarget()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(component.error()).toContain('El pago ya quedó registrado');
  });
});
