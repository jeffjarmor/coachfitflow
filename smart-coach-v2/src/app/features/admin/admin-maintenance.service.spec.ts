import { TestBed } from '@angular/core/testing';
import { SupabaseService } from '../../core/auth/supabase.service';
import { AdminCoachRecord, AdminDataService } from './admin-data.service';
import { AdminMaintenanceComponent } from './admin-maintenance.component';
import { AdminMaintenanceError, AdminMaintenanceService, MaintenanceGym } from './admin-maintenance.service';

const gym: MaintenanceGym = { id: 'gym', name: 'Gimnasio Norte', ownerId: 'owner', ownerName: 'Dueño', ownerEmail: 'owner@example.invalid' };
const coach = (id: string, overrides: Partial<AdminCoachRecord> = {}): AdminCoachRecord => ({
  id, name: id, email: `${id}@example.invalid`, phone: null, logoUrl: null, brandColor: '',
  role: 'coach', accountType: 'independent', coachPlan: 'standard', nextPlanPaymentDate: null,
  createdAt: null, clientCount: 0, routineCount: 0, affiliations: [], ...overrides
});

describe('Original admin maintenance permissions and scope', () => {
  let service: AdminMaintenanceService;
  let admin: jasmine.SpyObj<AdminDataService>;
  let rpc: jasmine.Spy;

  beforeEach(() => {
    admin = jasmine.createSpyObj<AdminDataService>('AdminDataService', ['listGyms', 'listCoaches', 'getCoach', 'assignGymOwner', 'deleteGym']);
    admin.listGyms.and.resolveTo([{ id: gym.id, name: gym.name, ownerId: gym.ownerId }]);
    admin.listCoaches.and.resolveTo([coach('owner'), coach('independent')]);
    admin.getCoach.and.resolveTo(coach('independent'));
    admin.assignGymOwner.and.resolveTo();
    admin.deleteGym.and.resolveTo();
    rpc = jasmine.createSpy('rpc').and.resolveTo({ data: true, error: null });
    TestBed.configureTestingModule({ providers: [
      { provide: SupabaseService, useValue: { client: { rpc } } },
      { provide: AdminDataService, useValue: admin }
    ] });
    service = TestBed.inject(AdminMaintenanceService);
  });

  it('rejects non-admin directory access before requesting administrative data', async () => {
    rpc.and.resolveTo({ data: false, error: null });
    await expectAsync(service.load()).toBeRejectedWithError(AdminMaintenanceError, /Solo administración/);
    expect(admin.listGyms).not.toHaveBeenCalled();
    expect(admin.listCoaches).not.toHaveBeenCalled();
  });

  it('matches original owner/staff/admin exclusions, including owners missing a staff row', async () => {
    admin.listCoaches.and.resolveTo([
      coach('owner'), coach('independent'), coach('admin', { role: 'admin' }),
      coach('staff', { affiliations: [{ gymId: gym.id, gymName: gym.name, role: 'trainer' }] })
    ]);
    const directory = await service.load();
    expect(directory.availableOwners.map((item) => item.id)).toEqual(['independent']);
    expect(directory.gyms[0].ownerName).toBe('owner');
  });

  it('checks the database admin role again before either mutation', async () => {
    rpc.and.resolveTo({ data: false, error: null });
    await expectAsync(service.deleteGym(gym, gym.name)).toBeRejectedWithError(AdminMaintenanceError, /Solo administración/);
    await expectAsync(service.assignOwner(gym, 'independent')).toBeRejectedWithError(AdminMaintenanceError, /Solo administración/);
    expect(admin.deleteGym).not.toHaveBeenCalled();
    expect(admin.assignGymOwner).not.toHaveBeenCalled();
    expect(admin.listGyms).not.toHaveBeenCalled();
  });

  it('requires the exact gym name before delegating a deletion', async () => {
    await expectAsync(service.deleteGym(gym, 'Gimnasio Sur')).toBeRejectedWithError(AdminMaintenanceError, /nombre completo/);
    expect(admin.deleteGym).not.toHaveBeenCalled();
    expect(admin.listGyms).not.toHaveBeenCalled();
    admin.listGyms.and.returnValues(Promise.resolve([gym]), Promise.resolve([]));
    await service.deleteGym(gym, ` ${gym.name} `);
    expect(admin.deleteGym).toHaveBeenCalledOnceWith(gym.id);
  });

  it('does not report deletion success when the gym remains after a silent zero-row write', async () => {
    await expectAsync(service.deleteGym(gym, gym.name)).toBeRejectedWithError(AdminMaintenanceError, /no se completó/);
    expect(admin.deleteGym).toHaveBeenCalledOnceWith(gym.id);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('rejects stale ownership before deleting or assigning another owner', async () => {
    admin.listGyms.and.resolveTo([{ id: gym.id, name: gym.name, ownerId: 'changed-owner' }]);
    await expectAsync(service.deleteGym(gym, gym.name)).toBeRejectedWithError(AdminMaintenanceError, /Actualiza la lista/);
    await expectAsync(service.assignOwner(gym, 'independent')).toBeRejectedWithError(AdminMaintenanceError, /Actualiza la lista/);
    expect(admin.deleteGym).not.toHaveBeenCalled();
    expect(admin.assignGymOwner).not.toHaveBeenCalled();
  });

  it('rejects a newly affiliated account before assigning ownership', async () => {
    admin.getCoach.and.resolveTo(coach('independent', { affiliations: [{ gymId: 'other', gymName: 'Otro', role: 'trainer' }] }));
    await expectAsync(service.assignOwner(gym, 'independent')).toBeRejectedWithError(AdminMaintenanceError, /ya no es un entrenador independiente/);
    expect(admin.assignGymOwner).not.toHaveBeenCalled();
  });

  it('assigns only the reviewed gym and independent account using the existing admin service', async () => {
    await service.assignOwner(gym, 'independent');
    expect(rpc).toHaveBeenCalledWith('is_admin');
    expect(admin.assignGymOwner).toHaveBeenCalledOnceWith(gym.id, 'independent');
    expect(admin.deleteGym).not.toHaveBeenCalled();
  });
});

describe('Maintenance confirmation flow', () => {
  let component: AdminMaintenanceComponent;
  let service: jasmine.SpyObj<AdminMaintenanceService>;

  beforeEach(() => {
    service = jasmine.createSpyObj<AdminMaintenanceService>('AdminMaintenanceService', ['load', 'deleteGym', 'assignOwner']);
    service.load.and.resolveTo({ gyms: [gym], availableOwners: [coach('independent')] });
    service.deleteGym.and.resolveTo();
    service.assignOwner.and.resolveTo();
    TestBed.configureTestingModule({ providers: [{ provide: AdminMaintenanceService, useValue: service }] });
    component = TestBed.runInInjectionContext(() => new AdminMaintenanceComponent());
    component.loading.set(false);
  });

  it('does not delete on selecting an action, cancelling, or submitting a mismatched name', async () => {
    component.beginAction('delete', gym);
    component.confirmation.set('Otro gimnasio');
    await component.confirmAction();
    component.cancelAction();
    expect(service.deleteGym).not.toHaveBeenCalled();
    expect(component.action()).toBeNull();
  });

  it('submits the named gym once and reloads the directory after success', async () => {
    component.beginAction('delete', gym);
    component.confirmation.set(gym.name);
    await component.confirmAction();
    expect(service.deleteGym).toHaveBeenCalledOnceWith(gym, gym.name);
    expect(service.load).toHaveBeenCalledTimes(1);
    expect(component.action()).toBeNull();
    expect(component.notice()).toContain(gym.name);
  });

  it('clears a failed destructive confirmation and requests review before retrying', async () => {
    service.deleteGym.and.rejectWith(new Error('private backend detail'));
    component.beginAction('delete', gym);
    component.confirmation.set(gym.name);
    await component.confirmAction();
    expect(component.action()).toBeNull();
    expect(component.error()).toContain('Puede haber cambios parciales');
    expect(component.error()).not.toContain('private backend detail');
    await component.confirmAction();
    expect(service.deleteGym).toHaveBeenCalledTimes(1);
  });
});
