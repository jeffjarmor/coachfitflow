import { TestBed } from '@angular/core/testing';
import { createClient } from '@supabase/supabase-js';
import { SupabaseService } from '../auth/supabase.service';
import { AdminDataService } from '../../features/admin/admin-data.service';
import { CoachDataService } from './coach-data.service';

describe('Supabase write confirmation', () => {
  const clientInput = {
    name: 'Cliente', email: 'client@example.invalid', phone: '', birthDate: '',
    weight: null, height: null, goal: 'Fuerza', notes: '', address: ''
  };
  const exerciseInput = { name: 'Sentadilla', muscleGroup: 'Pierna' };
  let coach: CoachDataService;
  let admin: AdminDataService;
  let result: 'empty' | 'saved' | 'rls';
  let writes: Request[];
  let authTestInstance = 0;

  beforeEach(() => {
    result = 'saved';
    writes = [];
    const client = createClient('http://127.0.0.1:54321', 'test-anon-key', {
      auth: { storageKey: `write-confirmation-${++authTestInstance}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url);
          if (request.method === 'GET') {
            return Response.json(url.pathname.endsWith('/client_gym_memberships')
              ? { id: 'membership', client_id: 'client', gym_id: 'gym', assigned_coach_id: 'other-coach' }
              : url.pathname.endsWith('/membership_plans') ? { id: 'plan' }
              : []);
          }
          if (url.pathname.includes('/rpc/')) return Response.json(true);
          writes.push(request);
          if (result === 'rls') return Response.json({ code: '42501', message: 'new row violates row-level security policy' }, { status: 403 });
          // PostgREST returns affected rows only when the caller requests them.
          return request.headers.get('Prefer')?.includes('return=representation')
            ? Response.json(result === 'saved' ? [{ id: 'record' }] : [])
            : new Response(null, { status: 204 });
        }
      }
    });
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client } }] });
    coach = TestBed.inject(CoachDataService);
    admin = TestBed.inject(AdminDataService);
  });

  for (const { name, save } of [
    { name: 'coach client update', save: () => coach.updateClient('client', 'coach', clientInput) },
    { name: 'coach exercise update', save: () => coach.updateCoachExercise('exercise', 'coach', exerciseInput) },
    { name: 'coach exercise deletion', save: () => coach.deleteCoachExercise('exercise', 'coach') },
    { name: 'admin plan update', save: () => admin.updateCoachPlan('coach', 'paid', '2099-01-01') },
    { name: 'admin client update', save: () => admin.updateClient('client', clientInput) }
  ]) {
    it(`rejects a ${name} when PostgREST returns zero affected rows`, async () => {
      result = 'empty';
      await expectAsync(save()).toBeRejectedWithError(/Comprueba tus permisos/);
    });

    it(`confirms a ${name} when PostgREST returns the saved row`, async () => {
      await expectAsync(save()).toBeResolved();
      expect(writes.length).toBe(1);
    });
  }

  it('preserves the server RLS error instead of treating it as a successful save', async () => {
    result = 'rls';
    await expectAsync(coach.updateCoachExercise('exercise', 'coach', exerciseInput))
      .toBeRejectedWith(jasmine.objectContaining({ code: '42501' }));
  });

  it('keeps coach ownership and source restrictions on exercise writes', async () => {
    await coach.deleteCoachExercise('exercise', 'coach');
    const query = new URL(writes[0].url).searchParams;
    expect(query.get('id')).toBe('eq.exercise');
    expect(query.get('coach_id')).toBe('eq.coach');
    expect(query.get('source')).toBe('eq.coach');
  });

  it('keeps shared gym profile editing and applies the plan only after the client save succeeds', async () => {
    await coach.updateClient('client', 'coach', { ...clientInput, membershipPlanId: 'plan' }, 'gym');
    expect(writes.length).toBe(2);
    expect(new URL(writes[0].url).searchParams.has('primary_coach_id')).toBeFalse();
    expect(new URL(writes[1].url).pathname).toBe('/rest/v1/client_gym_memberships');
    const planQuery = new URL(writes[1].url).searchParams;
    expect(planQuery.get('gym_id')).toBe('eq.gym');
    expect(planQuery.get('client_id')).toBe('eq.client');
    expect(await writes[1].json()).toEqual(jasmine.objectContaining({ membership_plan_id: 'plan' }));
  });

  it('does not change the gym membership plan after an unconfirmed profile update', async () => {
    result = 'empty';
    await expectAsync(coach.updateClient('client', 'coach', { ...clientInput, membershipPlanId: 'plan' }, 'gym'))
      .toBeRejectedWithError(/Comprueba tus permisos/);
    expect(writes.length).toBe(1);
    expect(new URL(writes[0].url).pathname).toBe('/rest/v1/clients');
  });
});
