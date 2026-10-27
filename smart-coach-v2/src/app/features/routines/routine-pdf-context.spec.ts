import { TestBed } from '@angular/core/testing';
import { CoachDataService } from '../../core/data/coach-data.service';
import { SupabaseService } from '../../core/auth/supabase.service';

describe('Routine PDF branding and client scope', () => {
  let service: CoachDataService;
  let from: jasmine.Spy;
  const client = { id: 'client', name: 'Atleta', email: 'client@example.invalid', age: 30, weight: 70, height: 170, goal: '' };
  function query(data: unknown) {
    const builder: any = {};
    for (const method of ['select', 'eq']) builder[method] = jasmine.createSpy(method).and.returnValue(builder);
    builder.single = jasmine.createSpy('single').and.resolveTo({ data, error: null });
    return builder;
  }
  beforeEach(() => {
    from = jasmine.createSpy('from');
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client: { from } } }] });
    service = TestBed.inject(CoachDataService);
  });
  it('uses gym branding over coach branding and retains the coach contact from V1', async () => {
    const readClient = spyOn(service, 'getClient').and.resolveTo(client);
    const coach = query({ name: 'Coach', email: 'coach@example.invalid', logo_url: '/coach.svg', brand_color: '#000000' });
    const gym = query({ name: 'Gym', logo_url: '/gym.svg', brand_color: '#126c50' });
    from.and.callFake(table => table === 'coaches' ? coach : gym);
    const context = await service.getRoutinePdfContext('client', 'coach', 'gym');
    expect(readClient).toHaveBeenCalledOnceWith('client', 'coach', 'gym');
    expect(coach.eq).toHaveBeenCalledWith('id', 'coach');
    expect(gym.eq).toHaveBeenCalledWith('id', 'gym');
    expect(context.coach).toEqual({ name: 'Gym', email: 'coach@example.invalid', logoUrl: '/gym.svg', brandColor: '#126c50' });
    expect(context.client).toEqual(client);
  });
  it('keeps an unset stored brand color for the original black PDF fallback', async () => {
    spyOn(service, 'getClient').and.resolveTo(client);
    from.and.returnValue(query({ name: 'Coach', email: '', logo_url: null, brand_color: null }));
    const context = await service.getRoutinePdfContext('client', 'coach');
    expect(context.coach.brandColor).toBeNull();
    expect(from).toHaveBeenCalledOnceWith('coaches');
  });

  it('uses black in an unconfigured profile so saving other profile fields cannot introduce lime branding', async () => {
    for (const brand_color of [null, '']) {
      from.and.returnValue(query({ id: 'coach', name: 'Coach', brand_color }));
      expect((await service.getProfile('coach')).brandColor).toBe('#000000');
    }
  });

  it('retains an explicitly selected branding color', async () => {
    from.and.returnValue(query({ id: 'coach', name: 'Coach', brand_color: '#7030a0' }));
    expect((await service.getProfile('coach')).brandColor).toBe('#7030a0');
  });
});
