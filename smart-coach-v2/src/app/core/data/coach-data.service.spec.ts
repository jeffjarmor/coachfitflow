import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../auth/supabase.service';
import { CoachDataService } from './coach-data.service';

describe('Coach dashboard announcement parity', () => {
  const now = new Date('2026-10-10T18:00:00Z');
  const announcements = [
    { id: 'all', audience: 'all' },
    { id: 'standard', audience: 'standard' },
    { id: 'paid', audience: 'paid' },
    { id: 'future', audience: 'all', starts_at: '2026-10-10T18:00:01Z' },
    { id: 'expired', audience: 'all', ends_at: '2026-10-10T17:59:59Z' },
    { id: 'inactive', audience: 'all', active: false },
    { id: 'starts-now', audience: 'all', starts_at: now.toISOString() },
    { id: 'ends-now', audience: 'all', ends_at: now.toISOString() }
  ].map((row) => ({ active: true, title: row.id, message: row.id, ...row }));

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(now);
  });

  afterEach(() => jasmine.clock().uninstall());

  function dashboard(profile: Record<string, unknown>, announcementError: unknown = null) {
    const client = {
      from(table: string) {
        let columns: string[] = [];
        const query: any = {
          select(value: string) {
            columns = value.split(',');
            return query;
          },
          then(resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) {
            const data = table === 'coaches'
              ? { id: 'coach', name: 'Coach', account_type: 'independent', coach_plan: 'standard', ...profile }
              : table === 'coach_announcements'
                ? announcements.map((row) => Object.fromEntries(columns.map((column) => [column, (row as any)[column]])))
                : [];
            return Promise.resolve({ data, error: table === 'coach_announcements' ? announcementError : null }).then(resolve, reject);
          }
        };
        for (const method of ['eq', 'is', 'in', 'not', 'or', 'order', 'limit', 'single']) query[method] = () => query;
        return query;
      }
    };
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client } }] });
    return TestBed.inject(CoachDataService).getDashboard('coach');
  }

  for (const { name, profile, audience } of [
    { name: 'standard independent coach', profile: {}, audience: 'standard' },
    { name: 'active Pro coach', profile: { coach_plan: 'paid', next_plan_payment_date: '2099-01-01' }, audience: 'paid' },
    { name: 'expired Pro coach', profile: { coach_plan: 'paid', next_plan_payment_date: '2020-01-01' }, audience: 'standard' },
    { name: 'gym coach', profile: { account_type: 'gym' }, audience: 'paid' },
    { name: 'administrator', profile: { role: 'admin' }, audience: 'standard' }
  ]) {
    it(`keeps the original audience and schedule rules for a ${name}`, async () => {
      const result = await dashboard(profile);
      expect(result.announcements.map((row) => row.id)).toEqual(['all', audience, 'starts-now', 'ends-now']);
      expect(Object.keys(result.announcements[0])).toEqual(['id', 'title', 'message']);
    });
  }

  it('keeps the dashboard usable if announcements cannot be read', async () => {
    const result = await dashboard({}, { message: 'Network unavailable' });
    expect(result.announcements).toEqual([]);
    expect(result.coach.id).toBe('coach');
  });
});
