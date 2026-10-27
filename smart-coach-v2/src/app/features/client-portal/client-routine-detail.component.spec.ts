import { Component, Input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { ClientPortalPdfService } from './client-portal-pdf.service';
import { ClientRoutineDetailComponent } from './client-routine-detail.component';
import { ClientPortalContext, ClientPortalDataService, ClientPortalDay, ClientPortalExercise, ClientPortalRoutineDetail, ClientPortalTrainingDayState } from './client-portal-data.service';
import { getGlobalExerciseImage } from '../../shared/global-exercise-media';

@Component({ selector: 'app-client-portal-header', standalone: true, template: '' })
class PortalHeaderStub { @Input() context: ClientPortalContext | null = null; }

describe('Portal training values through real number inputs', () => {
  const context: ClientPortalContext = { key: 'independent:client', scope: 'independent', clientId: 'client', membershipId: null, label: 'Mi entrenador', available: true };
  const exercise: ClientPortalExercise = { id: 'assignment', exerciseId: 'exercise', order: 1, name: 'Sentadilla', muscleGroup: 'Piernas', sets: 1, reps: '10', rest: '90 s', notes: null,
    blockType: 'single', blockLabel: null, blockPosition: null, blockRest: null, videoUrl: null, weekConfigs: [] };
  const day: ClientPortalDay = { id: 'day', number: 1, name: 'Fuerza', muscleGroups: ['Piernas'], notes: null, exercises: [exercise] };
  const routine: ClientPortalRoutineDetail = { id: 'routine', name: 'Fuerza semanal', objective: 'Mejorar fuerza', trainingDaysCount: 1, durationWeeks: 4,
    startDate: null, endDate: null, notes: null, warmupEnabled: false, warmupCustomText: null, days: [day] };
  const previous: ClientPortalTrainingDayState = { sessionId: 'session', status: 'in_progress', sets: [{ id: 'set', sessionId: 'session', exerciseOrder: 1, setNumber: 1, actualReps: 10, load: 20, rir: 2, loadUnit: 'kg' }] };
  let fixture: ComponentFixture<ClientRoutineDetailComponent>;
  let component: ClientRoutineDetailComponent;
  let portal: jasmine.SpyObj<ClientPortalDataService>;

  beforeEach(async () => {
    portal = jasmine.createSpyObj<ClientPortalDataService>('ClientPortalDataService', ['listContexts', 'initialContext', 'getRoutineDetail', 'getTrainingDayState', 'saveTrainingSet']);
    portal.listContexts.and.resolveTo([context]);
    portal.initialContext.and.returnValue(context);
    portal.getRoutineDetail.and.resolveTo(routine);
    portal.getTrainingDayState.and.resolveTo(previous);
    portal.saveTrainingSet.and.callFake(async (_context, _routine, _day, _assignment, order, setNumber, input) => ({ sessionId: 'session', status: 'in_progress',
      set: { id: 'set', sessionId: 'session', exerciseOrder: order, setNumber, loadUnit: 'kg', ...input } }));
    TestBed.configureTestingModule({ imports: [ClientRoutineDetailComponent], providers: [provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ id: 'portal-user' }) } },
      { provide: ClientPortalDataService, useValue: portal },
      { provide: ClientPortalPdfService, useValue: {} },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: routine.id })), snapshot: { paramMap: convertToParamMap({ id: routine.id }) } } }
    ] });
    TestBed.overrideComponent(ClientRoutineDetailComponent, { remove: { imports: [ClientPortalHeaderComponent] }, add: { imports: [PortalHeaderStub] } });
    fixture = TestBed.createComponent(ClientRoutineDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.track-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  function inputFor(field: 'actualReps' | 'load' | 'rir'): HTMLInputElement {
    const name = field === 'actualReps' ? 'Repeticiones' : field === 'load' ? 'Carga en kg' : 'RIR';
    return fixture.nativeElement.querySelector(`input[aria-label="${name}, serie 1 de Sentadilla"]`);
  }

  async function change(field: 'actualReps' | 'load' | 'rir', rawValue: string): Promise<void> {
    const input = inputFor(field);
    input.value = rawValue;
    expect(typeof input.value).toBe('string');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('parses DOM strings into numeric DTOs, keeps zero and sends null when the value is cleared', async () => {
    await change('load', '25.5');
    expect(portal.saveTrainingSet.calls.mostRecent().args[6].load).toBe(25.5);
    await change('actualReps', '0');
    expect(portal.saveTrainingSet.calls.mostRecent().args[6].actualReps).toBe(0);
    await change('rir', '0');
    expect(portal.saveTrainingSet.calls.mostRecent().args[6].rir).toBe(0);
    await change('load', '');
    expect(portal.saveTrainingSet.calls.mostRecent().args[6]).toEqual({ actualReps: 0, rir: 0, load: null });
    expect(component.trackingError()).toBe('');
  });

  it('rejects negative, fractional integer fields and out-of-range values without calling the service', async () => {
    for (const invalid of [{ field: 'load', value: '-1' }, { field: 'load', value: '1000000' }, { field: 'actualReps', value: '1.5' }, { field: 'actualReps', value: '1000' }, { field: 'rir', value: '11' }]) {
      await change(invalid.field as 'actualReps' | 'load' | 'rir', invalid.value);
      expect(portal.saveTrainingSet).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(invalid.field === 'rir' ? 'RIR' : invalid.field === 'actualReps' ? 'repeticiones' : 'carga');
    }
  });

  it('keeps failed changes visible as unsaved and retries the same DTO without losing the client input', async () => {
    portal.saveTrainingSet.and.rejectWith(new Error('temporary network failure'));
    await change('load', '32.5');
    const attempted = portal.saveTrainingSet.calls.mostRecent().args[6];
    expect(inputFor('load').value).toBe('32.5');
    expect(component.getSetEntry(day, exercise, 1)?.load).toBe(32.5);
    expect(fixture.nativeElement.querySelector('.set-grid > small').textContent).toBe('Sin guardar');
    expect(portal.getTrainingDayState).toHaveBeenCalledTimes(1);
    const retry = [...fixture.nativeElement.querySelectorAll('[role="alert"] button')].find((button: any) => button.textContent.trim() === 'Reintentar') as HTMLButtonElement | undefined;
    expect(retry).withContext('A failed autosave must offer an explicit retry').toBeDefined();
    portal.saveTrainingSet.and.resolveTo({ sessionId: 'session', status: 'in_progress', set: { ...previous.sets[0], ...attempted } });
    retry?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(portal.saveTrainingSet).toHaveBeenCalledTimes(2);
    expect(portal.saveTrainingSet.calls.mostRecent().args[6]).toEqual(attempted);
    expect(component.trackingError()).toBe('');
    expect(inputFor('load').value).toBe('32.5');
    expect(fixture.nativeElement.querySelector('.set-grid > small').textContent).toBe('Guardado');
  });

  function showExercisesWithMovement(): ClientPortalExercise {
    const globalExercise = { ...exercise, exerciseId: 'bcf04802-483d-4abb-8b4d-ef5963db684c', videoUrl: 'https://example.test/technique' };
    // A custom assignment can resemble a catalog ID; only exerciseId identifies the media.
    const customExercise = { ...exercise, id: globalExercise.exerciseId, exerciseId: 'custom-exercise', order: 2, name: 'Ejercicio personalizado' };
    component.routine.set({ ...routine, days: [{ ...day, exercises: [globalExercise, customExercise] }] });
    fixture.detectChanges();
    return globalExercise;
  }

  function setMovementOpen(open: boolean): void {
    const details = fixture.nativeElement.querySelector('.exercise-movement') as HTMLDetailsElement;
    details.open = open;
    details.dispatchEvent(new Event('toggle'));
    fixture.detectChanges();
  }

  it('offers movement only for a known catalog exerciseId and defers the image until explicitly opened', () => {
    const globalExercise = showExercisesWithMovement();
    expect(fixture.nativeElement.querySelectorAll('.exercise-movement').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.exercise-movement summary').getAttribute('aria-label')).toBe('Ver movimiento de Sentadilla');
    expect(fixture.nativeElement.querySelector('.movement-preview img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.exercise-actions a').getAttribute('href')).toBe(globalExercise.videoUrl);

    setMovementOpen(true);
    const image = fixture.nativeElement.querySelector('.movement-preview img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(getGlobalExerciseImage(globalExercise.exerciseId));
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.alt).toBe('Demostración de Sentadilla');
    setMovementOpen(false);
    expect(fixture.nativeElement.querySelector('.movement-preview img')).toBeNull();
  });

  it('recovers a failed movement without closing the tracker or changing its values', async () => {
    showExercisesWithMovement();
    await change('load', '32.5');
    const savesBeforePreview = portal.saveTrainingSet.calls.count();
    setMovementOpen(true);
    fixture.nativeElement.querySelector('.movement-preview img').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.movement-preview img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.movement-error').textContent).toContain('No pudimos cargar el movimiento.');
    expect(inputFor('load').value).toBe('32.5');
    expect(component.isTrackerExpanded(day, exercise)).toBeTrue();
    expect(component.trackingError()).toBe('');
    expect(portal.saveTrainingSet.calls.count()).toBe(savesBeforePreview);

    (fixture.nativeElement.querySelector('.movement-error button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.movement-preview img')).not.toBeNull();
    expect(inputFor('load').value).toBe('32.5');
  });

  it('closes movement when changing days without changing expanded training trackers', () => {
    showExercisesWithMovement();
    setMovementOpen(true);
    component.selectDay(day.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.movement-preview img')).toBeNull();
    expect(component.isTrackerExpanded(day, exercise)).toBeTrue();
  });

  it('uses a known packaged URL for a global local exercise while excluding coach exercises with the same URL', () => {
    const imageUrl = '/assets/exercises/v1/bcf04802-483d-4abb-8b4d-ef5963db684c.webp';
    const localGlobal: ClientPortalExercise = { ...exercise, exerciseId: 'local-global-id', source: 'global', imageUrl };
    const custom: ClientPortalExercise = { ...exercise, id: 'custom-assignment', exerciseId: 'bcf04802-483d-4abb-8b4d-ef5963db684c', source: 'coach', imageUrl, order: 2 };
    component.routine.set({ ...routine, days: [{ ...day, exercises: [localGlobal, custom] }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.exercise-movement').length).toBe(1);
    setMovementOpen(true);
    expect(fixture.nativeElement.querySelector('.movement-preview img').getAttribute('src')).toBe(imageUrl);
    expect(component.movementImage({ ...localGlobal, imageUrl: '/assets/exercises/v1/unknown.webp' })).toBeNull();
    expect(component.movementImage({ ...localGlobal, source: undefined })).toBeNull();
  });
});
