import { TestBed } from '@angular/core/testing';
import { createClient, User } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/auth/supabase.service';
import { GymPaymentsService } from './gym-payments.service';

describe('Original backend payment writes', () => {
  const payment = { amount: 100, currency: 'CRC', method: 'cash', paidDate: '2026-10-10', notes: '' };
  let service: GymPaymentsService;
  let canManageMembership: boolean;
  let updateResult: 'saved' | 'empty' | 'rls';
  let writes: Request[];
  let instance = 0;

  beforeEach(() => {
    canManageMembership = true;
    updateResult = 'saved';
    writes = [];
    const client = createClient('http://127.0.0.1:54321', 'test-anon-key', {
      auth: { storageKey: `payment-compatibility-${++instance}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          if (url.pathname.endsWith('/rpc/can_manage_clients')) return Response.json(canManageMembership);
          if (request.method === 'GET') return Response.json({ id: 'membership', next_payment_due_date: '2099-01-15T12:00:00Z' });
          writes.push(request);
          if (url.pathname.endsWith('/payments')) return Response.json({ id: 'receipt' });
          if (updateResult === 'rls') return Response.json({ code: '42501', message: 'RLS rejected membership update' }, { status: 403 });
          return Response.json(updateResult === 'saved' ? [{ id: 'membership' }] : []);
        }
      }
    });
    spyOn(client.auth, 'getUser').and.resolveTo({ data: { user: { id: 'owner' } as User }, error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client } }] });
    service = TestBed.inject(GymPaymentsService);
  });

  it('rejects a payment before creating a receipt when the actor cannot advance memberships', async () => {
    canManageMembership = false;
    await expectAsync(service.registerPayment('gym', 'membership', payment))
      .toBeRejectedWith(jasmine.objectContaining({ code: 'PAYMENT_MEMBERSHIP_PERMISSION_REQUIRED' }));
    expect(writes).toEqual([]);
  });

  for (const failure of ['empty', 'rls'] as const) {
    it(`identifies the existing receipt after a ${failure} membership write, so the user cannot mistake it for an unpaid retry`, async () => {
      updateResult = failure;
      await expectAsync(service.registerPayment('gym', 'membership', payment))
        .toBeRejectedWith(jasmine.objectContaining({ code: 'PAYMENT_RECORDED_MEMBERSHIP_PENDING', paymentId: 'receipt' }));
      expect(writes.map((request) => request.method)).toEqual(['POST', 'PATCH']);
      expect((await writes[0].json()).status).toBe('paid');
      const membershipQuery = new URL(writes[1].url).searchParams;
      expect(membershipQuery.get('id')).toBe('eq.membership');
      expect(membershipQuery.get('gym_id')).toBe('eq.gym');
    });
  }

  it('stores one paid receipt and advances a future original due date by one month', async () => {
    await expectAsync(service.registerPayment('gym', 'membership', payment)).toBeResolvedTo('receipt');
    expect(writes.length).toBe(2);
    expect(await writes[0].json()).toEqual(jasmine.objectContaining({
      created_by: 'owner', client_gym_membership_id: 'membership', status: 'paid', paid_date: '2026-10-10T12:00:00'
    }));
    expect(await writes[1].json()).toEqual(jasmine.objectContaining({
      next_payment_due_date: '2099-02-15T12:00:00.000Z', subscription_status: 'active'
    }));
  });
});
