import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, CoachProfile, ExerciseItem } from '../../core/data/coach-data.service';
import { GymContextService } from '../gyms/gym-context.service';
import { RoutineBuilderComponent } from './routine-builder.component';
import { RoutineDataService } from './routine-data.service';
import { createRoutineExercise, emptyRoutinePlan, RoutinePlan } from './routine.models';
import { RoutinePdfService } from './routine-pdf.service';

describe('Routine builder numeric DOM and recovery', () => {
  const profile: CoachProfile = { id: 'routine-form-coach', name: 'Entrenador', email: 'coach@example.invalid',
    brandColor: '', role: 'coach', accountType: 'independent', coachPlan: 'standard' };
  const exercise: ExerciseItem = { id: 'exercise', name: 'Sentadilla', muscleGroup: 'Piernas', source: 'global' };
  let fixture: ComponentFixture<RoutineBuilderComponent>;
  let component: RoutineBuilderComponent;
  let data: jasmine.SpyObj<RoutineDataService>;
  let pdf: jasmine.SpyObj<RoutinePdfService>;
  let navigate: jasmine.Spy;

  beforeEach(async () => {
    data = jasmine.createSpyObj<RoutineDataService>('RoutineDataService', ['getClients', 'getExercises', 'saveRoutine', 'getRoutine']);
    data.getClients.and.resolveTo([{ id: 'client', name: 'Atleta', email: 'client@example.invalid' }]);
    data.getExercises.and.resolveTo([exercise]);
    data.saveRoutine.and.resolveTo('saved-routine');
    pdf = jasmine.createSpyObj<RoutinePdfService>('RoutinePdfService', ['download']);
    pdf.download.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [RoutineBuilderComponent], providers: [provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ id: profile.id }), waitUntilReady: () => Promise.resolve() } },
        { provide: CoachDataService, useValue: { currentProfile: signal(profile), getProfile: () => Promise.resolve(profile) } },
        { provide: GymContextService, useValue: { activeGym: signal(null) } },
        { provide: RoutineDataService, useValue: data },
        { provide: RoutinePdfService, useValue: pdf }
      ]
    }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(RoutineBuilderComponent);
    component = fixture.componentInstance;
    await settle();
    const plan = emptyRoutinePlan('client', 'Atleta');
    Object.assign(plan, { name: 'Fuerza', objective: 'Mejorar fuerza', trainingDaysCount: 1, days: [plan.days[0]] });
    plan.days[0].muscleGroups = ['Piernas'];
    plan.days[0].exercises = [createRoutineExercise(exercise, 1)];
    component.draft.set(plan);
    data.getRoutine.and.callFake(async () => structuredClone(component.draft()));
    component.step.set(2);
    await settle();
  });

  afterEach(() => {
    fixture?.destroy();
    const key = `zummith:routine-draft:${profile.id}:independent:unassigned`;
    localStorage.removeItem(key); localStorage.removeItem(`${key}:step`);
  });

  async function settle(): Promise<void> { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function button(text: string): HTMLButtonElement {
    const result = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(item => item.textContent?.trim() === text);
    if (!result) throw new Error(`Missing routine action: ${text}`);
    return result;
  }
  async function fill(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await settle();
  }

  async function prepareSequentialDays(): Promise<void> {
    const plan = emptyRoutinePlan('client', 'Atleta');
    Object.assign(plan, { name: 'Fuerza', objective: 'Mejorar fuerza' });
    plan.days.forEach(day => { day.muscleGroups = ['Piernas']; });
    component.draft.set(plan);
    component.step.set(4);
    component.selectedDayIndex.set(0);
    await settle();
  }

  it('applies general ranges to current and subsequently added exercises on other days', async () => {
    await prepareSequentialDays();
    component.addExercise(exercise);
    component.addGeneralWeekConfig();
    component.generalWeekConfigs()[0].reps = '6-8';
    component.generalProgressionChanged();
    component.addGeneralWeekConfig();
    component.generalWeekConfigs()[1].sets = 4;
    component.generalProgressionChanged();
    component.setActiveDay(1); component.addExercise(exercise);
    const [first, second] = component.draft().days.map(day => day.exercises[0]);
    expect(first.weekConfigs).toEqual(second.weekConfigs);
    expect(second.weekConfigs.map(config => [config.startWeek, config.endWeek, config.sets, config.reps])).toEqual([[1, 2, 3, '6-8'], [3, 4, 4, '10-12']]);
    second.weekConfigs[0].sets = 5; component.changed();
    expect(first.weekConfigs[0].sets).toBe(3);
    expect(component.generalWeekConfigs()[0].sets).toBe(3);
    component.addExercise({ ...exercise, id: 'new-leg-exercise', name: 'Prensa' });
    expect(component.draft().days[1].exercises[1].weekConfigs[0].sets).toBe(3);
  });

  it('restores general ranges from a draft before adding a later day exercise', async () => {
    await prepareSequentialDays(); component.addGeneralWeekConfig(); component.addExercise(exercise);
    component.setActiveDay(1); await settle();
    fixture.destroy(); fixture = TestBed.createComponent(RoutineBuilderComponent); component = fixture.componentInstance;
    await settle();
    expect(component.generalWeekConfigs().length).toBe(1);
    component.addExercise(exercise);
    expect(component.draft().days[1].exercises[0].weekConfigs).toEqual(component.generalWeekConfigs());
  });

  it('propagates general field edits and removals through the real number controls', async () => {
    component.step.set(4); component.addGeneralWeekConfig(); await settle();
    await fill(fixture.nativeElement.querySelector('.general-progression .week-row input[type="number"]'), '0');
    button('Revisar rutina').click(); await settle();
    expect(component.step()).toBe(4);
    expect(fixture.nativeElement.querySelector('#routine-validation').textContent).toContain('progresión general');
    await fill(fixture.nativeElement.querySelector('.general-progression .week-row input[type="number"]'), '1');
    expect(component.draft().days[0].exercises[0].weekConfigs[0].startWeek).toBe(1);
    (fixture.nativeElement.querySelector('[aria-label="Eliminar rango general"]') as HTMLButtonElement).click(); await settle();
    expect(component.generalWeekConfigs()).toEqual([]);
    expect(component.draft().days[0].exercises[0].weekConfigs).toEqual([]);
    button('Revisar rutina').click(); await settle(); expect(component.step()).toBe(5);
  });

  it('saves general ranges on every exercise without rewriting individual overrides', async () => {
    component.addGeneralWeekConfig();
    component.draft().days[0].exercises[0].weekConfigs[0].sets = 5; component.changed();
    component.step.set(5); await settle(); button('Guardar rutina').click(); await settle();
    expect(data.saveRoutine).toHaveBeenCalledTimes(1);
    const saved = data.saveRoutine.calls.mostRecent().args[0];
    expect(saved.days[0].exercises[0].weekConfigs[0].sets).toBe(5);
    expect(saved.generalWeekConfigs![0].sets).toBe(3);
  });

  const backExercise: ExerciseItem = { id: 'back', name: 'Remo', muscleGroup: 'Espalda', source: 'global' };
  const coreExercise: ExerciseItem = { id: 'core', name: 'Plancha', muscleGroup: 'Core', source: 'coach' };
  const armExercise: ExerciseItem = { id: 'arms', name: 'Curl de bíceps', muscleGroup: 'Brazos', source: 'global' };
  function catalogNames(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.catalog-list article strong') as NodeListOf<HTMLElement>)
      .map(item => item.textContent!.trim());
  }

  it('limits All, search and the group selector to the groups chosen for the active day', async () => {
    component.exercises.set([exercise, backExercise, coreExercise, armExercise]);
    component.toggleMuscleGroup(0, 'Core');
    component.step.set(4); await settle();
    expect(catalogNames()).toEqual(['Sentadilla', 'Plancha']);
    expect(component.exerciseGroups()).toEqual(['Todos', 'Core', 'Piernas']);
    expect(fixture.nativeElement.querySelector('.exercise-catalog > header span').textContent).toContain('2 disponibles');
    component.exerciseGroup.set('Core'); await settle();
    expect(catalogNames()).toEqual(['Plancha']);
    component.exerciseGroup.set('Todos');
    await fill(fixture.nativeElement.querySelector('#routine-exercise-search'), 'Remo');
    expect(catalogNames()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.catalog-empty').textContent).toContain('Sin coincidencias');
    await fill(fixture.nativeElement.querySelector('#routine-exercise-search'), 'Plancha');
    expect(catalogNames()).toEqual(['Plancha']);
    expect(data.saveRoutine).not.toHaveBeenCalled();
  });

  it('updates the library when switching days and rejects adding an exercise outside the target groups', async () => {
    component.exercises.set([exercise, backExercise, coreExercise]);
    const plan = structuredClone(component.draft());
    plan.days.push({ ...structuredClone(plan.days[0]), dayNumber: 2, dayName: 'Día 2', muscleGroups: ['Espalda'], exercises: [] });
    plan.trainingDaysCount = 2;
    component.draft.set(plan); component.step.set(4); await settle();
    component.exerciseGroup.set('Piernas'); component.exerciseQuery.set('Sentadilla');
    component.setActiveDay(1); await settle();
    expect(catalogNames()).toEqual(['Remo']);
    expect(component.exerciseGroup()).toBe('Todos');
    expect(component.exerciseQuery()).toBe('');
    component.addExercise(coreExercise);
    expect(component.activeDay()!.exercises).toEqual([]);
    component.addExercise(backExercise); await settle();
    expect(component.activeDay()!.muscleGroups).toEqual(['Espalda']);
    expect(component.activeDay()!.exercises.map(item => item.exerciseId)).toEqual(['back']);
    component.setActiveDay(0); await settle();
    expect(catalogNames()).toEqual(['Sentadilla']);
    expect(component.activeDay()!.exercises[0].exerciseId).toBe(exercise.id);
  });

  it('refreshes a removed group filter without removing exercises already prescribed', async () => {
    component.exercises.set([exercise, backExercise]);
    component.exerciseGroup.set('Piernas');
    component.exerciseQuery.set('Sentadilla');
    component.toggleMuscleGroup(0, 'Piernas');
    component.toggleMuscleGroup(0, 'Espalda');
    component.step.set(4); await settle();
    expect(component.exerciseQuery()).toBe('');
    expect(component.exerciseGroup()).toBe('Todos');
    expect(component.selectedExerciseGroup()).toBe('Todos');
    expect(component.exerciseGroups()).toEqual(['Todos', 'Espalda']);
    expect(fixture.nativeElement.querySelector('#routine-exercise-group').textContent).toContain('Todos');
    expect(catalogNames()).toEqual(['Remo']);
    expect(component.draft().days[0].exercises[0].exerciseId).toBe(exercise.id);
    expect(fixture.nativeElement.querySelector('.prescription-panel').textContent).toContain('Sentadilla');
    component.addExercise(exercise);
    expect(component.draft().days[0].exercises.length).toBe(1);
  });

  it('shows an empty state and a route back to group selection instead of exposing the whole catalog', async () => {
    component.exercises.set([exercise, backExercise]);
    component.toggleMuscleGroup(0, 'Piernas');
    component.toggleMuscleGroup(0, 'Rehabilitación');
    component.step.set(4); await settle();
    expect(catalogNames()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.catalog-empty').textContent).toContain('Sin ejercicios para estos grupos');
    button('Revisar grupos musculares').click(); await settle();
    expect(component.step()).toBe(3);
    component.toggleMuscleGroup(0, 'Rehabilitación');
    component.step.set(4); await settle();
    expect(catalogNames()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.catalog-empty').textContent).toContain('Selecciona los grupos de este día');
  });

  it('limits replacements to the day groups and retains the prescription', async () => {
    const alternative: ExerciseItem = { id: 'lunge', name: 'Zancada', muscleGroup: 'Piernas', source: 'coach' };
    component.exercises.set([exercise, alternative, backExercise]);
    component.step.set(4);
    const before = structuredClone(component.draft().days[0].exercises[0]);
    component.exerciseGroup.set('Espalda');
    component.startReplace(0, 0); await settle();
    expect(component.selectedExerciseGroup()).toBe('Todos');
    expect(catalogNames()).toEqual(['Sentadilla', 'Zancada']);
    component.chooseExercise(backExercise);
    expect(component.draft().days[0].exercises[0]).toEqual(before);
    expect(component.replaceTarget()).not.toBeNull();
    component.chooseExercise(alternative); await settle();
    expect(component.replaceTarget()).toBeNull();
    expect(component.draft().days[0].exercises[0]).toEqual(jasmine.objectContaining({
      exerciseId: 'lunge', sets: before.sets, reps: before.reps, rest: before.rest, weekConfigs: before.weekConfigs
    }));
    expect(component.draft().days[0].muscleGroups).toEqual(['Piernas']);
  });

  it('allows selecting existing catalog and saved groups such as Brazos in Distribution', async () => {
    component.exercises.set([exercise, armExercise]);
    component.toggleMuscleGroup(0, 'Cuello');
    component.step.set(3); await settle();
    expect(component.muscleGroups()).toContain('Brazos');
    expect(component.muscleGroups()).toContain('Cuello');
    button('Brazos').click(); await settle();
    expect(component.draft().days[0].muscleGroups).toContain('Brazos');
    component.step.set(4); await settle();
    expect(catalogNames()).toEqual(['Sentadilla', 'Curl de bíceps']);
    component.addExercise(armExercise); await settle();
    expect(component.draft().days[0].exercises.map(item => item.exerciseId)).toEqual(['exercise', 'arms']);
  });

  it('completes exercise selection one day at a time and preserves each day when going back', async () => {
    await prepareSequentialDays();
    const dayButtons = () => fixture.nativeElement.querySelectorAll('.day-tabs button') as NodeListOf<HTMLButtonElement>;
    expect(dayButtons()[1].disabled).toBeTrue();
    expect(dayButtons()[2].disabled).toBeTrue();
    component.setActiveDay(2);
    button('Siguiente día').click(); await settle();
    expect(component.selectedDayIndex()).toBe(0);
    expect(component.validationIssues().join(' ')).toContain('Día 1');
    expect(component.validationIssues().join(' ')).not.toContain('Día 2');

    button('Agregar').click(); await settle();
    button('Siguiente día').click(); await settle();
    expect(component.step()).toBe(4);
    expect(component.selectedDayIndex()).toBe(1);
    expect(component.validationIssues()).toEqual([]);
    expect(dayButtons()[2].disabled).toBeTrue();
    button('Día anterior').click(); await settle();
    expect(component.selectedDayIndex()).toBe(0);
    expect(component.activeDay()?.exercises.length).toBe(1);
    button('Siguiente día').click(); await settle();
    button('Agregar').click(); await settle();
    button('Siguiente día').click(); await settle();
    expect(component.selectedDayIndex()).toBe(2);
    button('Revisar rutina').click(); await settle();
    expect(component.step()).toBe(4);
    button('Agregar').click(); await settle();
    button('Revisar rutina').click(); await settle();
    expect(component.step()).toBe(5);
    expect(component.draft().days.map(day => day.exercises.length)).toEqual([1, 1, 1]);
    expect(data.saveRoutine).not.toHaveBeenCalled();
  });

  it('keeps later days locked while the current prescription or its progression is invalid', async () => {
    await prepareSequentialDays();
    component.addExercise(exercise); await settle();
    const restInput = fixture.nativeElement.querySelectorAll('.prescription-grid input')[2] as HTMLInputElement;
    await fill(restInput, '');
    button('Siguiente día').click(); await settle();
    expect(component.canSelectDay(1)).toBeFalse();
    expect(component.selectedDayIndex()).toBe(0);
    await fill(restInput, '90 s');
    component.activeDay()!.exercises[0].weekConfigs = [{ startWeek: 3, endWeek: 2, sets: 3, reps: '8', rest: '60 s', notes: '' }];
    component.changed(); await settle();
    button('Siguiente día').click(); await settle();
    expect(component.canSelectDay(1)).toBeFalse();
    expect(component.validationIssues().join(' ')).toContain('progresión');
    expect(data.saveRoutine).not.toHaveBeenCalled();
  });

  it('opens the first unfinished day instead of bypassing it through the review step', async () => {
    await prepareSequentialDays();
    component.addExercise(exercise); await settle();
    component.goToStep(5); await settle();
    expect(component.step()).toBe(4);
    expect(component.selectedDayIndex()).toBe(1);
    expect(component.validationIssues().join(' ')).toContain('Día 2');
    expect(component.canSelectDay(2)).toBeFalse();
  });

  it('prevents moving exercises into locked days and locks a later day again if its predecessor becomes empty', async () => {
    await prepareSequentialDays();
    component.addExercise(exercise);
    component.moveExerciseToDay(0, 0, 2); await settle();
    expect(component.draft().days.map(day => day.exercises.length)).toEqual([1, 0, 0]);
    component.setActiveDay(1);
    component.addExercise(exercise);
    component.moveExerciseToDay(1, 0, 2); await settle();
    expect(component.draft().days.map(day => day.exercises.length)).toEqual([1, 0, 1]);
    expect(component.selectedDayIndex()).toBe(1);
    expect(component.canSelectDay(2)).toBeFalse();
    component.addExercise(exercise);
    component.next(); await settle();
    expect(component.selectedDayIndex()).toBe(2);
    expect(component.activeDay()?.exercises[0].exerciseId).toBe(exercise.id);
  });

  it('restores the current exercise day with the saved draft', async () => {
    await prepareSequentialDays();
    component.addExercise(exercise);
    component.setActiveDay(1); await settle();
    fixture.destroy();
    fixture = TestBed.createComponent(RoutineBuilderComponent);
    component = fixture.componentInstance;
    await settle();
    expect(component.draftRestored()).toBeTrue();
    expect(component.step()).toBe(4);
    expect(component.selectedDayIndex()).toBe(1);
    expect(component.draft().days.map(day => day.exercises.length)).toEqual([1, 0, 0]);
  });

  it('lets the trainer leave, reload or cancel a new routine without a confirmation and retains the draft', async () => {
    await prepareSequentialDays();
    component.addExercise(exercise);
    component.setActiveDay(1); await settle();
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    expect(component.canDeactivate()).toBeTrue();
    const unload = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(unload);
    expect(unload.defaultPrevented).toBeFalse();
    await component.cancel();
    expect(confirm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/clients', 'client'], { queryParams: {} });
    const stored = JSON.parse(localStorage.getItem(`zummith:routine-draft:${profile.id}:independent:unassigned`)!);
    expect(stored.selectedDayIndex).toBe(1);
    expect(stored.plan.days[0].exercises[0].exerciseId).toBe(exercise.id);
  });

  it('keeps an empty duration empty and blocks progression instead of silently prescribing one week', async () => {
    const input = fixture.nativeElement.querySelector('#routine-weeks') as HTMLInputElement;
    await fill(input, '');
    button('Continuar').click(); await settle();
    expect(input.value).toBe('');
    expect(component.step()).toBe(2);
    expect(fixture.nativeElement.querySelector('#routine-validation')?.textContent).toContain('duración');
    expect(data.saveRoutine).not.toHaveBeenCalled();
  });

  it('rejects zero and out-of-range duration values without replacing what the trainer entered', async () => {
    for (const value of ['0', '-1', '53', '2.5']) {
      component.step.set(2); await settle();
      const input = fixture.nativeElement.querySelector('#routine-weeks') as HTMLInputElement;
      await fill(input, value);
      button('Continuar').click(); await settle();
      expect(component.step()).withContext(value).toBe(2);
      expect(input.value).withContext(value).toBe(value);
      expect(fixture.nativeElement.querySelector('#routine-validation')?.textContent).withContext(value).toContain('duración');
    }
    expect(data.saveRoutine).not.toHaveBeenCalled();
  });

  it('rejects empty, zero and fractional series/week numbers through real number value accessors', async () => {
    component.draft().days[0].exercises[0].weekConfigs = [{ startWeek: 1, endWeek: 4, sets: 3, reps: '8-12', rest: '1.5 min', notes: '' }];
    component.step.set(4); await settle();
    for (const value of ['', '0', '-1', '2.5']) {
      const input = fixture.nativeElement.querySelector('.prescription-grid input[type="number"]') as HTMLInputElement;
      await fill(input, value);
      button('Revisar rutina').click(); await settle();
      expect(component.step()).withContext(`series ${value}`).toBe(4);
      expect(fixture.nativeElement.querySelector('#routine-validation')).not.toBeNull();
    }
    await fill(fixture.nativeElement.querySelector('.prescription-grid input[type="number"]'), '4');
    for (let index = 0; index < 3; index++) {
      const input = fixture.nativeElement.querySelectorAll('.week-row input[type="number"]')[index] as HTMLInputElement;
      const original = input.value;
      for (const value of ['', '0', '1.5']) {
        await fill(input, value);
        button('Revisar rutina').click(); await settle();
        expect(component.step()).withContext(`range ${index}: ${value}`).toBe(4);
      }
      await fill(input, original);
    }
    expect(data.saveRoutine).not.toHaveBeenCalled();
    button('Revisar rutina').click(); await settle();
    expect(component.step()).toBe(5);
  });

  it('preserves numeric series, repetition ranges and fractional text rests across a failed save and explicit retry', async () => {
    component.step.set(4); await settle();
    await fill(fixture.nativeElement.querySelector('.prescription-grid input[type="number"]'), '4');
    const textInputs = fixture.nativeElement.querySelectorAll('.prescription-grid input:not([type="number"])');
    await fill(textInputs[0], '8-12'); await fill(textInputs[1], '1.5 min');
    component.step.set(5); await settle();
    data.saveRoutine.and.rejectWith(new Error('private backend failure'));
    const expected = structuredClone(component.draft());
    button('Guardar rutina').click(); await settle();
    expect(component.draft()).toEqual(expected);
    expect(component.saving()).toBeFalse();
    expect(component.dirty()).toBeTrue();
    expect(component.error()).toContain('Tu borrador sigue disponible');
    expect(fixture.nativeElement.textContent).not.toContain('private backend failure');
    expect(navigate).not.toHaveBeenCalled();
    const first = structuredClone(data.saveRoutine.calls.mostRecent().args[0]);

    data.saveRoutine.and.resolveTo('saved-routine');
    button('Guardar rutina').click(); await settle();
    expect(data.saveRoutine).toHaveBeenCalledTimes(2);
    expect(data.saveRoutine.calls.mostRecent().args[0]).toEqual(first);
    expect((first as RoutinePlan).days[0].exercises[0]).toEqual(jasmine.objectContaining({ sets: 4, reps: '8-12', rest: '1.5 min' }));
    expect(component.error()).toBe('');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('saves before exporting and routes a failed download to the saved routine without inserting twice', async () => {
    component.step.set(5); await settle();
    pdf.download.and.rejectWith(new Error('download unavailable'));
    button('Guardar y descargar PDF').click(); await settle();
    expect(data.saveRoutine).toHaveBeenCalledTimes(1);
    expect(pdf.download).toHaveBeenCalledTimes(1);
    expect(component.error()).toBe('');
    expect(component.pdfError()).toContain('No pudimos descargar');
    expect(navigate).toHaveBeenCalledWith(['/routines', 'saved-routine'], {
      queryParams: { result: 'created', pdf: 'retry' }
    });
    pdf.download.and.resolveTo();
    await component.printRoutine();
    expect(pdf.download).toHaveBeenCalledTimes(2);
    expect(data.saveRoutine).toHaveBeenCalledTimes(1);
  });

  it('exports the persisted routine instead of the editable draft after saving successfully', async () => {
    const saved = { ...structuredClone(component.draft()), id: 'saved-routine', name: 'Nombre guardado' };
    data.getRoutine.and.resolveTo(saved);
    component.step.set(5); await settle();
    button('Guardar y descargar PDF').click(); await settle();
    expect(data.saveRoutine).toHaveBeenCalledTimes(1);
    expect(data.getRoutine).toHaveBeenCalledOnceWith('saved-routine', profile.id, undefined);
    expect(pdf.download).toHaveBeenCalledOnceWith(saved, profile, undefined);
    expect(navigate).toHaveBeenCalledWith(['/routines', 'saved-routine'], { queryParams: { result: 'created' } });
    expect(component.pdfError()).toBe('');
  });

  it('does not export or navigate when saving fails', async () => {
    component.step.set(5); await settle();
    data.saveRoutine.and.rejectWith(new Error('offline'));
    button('Guardar y descargar PDF').click(); await settle();
    expect(pdf.download).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.error()).toContain('Tu borrador sigue disponible');
  });

  it('keeps the loaded routine visible after a PDF failure and retries export without reloading or saving the plan', async () => {
    component.draft.update(plan => ({ ...plan, id: 'saved-routine' }));
    component.original.set(structuredClone(component.draft()));
    component.mode.set('view');
    await settle();
    const expected = structuredClone(component.draft());
    pdf.download.and.rejectWith(new Error('private export failure'));

    button('Descargar PDF').click(); await settle();

    expect(pdf.download).toHaveBeenCalledTimes(1);
    expect(component.draft()).toEqual(expected);
    expect(component.exporting()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.routine-summary')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Fuerza');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('No pudimos descargar el PDF');
    expect(fixture.nativeElement.textContent).not.toContain('private export failure');
    expect(button('Descargar PDF').disabled).toBeFalse();

    pdf.download.and.resolveTo();
    button('Reintentar').click(); await settle();

    expect(pdf.download).toHaveBeenCalledTimes(2);
    expect(pdf.download.calls.argsFor(1)).toEqual(pdf.download.calls.argsFor(0));
    expect(fixture.nativeElement.querySelector('.routine-summary')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(data.getRoutine).not.toHaveBeenCalled();
    expect(data.saveRoutine).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
