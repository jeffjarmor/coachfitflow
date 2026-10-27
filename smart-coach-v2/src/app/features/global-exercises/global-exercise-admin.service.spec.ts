import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/auth/supabase.service';
import { GlobalExerciseAdminService } from './global-exercise-admin.service';

describe('Global exercise mutation results', () => {
  const emptyResult = { code: 'PGRST116', message: 'The result contains 0 rows' };
  let service: GlobalExerciseAdminService;
  let query: any;

  beforeEach(() => {
    // An unrepresented update/delete may succeed with no affected rows. Asking
    // PostgREST for exactly one representation must surface that missing row.
    query = { then: (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject) };
    for (const method of ['update', 'delete', 'eq', 'select']) query[method] = jasmine.createSpy(method).and.returnValue(query);
    query.single = jasmine.createSpy('single').and.resolveTo({ data: null, error: emptyResult });
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: { client: { from: () => query } } }] });
    service = TestBed.inject(GlobalExerciseAdminService);
  });

  it('rejects an update whose row was deleted or is no longer authorized instead of announcing success', async () => {
    await expectAsync(service.update('missing-global', { name: 'Sentadilla', muscleGroup: 'Piernas' })).toBeRejectedWith(emptyResult);
    expect(query.eq).toHaveBeenCalledWith('id', 'missing-global');
    expect(query.eq).toHaveBeenCalledWith('source', 'global');
  });

  it('rejects a delete that affects no global exercise instead of announcing success', async () => {
    await expectAsync(service.delete('missing-global')).toBeRejectedWith(emptyResult);
    expect(query.eq).toHaveBeenCalledWith('id', 'missing-global');
    expect(query.eq).toHaveBeenCalledWith('source', 'global');
  });
});
