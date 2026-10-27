import { TestBed } from '@angular/core/testing';
import { createClient, User } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/auth/supabase.service';
import { AdminActivityAccessError, AdminActivityService, localActivityDate, summarizeAdminActivity } from './admin-activity.service';

describe('Admin activity calendar summary', () => {
  const now = new Date(2026, 9, 10, 14, 30);

  it('counts distinct database user IDs and places midnight boundaries in the local calendar day', () => {
    const midnight = new Date(2026, 9, 10, 0, 0);
    const previousDay = new Date(midnight.getTime() - 1);
    const summary = summarizeAdminActivity([
      { timestamp: midnight.toISOString(), user_id: 'first' },
      { timestamp: now.toISOString(), user_id: 'first' },
      { timestamp: now.toISOString(), user_id: 'second' },
      { timestamp: previousDay.toISOString(), user_id: 'third' }
    ], [{ created_at: midnight.toISOString() }, { created_at: previousDay.toISOString() }], now);
    expect(summary.today).toEqual({ logins: 3, uniqueUsers: 2, routines: 1 });
    expect(summary.total).toEqual({ logins: 4, routines: 2 });
    expect(summary.daily.at(-1)).toEqual({ date: '2026-10-10', logins: 3, routines: 1 });
    expect(summary.daily.at(-2)).toEqual({ date: '2026-10-09', logins: 1, routines: 1 });
  });

  it('includes the exact rolling 30-day boundary and excludes earlier or future events', () => {
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
    const timestamps = [new Date(cutoff.getTime() - 1), cutoff, now, new Date(now.getTime() + 1)];
    const summary = summarizeAdminActivity(timestamps.map((date) => ({ timestamp: date.toISOString(), user_id: 'user' })),
      timestamps.map((date) => ({ created_at: date.toISOString() })), now);
    expect(summary.total).toEqual({ logins: 2, routines: 2 });
    expect(summary.from).toBe(cutoff.toISOString());
    expect(summary.to).toBe(now.toISOString());
  });

  it('returns seven zero-filled calendar days in ascending order for a successful empty result', () => {
    const summary = summarizeAdminActivity([], [], now);
    expect(summary.daily.map((day) => day.date)).toEqual([
      '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'
    ]);
    expect(summary.today).toEqual({ logins: 0, uniqueUsers: 0, routines: 0 });
    expect(summary.daily.every((day) => day.logins === 0 && day.routines === 0)).toBeTrue();
  });

  it('uses the same local date for differently offset representations of one instant', () => {
    expect(localActivityDate(new Date('2026-10-10T00:30:00+14:00')))
      .toBe(localActivityDate(new Date('2026-10-09T10:30:00Z')));
    const summary = summarizeAdminActivity([
      { timestamp: '2026-10-10T00:30:00+14:00', user_id: 'first' },
      { timestamp: '2026-10-09T10:30:00Z', user_id: 'second' }
    ], [], new Date('2026-10-11T20:00:00Z'));
    expect(summary.daily.find((day) => day.date === localActivityDate(new Date('2026-10-09T10:30:00Z')))?.logins).toBe(2);
  });
});

describe('Admin activity database access', () => {
  let service: AdminActivityService;
  let role: string | null;
  let failure: 'activity_logins' | 'routines' | null;
  let requests: URL[];
  let instance = 0;
  const now = new Date(2026, 9, 10, 14, 30);
  const logins = Array.from({ length: 2005 }, (_value, index) => ({ timestamp: now.toISOString(), user_id: `user-${index % 5}` }));
  const routines = Array.from({ length: 1001 }, () => ({ created_at: now.toISOString() }));

  beforeEach(() => {
    role = 'admin'; failure = null; requests = [];
    const client = createClient('http://127.0.0.1:54321', 'test-anon-key', {
      auth: { storageKey: `admin-activity-${++instance}`, persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init) => {
          const request = new Request(input, init);
          const url = new URL(request.url); requests.push(url);
          if (url.pathname.endsWith('/coaches')) return Response.json(role ? { role } : null);
          const table = url.pathname.endsWith('/activity_logins') ? 'activity_logins' : 'routines';
          const offset = Number(url.searchParams.get('offset') || 0);
          if (table === failure && offset >= 1000) return Response.json({ code: 'XX000', message: 'Second page failed' }, { status: 500 });
          return Response.json((table === 'activity_logins' ? logins : routines).slice(offset, offset + 1000));
        }
      }
    });
    // Editable role metadata deliberately contradicts a non-admin database role in the denial test.
    spyOn(client.auth, 'getUser').and.resolveTo({ data: { user: { id: 'identity', user_metadata: { role: 'admin' } } as unknown as User }, error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client } }] });
    service = TestBed.inject(AdminActivityService);
  });

  it('reads every page beyond 1000 rows with stable ordering and a bounded snapshot', async () => {
    const summary = await service.load(now);
    expect(summary.total).toEqual({ logins: 2005, routines: 1001 });
    expect(summary.today.uniqueUsers).toBe(5);
    const activityRequests = requests.filter((url) => !url.pathname.endsWith('/coaches'));
    expect(requests[0].pathname).toBe('/rest/v1/coaches');
    expect(requests[0].searchParams.get('id')).toBe('eq.identity');
    expect(activityRequests.filter((url) => url.pathname.endsWith('/activity_logins')).map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000', '2000']);
    expect(activityRequests.filter((url) => url.pathname.endsWith('/routines')).map((url) => url.searchParams.get('offset'))).toEqual(['0', '1000']);
    for (const url of activityRequests) {
      const isLogin = url.pathname.endsWith('/activity_logins');
      const timestamp = isLogin ? 'timestamp' : 'created_at';
      expect(url.searchParams.get('select')).toBe(isLogin ? 'timestamp,user_id' : 'created_at');
      expect(url.searchParams.get('order')).toBe(`${timestamp}.asc,id.asc`);
      expect(url.searchParams.getAll(timestamp)).toEqual([`gte.${summary.from}`, `lte.${summary.to}`]);
    }
  });

  for (const deniedRole of ['coach', null]) {
    it(`rejects database role ${deniedRole || 'missing'} before any global activity read regardless of metadata`, async () => {
      role = deniedRole;
      await expectAsync(service.load(now)).toBeRejectedWith(jasmine.any(AdminActivityAccessError));
      expect(requests.length).toBe(1);
      expect(requests[0].pathname).toBe('/rest/v1/coaches');
    });
  }

  for (const table of ['activity_logins', 'routines'] as const) {
    it(`rejects the entire summary if a later ${table} page fails instead of returning misleading partial totals`, async () => {
      failure = table;
      await expectAsync(service.load(now)).toBeRejectedWith(jasmine.objectContaining({ code: 'XX000' }));
    });
  }
});
