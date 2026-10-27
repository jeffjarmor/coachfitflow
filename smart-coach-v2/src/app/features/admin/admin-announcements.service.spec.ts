import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  AdminAnnouncementsService, AnnouncementAccessError, AnnouncementValidationError, UpsertCoachAnnouncementInput,
  announcementDateInput, announcementState
} from './admin-announcements.service';

describe('Original backend announcements', () => {
  const input: UpsertCoachAnnouncementInput = { title: ' Aviso ', message: ' Mensaje ', audience: 'paid', active: true,
    sortOrder: 2, startsAt: '2026-10-10', endsAt: '2026-10-11' };
  let service: AdminAnnouncementsService;
  let from: jasmine.Spy;
  let getUser: jasmine.Spy;
  let profile: any;
  let announcements: any;

  function query(result: unknown) {
    const builder: any = { then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete']) builder[method] = jasmine.createSpy(method).and.returnValue(builder);
    builder.single = jasmine.createSpy('single').and.resolveTo(result);
    builder.maybeSingle = jasmine.createSpy('maybeSingle').and.resolveTo(result);
    return builder;
  }

  beforeEach(() => {
    getUser = jasmine.createSpy('getUser').and.resolveTo({ data: { user: { id: 'real-user', user_metadata: { role: 'admin' } } }, error: null });
    profile = query({ data: { role: 'admin' }, error: null });
    announcements = query({ data: { id: 'announcement', title: 'Aviso', message: 'Mensaje', audience: 'paid', active: true,
      sort_order: 2, starts_at: null, ends_at: null, created_by: 'real-user', created_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z' }, error: null });
    from = jasmine.createSpy('from').and.callFake((table: string) => table === 'coaches' ? profile : announcements);
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client: { from, auth: { getUser } } } }] });
    service = TestBed.inject(AdminAnnouncementsService);
  });

  it('keeps start and end boundaries inclusive and distinguishes drafts, scheduled and expired notices', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(announcementState({ active: true, startsAt: now.toISOString(), endsAt: now.toISOString() }, now)).toBe('published');
    expect(announcementState({ active: true, startsAt: '2026-10-11T00:00:00Z', endsAt: null }, now)).toBe('scheduled');
    expect(announcementState({ active: true, startsAt: null, endsAt: '2026-10-09T23:59:59Z' }, now)).toBe('expired');
    expect(announcementState({ active: false, startsAt: null, endsAt: '2026-10-09T23:59:59Z' }, now)).toBe('draft');
  });

  it('reads the local calendar date when editing a stored timestamp', () => {
    const local = new Date(2026, 9, 11, 23, 59, 59, 999);
    expect(announcementDateInput(local.toISOString())).toBe('2026-10-11');
    expect(announcementDateInput('invalid')).toBe('');
  });

  it('validates impossible dates, reversed ranges and fractional order before sending a write', async () => {
    for (const invalid of [{ endsAt: '2026-02-30' }, { startsAt: '2026-10-12' }, { sortOrder: 1.5 }]) {
      await expectAsync(service.createAnnouncement({ ...input, ...invalid })).toBeRejectedWithError(AnnouncementValidationError);
    }
    expect(getUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('requires the real database admin role even when user metadata says admin', async () => {
    profile.maybeSingle.and.resolveTo({ data: { role: 'coach' }, error: null });
    await expectAsync(service.createAnnouncement(input)).toBeRejectedWithError(AnnouncementAccessError);
    await expectAsync(service.updateAnnouncement('announcement', input)).toBeRejectedWithError(AnnouncementAccessError);
    await expectAsync(service.toggleAnnouncementActive('announcement', false)).toBeRejectedWithError(AnnouncementAccessError);
    await expectAsync(service.deleteAnnouncement('announcement')).toBeRejectedWithError(AnnouncementAccessError);
    expect(from.calls.allArgs().every(args => args[0] === 'coaches')).toBeTrue();
    expect(announcements.insert).not.toHaveBeenCalled();
    expect(announcements.update).not.toHaveBeenCalled();
    expect(announcements.delete).not.toHaveBeenCalled();
  });

  it('creates Pro announcements with the original paid audience and whole local days', async () => {
    const item = await service.createAnnouncement(input);
    const payload = announcements.insert.calls.mostRecent().args[0];
    expect(payload.title).toBe('Aviso');
    expect(payload.message).toBe('Mensaje');
    expect(payload.audience).toBe('paid');
    expect(payload.created_by).toBe('real-user');
    const start = new Date(payload.starts_at), end = new Date(payload.ends_at);
    expect(announcementDateInput(payload.starts_at)).toBe('2026-10-10');
    expect(announcementDateInput(payload.ends_at)).toBe('2026-10-11');
    expect([start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([23, 59, 59, 999]);
    expect(item.audience).toBe('paid');
  });

  for (const operation of ['update', 'toggle', 'delete']) {
    it(`surfaces a zero-row ${operation} instead of reporting success`, async () => {
      const error = { code: 'PGRST116', message: 'No row affected' };
      announcements.single.and.resolveTo({ data: null, error });
      const action: Promise<unknown> = operation === 'update' ? service.updateAnnouncement('missing', input)
        : operation === 'toggle' ? service.toggleAnnouncementActive('missing', false) : service.deleteAnnouncement('missing');
      await expectAsync(action).toBeRejectedWith(error);
      expect(announcements.single).toHaveBeenCalled();
    });
  }
});
