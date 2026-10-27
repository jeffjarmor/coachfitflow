import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminAnnouncementsComponent } from './admin-announcements.component';
import { AdminAnnouncementsService, CoachAnnouncement } from './admin-announcements.service';

describe('Announcement editor recovery', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));
  const item: CoachAnnouncement = { id: 'existing', title: 'Aviso existente', message: 'Mensaje existente', audience: 'all',
    active: false, sortOrder: 0, startsAt: null, endsAt: null, createdBy: 'admin', createdAt: '2026-10-10T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' };

  it('preserves the selected record and entered values after a failed save, then permits retry', async () => {
    const update = jasmine.createSpy('updateAnnouncement').and.rejectWith(new Error('network unavailable'));
    TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent], providers: [{ provide: AdminAnnouncementsService,
      useValue: { getAllAnnouncements: () => Promise.resolve([]), updateAnnouncement: update } }] });
    const fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    const component = fixture.componentInstance;
    await component.load();
    component.edit(item);
    component.form.controls.message.setValue('Cambios sin guardar');
    component.form.markAsDirty();
    await component.save();
    expect(component.selectedId()).toBe(item.id);
    expect(component.form.controls.message.value).toBe('Cambios sin guardar');
    expect(component.form.dirty).toBeTrue();
    expect(component.saveError()).toContain('Tus cambios siguen en el formulario');
    update.and.resolveTo({ ...item, message: 'Cambios sin guardar' });
    await component.save();
    expect(component.announcements()[0].message).toBe('Cambios sin guardar');
    expect(component.form.dirty).toBeFalse();
    expect(component.saveError()).toBe('');
    fixture.destroy();
  });

  it('keeps a dirty form in place when discarding changes is declined', async () => {
    TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent], providers: [{ provide: AdminAnnouncementsService,
      useValue: { getAllAnnouncements: () => Promise.resolve([]) } }] });
    const fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    const component = fixture.componentInstance;
    await component.load();
    component.form.controls.title.setValue('Nuevo aviso');
    component.form.markAsDirty();
    spyOn(window, 'confirm').and.returnValue(false);
    expect(component.canDeactivate()).toBeFalse();
    component.startCreate();
    expect(component.form.controls.title.value).toBe('Nuevo aviso');
    fixture.destroy();
  });

  it('explains an empty display order without sending a save', async () => {
    const create = jasmine.createSpy('createAnnouncement');
    TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent], providers: [{ provide: AdminAnnouncementsService,
      useValue: { getAllAnnouncements: () => Promise.resolve([]), createAnnouncement: create } }] });
    const fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    component.form.patchValue({ title: 'Aviso', message: 'Mensaje' });
    component.form.controls.sortOrder.setValue(null as any);
    await component.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#announcement-order-error').textContent).toContain('Ingresa un número entero válido');
    expect(fixture.nativeElement.querySelector('#announcement-order').getAttribute('aria-invalid')).toBe('true');
    expect(create).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('waits for a pending directory read before saving, so an older result cannot hide the new announcement', async () => {
    let finishRead!: (rows: CoachAnnouncement[]) => void;
    const getAll = jasmine.createSpy('getAllAnnouncements').and.callFake(() => new Promise<CoachAnnouncement[]>(resolve => { finishRead = resolve; }));
    const create = jasmine.createSpy('createAnnouncement').and.resolveTo({ ...item, id: 'created' });
    TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent], providers: [{ provide: AdminAnnouncementsService,
      useValue: { getAllAnnouncements: getAll, createAnnouncement: create } }] });
    const fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    const component = fixture.componentInstance;
    const read = component.load();
    await component.load();
    expect(getAll).toHaveBeenCalledTimes(1);
    component.form.patchValue({ title: item.title, message: item.message });
    await component.save();
    expect(create).not.toHaveBeenCalled();
    finishRead([]);
    await read;
    await component.save();
    expect(create).toHaveBeenCalledTimes(1);
    expect(component.announcements().map(row => row.id)).toEqual(['created']);
    fixture.destroy();
  });

  it('does not start a directory refresh during a pending save', async () => {
    let finishSave!: (row: CoachAnnouncement) => void;
    const getAll = jasmine.createSpy('getAllAnnouncements').and.resolveTo([]);
    const create = jasmine.createSpy('createAnnouncement').and.callFake(() => new Promise<CoachAnnouncement>(resolve => { finishSave = resolve; }));
    TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent], providers: [{ provide: AdminAnnouncementsService,
      useValue: { getAllAnnouncements: getAll, createAnnouncement: create } }] });
    const fixture = TestBed.createComponent(AdminAnnouncementsComponent);
    const component = fixture.componentInstance;
    await component.load();
    component.form.patchValue({ title: item.title, message: item.message });
    const save = component.save();
    await component.load();
    expect(getAll).toHaveBeenCalledTimes(1);
    finishSave(item);
    await save;
    expect(component.announcements().map(row => row.id)).toEqual([item.id]);
    fixture.destroy();
  });

  it('moves announcements between state filters at their inclusive schedule boundaries without a reload', async () => {
    jasmine.clock().install();
    const now = new Date('2026-10-15T12:00:00Z');
    jasmine.clock().mockDate(now);
    try {
      const scheduled = { ...item, active: true, startsAt: new Date(now.getTime() + 1000).toISOString(), endsAt: new Date(now.getTime() + 2000).toISOString() };
      TestBed.configureTestingModule({ imports: [AdminAnnouncementsComponent], providers: [{ provide: AdminAnnouncementsService,
        useValue: { getAllAnnouncements: () => Promise.resolve([scheduled]) } }] });
      const fixture = TestBed.createComponent(AdminAnnouncementsComponent);
      const component = fixture.componentInstance;
      await component.load();
      component.filter.set('published');
      expect(component.filtered()).toEqual([]);
      jasmine.clock().tick(1000);
      expect(component.filtered().map(row => row.id)).toEqual([item.id]);
      expect(component.stateLabel(scheduled)).toBe('Publicado');
      jasmine.clock().tick(1000);
      expect(component.filtered().map(row => row.id)).toEqual([item.id]);
      jasmine.clock().tick(1);
      expect(component.filtered()).toEqual([]);
      expect(component.stateLabel(scheduled)).toBe('Vencido');
      fixture.destroy();
    } finally { jasmine.clock().uninstall(); }
  });
});
