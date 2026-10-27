import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/auth/supabase.service';
import { ClientPortalContext, ClientPortalDataService } from './client-portal-data.service';

describe('Original backend Portal contract', () => {
  let service: ClientPortalDataService;
  let from: jasmine.Spy;
  let rpc: jasmine.Spy;
  let getSession: jasmine.Spy;
  const context: ClientPortalContext = { key: 'independent:coach:client', scope: 'independent',
    clientId: 'client', membershipId: null, label: 'Coach', available: true };

  function query(result: unknown) {
    const builder: any = { then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ['select', 'eq', 'in', 'update', 'is', 'order']) builder[method] = jasmine.createSpy(method).and.returnValue(builder);
    builder.single = jasmine.createSpy('single').and.resolveTo(result);
    builder.maybeSingle = jasmine.createSpy('maybeSingle').and.resolveTo(result);
    return builder;
  }

  beforeEach(() => {
    from = jasmine.createSpy('from');
    rpc = jasmine.createSpy('rpc');
    getSession = jasmine.createSpy('getSession').and.resolveTo({ data: { session: { user: { id: 'actor' } } }, error: null });
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client: { from, rpc, auth: { getSession } } } }] });
    service = TestBed.inject(ClientPortalDataService);
  });

  it('acknowledges only existing links through original REST tables without a new RPC', async () => {
    const links = query({ data: [{ client_id: 'client' }], error: null });
    const gymLinks = query({ data: [], error: null });
    const clients = query({ error: null });
    from.and.callFake((table: string) => ({ independent_client_portal_access: links, client_portal_access: gymLinks, clients } as Record<string, any>)[table]);
    await service.activateLinkedAccesses();
    expect(links.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(gymLinks.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(clients.eq).toHaveBeenCalledWith('user_id', 'actor');
    expect(clients.eq).toHaveBeenCalledWith('portal_status', 'pending');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('updates only the original personal fields and surfaces zero-row rejection', async () => {
    spyOn(service, 'listContexts').and.resolveTo([context]);
    const error = { code: 'PGRST116', message: 'No row updated' };
    const clients = query({ data: null, error });
    from.and.returnValue(clients);
    await expectAsync(service.updateProfile(context, { name: ' Client ', phone: ' 123 ', birthDate: null,
      address: 'Must remain unchanged', notes: ' Note ' })).toBeRejectedWith(error);
    const payload = clients.update.calls.mostRecent().args[0];
    expect(payload.name).toBe('Client');
    expect(payload.phone).toBe('123');
    expect(payload.notes).toBe('Note');
    expect(Object.keys(payload).sort()).toEqual(['birth_date', 'name', 'notes', 'phone', 'updated_at']);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a profile write outside the signed-in user database contexts', async () => {
    spyOn(service, 'listContexts').and.resolveTo([]);
    await expectAsync(service.updateProfile(context, { name: 'Client', phone: '', birthDate: null, address: '', notes: '' })).toBeRejected();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('loads PDF metrics and branding from the canonical active context', async () => {
    spyOn(service, 'listContexts').and.resolveTo([context]);
    const client = query({ data: { name: 'Atleta', age: 30, weight: 70, height: 170 }, error: null });
    const coach = query({ data: { name: 'Coach', email: 'coach@example.invalid', logo_url: '/logo.svg', brand_color: null }, error: null });
    from.and.callFake((table: string) => table === 'clients' ? client : coach);
    const pdf = await service.getRoutinePdfContext(context);
    expect(client.eq).toHaveBeenCalledWith('id', 'client');
    expect(coach.eq).toHaveBeenCalledWith('id', 'coach');
    expect(pdf.client.weight).toBe(70);
    expect(pdf.coach.brandColor).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects a forged branding key before reading PDF data', async () => {
    spyOn(service, 'listContexts').and.resolveTo([context]);
    await expectAsync(service.getRoutinePdfContext({ ...context, key: 'independent:other-coach:client' })).toBeRejected();
    expect(from).not.toHaveBeenCalled();
  });

  it('includes assigned cardio exercises in Portal routine downloads', async () => {
    const routine = query({ data: { id: 'routine', name: 'Fuerza', objective: 'Fuerza', training_days_count: 1,
      duration_weeks: 4, start_date: '2026-10-17', end_date: '2026-11-14', notes: '',
      warmup_enabled: true, warmup_custom_text: 'Cinco minutos.' }, error: null });
    const days = query({ data: [], error: null });
    const warmup = query({ data: [{ exercise_id: 'bike', exercises: { name: 'Bicicleta' } }], error: null });
    from.and.callFake((table: string) => ({ routines: routine, routine_days: days, routine_warmup_exercises: warmup } as Record<string, any>)[table]);
    const detail = await service.getRoutineDetail(context, 'routine');
    expect(routine.eq).toHaveBeenCalledWith('client_id', 'client');
    expect(routine.is).toHaveBeenCalledWith('client_gym_membership_id', null);
    expect(detail?.warmupExercises).toEqual([{ exerciseId: 'bike', exerciseName: 'Bicicleta' }]);
    expect(warmup.eq).toHaveBeenCalledWith('routine_id', 'routine');
  });

  it('reads global catalog media for local IDs and keeps the assignment video override', async () => {
    const routine = query({ data: { id: 'routine', name: 'Fuerza', objective: 'Fuerza', training_days_count: 1,
      duration_weeks: 4, warmup_enabled: false }, error: null });
    const days = query({ data: [{ id: 'day', day_number: 1, day_name: 'Fuerza', muscle_groups: [] }], error: null });
    const assignments = query({ data: [{ id: 'assignment', routine_day_id: 'day', exercise_id: 'local-global',
      sets: 3, reps: '10', rest: '60 s', order_index: 0, video_url: 'https://example.test/override' }], error: null });
    const imageUrl = '/assets/exercises/v1/bcf04802-483d-4abb-8b4d-ef5963db684c.webp';
    const catalog = query({ data: [{ id: 'local-global', name: 'Curl con Mancuernas', muscle_group: 'Bíceps', source: 'global',
      image_url: imageUrl, video_url: 'https://example.test/catalog' }], error: null });
    const weeks = query({ data: [], error: null });
    from.and.callFake((table: string) => ({ routines: routine, routine_days: days, routine_day_exercises: assignments,
      exercises: catalog, routine_week_configs: weeks } as Record<string, any>)[table]);
    const detail = await service.getRoutineDetail(context, 'routine');
    expect(catalog.select).toHaveBeenCalledWith('id,name,muscle_group,source,image_url,video_url');
    expect(detail?.days[0].exercises[0]).toEqual(jasmine.objectContaining({ id: 'assignment', exerciseId: 'local-global',
      source: 'global', imageUrl, videoUrl: 'https://example.test/override' }));
    expect(rpc).not.toHaveBeenCalled();
  });

});
