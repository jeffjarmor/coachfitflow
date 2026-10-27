import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { RoutinePdfService } from './routine-pdf.service';
import { ZUMMITH_CONTACT } from '../../core/config/contact';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { fadeOutModal } from '../../shared/modal-motion';
import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, CoachProfile, ExerciseItem } from '../../core/data/coach-data.service';
import { hasActiveIndependentPro } from '../../core/data/plan-access';
import { referenceImage } from '../exercises-astra/exercise-media';
import { isGlobalExerciseImageUrl, resolveGlobalExerciseImage } from '../../shared/global-exercise-media';
import { RoutineDataService } from './routine-data.service';
import { ContextHelpComponent, ContextHelpStep } from '../../shared/context-help/context-help.component';
import { GymContextService } from '../gyms/gym-context.service';
import {
  calculateRoutineEndDate,
  createRoutineDays,
  createRoutineExercise,
  emptyRoutinePlan,
  MUSCLE_GROUPS,
  RoutineBlockType,
  RoutineClientOption,
  RoutineDay,
  RoutineDayExercise,
  RoutinePlan,
  RoutineWeekConfig
} from './routine.models';

type BuilderMode = 'view' | 'edit';

@Component({
  selector: 'app-routine-builder',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, ContextHelpComponent, CustomSelectComponent],
  templateUrl: './routine-builder.component.html',
  styleUrl: './routine-builder.component.scss'
})
export class RoutineBuilderComponent implements OnInit {
  readonly contact = ZUMMITH_CONTACT;
  readonly catalogPagination = createListPagination(() => this.filteredExercises(), () => JSON.stringify([this.selectedDayIndex(), this.activeDay()?.muscleGroups, this.exerciseQuery(), this.selectedExerciseGroup()]));
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly data = inject(RoutineDataService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);

  private readonly pdf = inject(RoutinePdfService);
  readonly exporting = signal(false);
  readonly pdfError = signal('');
  get contextParams() { return this.adminContext ? {gymId: this.gymId || null, membershipId: this.route.snapshot.queryParamMap.get('membershipId')} : {}; }

  readonly muscleGroups = computed(() => {
    const groups = new Set<string>(MUSCLE_GROUPS);
    const extraGroups = [
      ...this.exercises().map(exercise => exercise.muscleGroup),
      ...this.draft().days.flatMap(day => day.muscleGroups)
    ].filter(group => group.trim()).sort((a, b) => a.localeCompare(b, 'es'));
    extraGroups.forEach(group => groups.add(group));
    return [...groups];
  });
  readonly routineId = this.route.snapshot.paramMap.get('id');
  readonly gymId = this.route.snapshot.paramMap.get('gymId') || (this.route.snapshot.data['adminContext'] ? this.route.snapshot.queryParamMap.get('gymId') : '') || '';
  readonly adminCoachId = (this.route.snapshot.paramMap.get('coachId') === 'unassigned' ? this.auth.user()?.id : this.route.snapshot.paramMap.get('coachId')) || '';
  readonly adminClientId = this.route.snapshot.paramMap.get('clientId') || '';
  readonly adminContext = !!this.route.snapshot.data['adminContext'];
  readonly canModify = computed(() => this.adminContext || this.coachData.currentProfile()?.role === 'admin' || (!this.gymId || (!!this.gyms.activeGym()?.permissions.canCreateRoutines && (!this.routineId || this.original()?.coachId === this.auth.user()?.id))));
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly mode = signal<BuilderMode>(this.routineId ? 'view' : 'edit');
  readonly step = signal(1);
  readonly validationAttempted = signal(false);
  readonly validationIssues = computed(() => {
    if (!this.validationAttempted()) return [];
    const day = this.activeDay();
    return this.step() === 4 && day ? this.validateDay(day, this.draft()) : this.validateStep(this.step());
  });
  readonly clients = signal<RoutineClientOption[]>([]);
  readonly exercises = signal<ExerciseItem[]>([]);
  readonly brokenGlobalExerciseImages = signal(new Set<string>());
  readonly profile = signal<CoachProfile | null>(null);
  readonly draft = signal<RoutinePlan>(emptyRoutinePlan());
  readonly generalWeekConfigs = computed(() => this.draft().generalWeekConfigs ?? []);
  readonly original = signal<RoutinePlan | null>(null);
  readonly dirty = signal(false);
  readonly selectedDayIndex = signal(0);
  readonly trainingDayOptions = Array.from({ length: 7 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} ${index === 0 ? 'día' : 'días'}` }));
  readonly exerciseQuery = signal('');
  readonly exerciseGroup = signal('Todos');
  copyDaySelectOptions(dayIndex: number): { value: string; label: string }[] {
    return this.draft().days.flatMap((day, index) => index === dayIndex ? [] : [{ value: String(index), label: day.dayName }]);
  }

  moveDaySelectOptions(): { value: string; label: string }[] {
    return this.copyDaySelectOptions(this.selectedDayIndex()).filter((option) => this.canSelectDay(Number(option.value)));
  }
  readonly deleteDialogOpen = signal(false);
  readonly draftRestored = signal(false);
  readonly replaceTarget = signal<{ dayIndex: number; exerciseIndex: number } | null>(null);
  private allowNavigation = false;
  private draftKey = '';
  readonly helpSteps: ContextHelpStep[] = [
    { title: 'Selecciona el cliente', description: 'La rutina quedará vinculada a su ficha y aparecerá en su historial de planes.' },
    { title: 'Define el plan', description: 'Completa objetivo, duración, fechas y días de entrenamiento. El asistente valida cada etapa antes de avanzar.' },
    { title: 'Construye las sesiones', description: 'Asigna grupos musculares y ejercicios. El plan Pro habilita biseries, triseries y progresiones.' },
    { title: 'Revisa y guarda', description: 'Comprueba el resumen final. El borrador se conserva en este navegador hasta que guardes o descartes el trabajo.' }
  ];

  readonly isCreate = computed(() => !this.routineId);
  readonly durationInvalid = computed(() => {
    const value = this.draft().durationWeeks;
    return value == null || !Number.isInteger(value) || value < 1 || value > 52;
  });
  readonly activeDay = computed(() => this.draft().days[this.selectedDayIndex()] || null);
  readonly firstIncompleteDayIndex = computed(() => this.draft().days.findIndex((day) => this.validateDay(day, this.draft()).length > 0));
  readonly totalExercises = computed(() => this.draft().days.reduce((total, day) => total + day.exercises.length, 0));
  readonly hasPremium = computed(() => {
    if (this.adminContext) return true;
    const profile = this.profile();
    if (this.gymId) return true;
    if (!profile) return false;
    if (profile.role === 'admin' || profile.accountType === 'gym') return true;
    return hasActiveIndependentPro(profile);
  });
  readonly exerciseGroups = computed(() => [
    'Todos',
    ...Array.from(new Set(this.draft().days[this.selectedDayIndex()]?.muscleGroups ?? [])).sort((a, b) => a.localeCompare(b, 'es'))
  ]);
  readonly selectedExerciseGroup = computed(() => this.exerciseGroups().includes(this.exerciseGroup()) ? this.exerciseGroup() : 'Todos');
  readonly dayExercises = computed(() => {
    const groups = this.draft().days[this.selectedDayIndex()]?.muscleGroups ?? [];
    return this.exercises().filter(exercise => groups.includes(exercise.muscleGroup));
  });
  readonly filteredExercises = computed(() => {
    const query = this.exerciseQuery().trim().toLocaleLowerCase('es');
    const group = this.selectedExerciseGroup();
    return this.dayExercises().filter((exercise) =>
      (group === 'Todos' || exercise.muscleGroup === group)
      && (!query || `${exercise.name} ${exercise.muscleGroup}`.toLocaleLowerCase('es').includes(query))
    );
  });
  async ngOnInit(): Promise<void> {
    await this.auth.waitUntilReady();
    const actorId = this.auth.user()?.id;
    const coachId = this.adminCoachId || actorId;
    if (!actorId || !coachId) {
      this.error.set('No pudimos identificar la sesión activa. Inicia sesión nuevamente.');
      this.loading.set(false);
      return;
    }

    try {
      if (this.adminContext && this.gymId) {
        await this.gyms.loadAccessibleGyms(actorId, 'admin', true);
        if (!this.gyms.activateGym(this.gymId, actorId)) throw new Error('Gym context not available');
      }
      const [clients, exercises, profile] = await Promise.all([
        this.data.getClients(coachId, this.gymId || undefined),
        this.data.getExercises(coachId, this.gymId || undefined),
        this.coachData.getProfile(coachId, { setCurrent: !this.adminContext })
      ]);
      this.clients.set(clients);
      this.exercises.set(exercises);
      this.profile.set(profile);

      if (this.routineId) {
        const routine = await this.data.getRoutine(this.routineId, coachId, this.gymId || undefined);
        this.draft.set(this.withGeneralProgression(this.clone(routine)));
        this.original.set(this.clone(this.draft()));
        this.notice.set(this.route.snapshot.queryParamMap.get('result') === 'created' ? 'La rutina quedó guardada.' : '');
        if (this.route.snapshot.queryParamMap.get('pdf') === 'retry') {
          this.pdfError.set('La rutina quedó guardada, pero no pudimos descargar el PDF. Puedes reintentar la descarga.');
        }
      } else {
        this.prepareNewDraft(coachId, clients);
      }
    } catch {
      this.error.set(this.routineId
        ? 'No pudimos cargar la rutina. Comprueba que aún tengas acceso e inténtalo nuevamente.'
        : 'No pudimos preparar el asistente. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  private prepareNewDraft(coachId: string, clients: RoutineClientOption[]): void {
    const queryClientId = this.adminClientId || this.route.snapshot.queryParamMap.get('clientId') || '';
    const selected = clients.find((client) => client.id === queryClientId);
    this.draftKey = this.getDraftKey(coachId, queryClientId || 'unassigned');
    const stored = this.readDraft(this.draftKey);
    if (stored && (!queryClientId || stored.plan.clientId === queryClientId)) {
      this.draft.set(this.withGeneralProgression(stored.plan));
      this.selectedDayIndex.set(stored.selectedDayIndex);
      this.ensureActiveDayAccessible();
      this.step.set(Math.min(5, Math.max(1, Number(localStorage.getItem(`${this.draftKey}:step`)) || 1)));
      this.draftRestored.set(true);
      this.dirty.set(true);
      return;
    }
    this.draft.set(emptyRoutinePlan(selected?.id || '', selected?.name || ''));
  }

  selectClient(clientId: string): void {
    const client = this.clients().find((option) => option.id === clientId);
    this.draft.update((plan) => ({ ...plan, clientId, clientName: client?.name || '' }));
    const coachId = this.adminCoachId || this.auth.user()?.id;
    if (coachId) this.draftKey = this.getDraftKey(coachId, clientId || 'unassigned');
    this.changed();
  }

  updateSchedule(): void {
    this.draft.update((plan) => {
      const count = Math.min(7, Math.max(1, Number(plan.trainingDaysCount) || 1));
      return {
        ...plan,
        trainingDaysCount: count,
        endDate: calculateRoutineEndDate(plan.startDate, plan.durationWeeks),
        days: createRoutineDays(count, plan.days)
      };
    });
    if (this.selectedDayIndex() >= this.draft().days.length) this.selectedDayIndex.set(this.draft().days.length - 1);
    this.changed();
  }

  changed(): void {
    this.draft.update((plan) => ({ ...plan }));
    this.ensureActiveDayAccessible();
    this.dirty.set(true);
    this.persistDraft();
  }

  toggleMuscleGroup(dayIndex: number, group: string): void {
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, index) => index !== dayIndex ? day : {
        ...day,
        muscleGroups: day.muscleGroups.includes(group)
          ? day.muscleGroups.filter((item) => item !== group)
          : [...day.muscleGroups, group]
      })
    }));
    this.exerciseQuery.set('');
    this.exerciseGroup.set('Todos');
    this.changed();
  }

  copyDay(sourceIndex: number, targetIndex: number): void {
    if (sourceIndex === targetIndex || targetIndex < 0 || targetIndex >= this.draft().days.length) return;
    const source = this.draft().days[sourceIndex];
    const blockIds = new Map<string, string>();
    const exercises = this.clone(source.exercises).map((exercise: RoutineDayExercise, index: number) => {
      let blockId = exercise.blockId;
      if (blockId) {
        if (!blockIds.has(blockId)) blockIds.set(blockId, this.createId());
        blockId = blockIds.get(blockId) || null;
      }
      return { ...exercise, id: undefined, blockId, order: index + 1 };
    });
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, index) => index !== targetIndex ? day : {
        ...day,
        muscleGroups: [...source.muscleGroups],
        notes: source.notes,
        exercises
      })
    }));
    this.notice.set(`Copiamos la configuración en ${this.draft().days[targetIndex].dayName}.`);
    this.changed();
  }

  setActiveDay(index: number): void {
    if (!this.canSelectDay(index) || index === this.selectedDayIndex()) return;
    this.selectedDayIndex.set(index);
    this.replaceTarget.set(null);
    this.exerciseQuery.set('');
    this.exerciseGroup.set('Todos');
    this.validationAttempted.set(false);
    this.persistDraft();
    this.focusActiveDay();
  }

  canSelectDay(index: number): boolean {
    const firstIncomplete = this.firstIncompleteDayIndex();
    return Number.isInteger(index) && index >= 0 && index < this.draft().days.length
      && (firstIncomplete < 0 || index <= firstIncomplete);
  }

  private ensureActiveDayAccessible(): void {
    const firstIncomplete = this.firstIncompleteDayIndex();
    const lastAccessible = firstIncomplete < 0 ? this.draft().days.length - 1 : firstIncomplete;
    const index = Math.max(0, Math.min(this.selectedDayIndex(), lastAccessible));
    if (index !== this.selectedDayIndex()) {
      this.selectedDayIndex.set(index);
      this.replaceTarget.set(null);
      this.exerciseQuery.set('');
      this.exerciseGroup.set('Todos');
    }
  }

  private focusActiveDay(): void {
    requestAnimationFrame(() => {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      document.getElementById(`routine-day-${this.selectedDayIndex()}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
      document.getElementById('routine-day-title')?.focus({ preventScroll: true });
    });
  }

  addExercise(exercise: ExerciseItem): void {
    const dayIndex = this.selectedDayIndex();
    const day = this.draft().days[dayIndex];
    if (!day || !day.muscleGroups.includes(exercise.muscleGroup) || day.exercises.some((item) => item.exerciseId === exercise.id)) return;
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((item, index) => index !== dayIndex ? item : {
        ...item,
        exercises: [...item.exercises, { ...createRoutineExercise(exercise, item.exercises.length + 1), weekConfigs: this.clone(this.generalWeekConfigs()) }]
      })
    }));
    this.changed();
  }

  chooseExercise(exercise: ExerciseItem): void {
    const target = this.replaceTarget();
    if (!target) {
      this.addExercise(exercise);
      return;
    }
    if (!this.draft().days[target.dayIndex]?.muscleGroups.includes(exercise.muscleGroup)) return;
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, dayIndex) => dayIndex !== target.dayIndex ? day : {
        ...day,
        exercises: day.exercises.map((current, exerciseIndex) => exerciseIndex !== target.exerciseIndex ? current : {
          ...current,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          muscleGroup: exercise.muscleGroup,
          source: exercise.source,
          imageUrl: exercise.imageUrl,
          videoUrl: exercise.videoUrl
        })
      })
    }));
    this.replaceTarget.set(null);
    this.notice.set(`${exercise.name} reemplazó al ejercicio anterior sin cambiar la prescripción.`);
    this.changed();
  }

  startReplace(dayIndex: number, exerciseIndex: number): void {
    this.selectedDayIndex.set(dayIndex);
    this.replaceTarget.set({ dayIndex, exerciseIndex });
    this.exerciseQuery.set('');
    this.exerciseGroup.set('Todos');
  }

  isExerciseAdded(exerciseId: string): boolean {
    return !!this.activeDay()?.exercises.some((exercise) => exercise.exerciseId === exerciseId);
  }

  removeExercise(dayIndex: number, exerciseIndex: number): void {
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, index) => index !== dayIndex ? day : {
        ...day,
        exercises: this.normalizeBlocks(day.exercises.filter((_exercise, itemIndex) => itemIndex !== exerciseIndex))
      })
    }));
    this.changed();
  }

  moveExercise(dayIndex: number, exerciseIndex: number, direction: -1 | 1): void {
    const target = exerciseIndex + direction;
    const exercises = [...this.draft().days[dayIndex].exercises];
    if (target < 0 || target >= exercises.length) return;
    [exercises[exerciseIndex], exercises[target]] = [exercises[target], exercises[exerciseIndex]];
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, index) => index === dayIndex ? { ...day, exercises: this.normalizeBlocks(exercises) } : day)
    }));
    this.changed();
  }

  moveExerciseToDay(sourceDayIndex: number, exerciseIndex: number, targetDayIndex: number): void {
    if (sourceDayIndex === targetDayIndex || !this.canSelectDay(targetDayIndex)) return;
    const moving = this.clearBlock(this.draft().days[sourceDayIndex].exercises[exerciseIndex]);
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, dayIndex) => {
        if (dayIndex === sourceDayIndex) {
          return { ...day, exercises: this.normalizeBlocks(day.exercises.filter((_item, index) => index !== exerciseIndex)) };
        }
        if (dayIndex === targetDayIndex) {
          const exercises = [...day.exercises, { ...moving, order: day.exercises.length + 1 }];
          return {
            ...day,
            muscleGroups: day.muscleGroups.includes(moving.muscleGroup)
              ? day.muscleGroups
              : [...day.muscleGroups, moving.muscleGroup],
            exercises
          };
        }
        return day;
      })
    }));
    this.notice.set(`${moving.exerciseName} se movió a ${this.draft().days[targetDayIndex].dayName}.`);
    this.changed();
  }

  createBlock(dayIndex: number, startIndex: number, type: Exclude<RoutineBlockType, 'single'>): void {
    if (!this.hasPremium()) return;
    const size = type === 'triserie' ? 3 : 2;
    const day = this.draft().days[dayIndex];
    if (!day || startIndex + size > day.exercises.length) return;
    const blockId = this.createId();
    const blockLabel = String.fromCharCode(65 + new Set(day.exercises.flatMap((exercise) => exercise.blockId || [])).size);
    const selected = new Set(Array.from({ length: size }, (_value, index) => startIndex + index));
    const affectedBlockIds = new Set(day.exercises
      .filter((_exercise, index) => selected.has(index))
      .flatMap((exercise) => exercise.blockId || []));
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((item, index) => index !== dayIndex ? item : {
        ...item,
        exercises: item.exercises.map((exercise, exerciseIndex) => selected.has(exerciseIndex) ? {
          ...this.clearBlock(exercise),
          blockType: type,
          blockId,
          blockLabel,
          blockPosition: exerciseIndex - startIndex + 1,
          blockRest: exercise.blockRest || '90 s'
        } : affectedBlockIds.has(exercise.blockId || '') ? this.clearBlock(exercise) : exercise)
      })
    }));
    this.changed();
  }

  removeBlock(dayIndex: number, blockId: string | null): void {
    if (!blockId) return;
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day, index) => index !== dayIndex ? day : {
        ...day,
        exercises: day.exercises.map((exercise) => exercise.blockId === blockId ? this.clearBlock(exercise) : exercise)
      })
    }));
    this.changed();
  }

  addWeekConfig(exercise: RoutineDayExercise): void {
    const duration = this.draft().durationWeeks;
    if (duration == null || !Number.isInteger(duration) || duration < 1 || duration > 52) return;
    const previous = exercise.weekConfigs.at(-1);
    const startWeek = previous ? Math.min(duration, previous.endWeek + 1) : 1;
    exercise.weekConfigs.push({
      startWeek,
      endWeek: Math.min(duration, startWeek + 1),
      sets: exercise.sets,
      reps: exercise.reps,
      rest: exercise.rest,
      notes: ''
    });
    this.changed();
  }

  removeWeekConfig(exercise: RoutineDayExercise, index: number): void {
    exercise.weekConfigs.splice(index, 1);
    this.changed();
  }

  applyProgressionToAll(source: RoutineDayExercise): void {
    if (!source.weekConfigs.length) return;
    this.draft.update(plan => ({ ...plan, generalWeekConfigs: this.clone(source.weekConfigs).map(({ id: _id, ...config }) => config) }));
    this.generalProgressionChanged();
    this.notice.set('La progresión se aplicó a todos los ejercicios y también se usará en los que agregues después.');
  }

  addGeneralWeekConfig(): void {
    const duration = this.draft().durationWeeks;
    if (duration == null || !Number.isInteger(duration) || duration < 1 || duration > 52) return;
    const previous = this.generalWeekConfigs().at(-1);
    const startWeek = previous ? previous.endWeek + 1 : 1;
    if (startWeek > duration) {
      this.notice.set('Los rangos ya llegan a la última semana. Ajusta uno existente para cambiar la progresión.');
      return;
    }
    this.draft.update(plan => ({ ...plan, generalWeekConfigs: [...this.generalWeekConfigs(), {
      startWeek, endWeek: Math.min(duration, startWeek + 1), sets: 3, reps: '10-12', rest: '60 s', notes: ''
    }] }));
    this.generalProgressionChanged();
  }

  removeGeneralWeekConfig(index: number): void {
    this.draft.update(plan => ({ ...plan, generalWeekConfigs: this.generalWeekConfigs().filter((_, i) => i !== index) }));
    this.generalProgressionChanged();
  }

  generalProgressionChanged(): void {
    this.draft.update((plan) => ({
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        exercises: day.exercises.map((exercise) => ({ ...exercise, weekConfigs: this.clone(plan.generalWeekConfigs ?? []) }))
      }))
    }));
    this.changed();
  }

  private withGeneralProgression(plan: RoutinePlan): RoutinePlan {
    if (plan.generalWeekConfigs) return plan;
    const exercises = plan.days.flatMap(day => day.exercises);
    const normalized = exercises.map(exercise => exercise.weekConfigs.map(({ id: _id, ...config }) => config));
    const first = normalized[0] ?? [];
    const uniform = first.length > 0 && normalized.every(configs => JSON.stringify(configs) === JSON.stringify(first));
    return { ...plan, generalWeekConfigs: uniform ? this.clone(first) : [] };
  }

  addWarmupExercise(exerciseId: string): void {
    const exercise = this.exercises().find((item) => item.id === exerciseId);
    if (!exercise || this.draft().warmup.exercises.some((item) => item.id === exerciseId)) return;
    this.draft.update((plan) => ({
      ...plan,
      warmup: { ...plan.warmup, exercises: [...plan.warmup.exercises, exercise] }
    }));
    this.changed();
  }

  removeWarmupExercise(exerciseId: string): void {
    this.draft.update((plan) => ({
      ...plan,
      warmup: { ...plan.warmup, exercises: plan.warmup.exercises.filter((exercise) => exercise.id !== exerciseId) }
    }));
    this.changed();
  }

  next(): void {
    if (this.step() === 4) {
      const day = this.activeDay();
      if (!day || this.validateDay(day, this.draft()).length) {
        this.revealValidation();
        return;
      }
      if (this.selectedDayIndex() < this.draft().days.length - 1) {
        this.error.set('');
        this.setActiveDay(this.selectedDayIndex() + 1);
        return;
      }
    }
    if (this.validateStep(this.step()).length) {
      this.revealValidation();
      return;
    }
    this.validationAttempted.set(false);
    this.error.set('');
    this.replaceTarget.set(null);
    this.step.update((step) => Math.min(5, step + 1));
    this.persistDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  previous(): void {
    if (this.step() === 4 && this.selectedDayIndex() > 0) {
      this.setActiveDay(this.selectedDayIndex() - 1);
      return;
    }
    if (this.step() === 1) {
      void this.cancel();
      return;
    }
    this.validationAttempted.set(false);
    this.step.update((step) => Math.max(1, step - 1));
    this.persistDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  goToStep(step: number): void {
    if (step < 1 || step > 5) return;
    if (step > this.step()) {
      for (let required = 1; required < step; required++) {
        if (!this.validateStep(required).length) continue;
        this.step.set(required);
        if (required === 4) this.setActiveDay(this.firstIncompleteDayIndex());
        this.revealValidation();
        this.persistDraft();
        return;
      }
    }
    this.validationAttempted.set(false);
    this.step.set(step);
    this.persistDraft();
  }

  startEditing(): void {
    this.pdfError.set('');
    this.original.set(this.clone(this.draft()));
    this.mode.set('edit');
    this.step.set(1);
    this.validationAttempted.set(false);
    this.dirty.set(false);
    this.allowNavigation = false;
  }

  async cancel(): Promise<void> {
    if (!this.canDeactivate()) return;
    if (this.routineId && this.original()) {
      this.draft.set(this.clone(this.original()!));
      this.mode.set('view');
      this.dirty.set(false);
      return;
    }
    this.allowNavigation = true;
    const clientId = this.draft().clientId;
    await this.router.navigate(clientId ? this.clientRoute(clientId) : this.routinesRoute(), {queryParams: this.contextParams});
  }

  async save(downloadPdf = false): Promise<void> {
    const issues = this.validatePlan(this.draft());
    if (issues.length) {
      this.revealValidation();
      return;
    }
    const coachId = this.adminCoachId || this.auth.user()?.id;
    if (!coachId || this.saving() || this.exporting() || !this.canModify()) return;
    this.saving.set(true);
    this.error.set('');
    const generalDefaults = this.clone(this.generalWeekConfigs());
    try {
      const id = await this.data.saveRoutine(this.draft(), coachId, this.gymId || undefined);
      this.clearDraft();
      this.dirty.set(false);
      this.allowNavigation = true;
      // Export the persisted plan. A PDF failure must never cause another insert on retry.
      let saved: RoutinePlan | undefined;
      if (downloadPdf) {
        try {
          saved = await this.data.getRoutine(id, coachId, this.gymId || undefined);
          await this.printRoutine(saved);
        } catch {
          this.pdfError.set('La rutina quedó guardada, pero no pudimos descargar el PDF. Puedes reintentar la descarga.');
        }
      }
      if (!this.routineId) {
        if (downloadPdf && this.pdfError()) {
          await this.router.navigate(this.routineRoute(id), { queryParams: { ...this.contextParams, result: 'created', pdf: 'retry' } });
          return;
        }
        if (this.adminContext) {
          await this.router.navigate(this.clientRoute(this.draft().clientId), { queryParams: { ...this.contextParams, result: 'routine-created' } });
          return;
        }
        await this.router.navigate(this.routineRoute(id), { queryParams: { result: 'created' } });
        return;
      }
      saved ??= await this.data.getRoutine(id, coachId, this.gymId || undefined);
      this.draft.set({ ...saved, generalWeekConfigs: generalDefaults });
      this.original.set(this.clone(this.draft()));
      this.mode.set('view');
      this.notice.set('Los cambios de la rutina se guardaron correctamente.');
    } catch (error: any) {
      const message = String(error?.message || '').toLocaleLowerCase('es');
      this.error.set(message.includes('paid coach')
        ? 'Las biseries y triseries requieren un plan Pro activo. Quita ese bloque o revisa tu suscripción.'
        : 'No pudimos guardar la rutina completa. Tu borrador sigue disponible; revisa la conexión e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteRoutine(modal?: HTMLElement): Promise<void> {
    const coachId = this.adminCoachId || this.auth.user()?.id;
    if (!coachId || !this.routineId || this.saving() || !this.canModify()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.data.deleteRoutine(this.routineId, coachId, this.gymId || undefined);
      this.allowNavigation = true;
      await fadeOutModal(modal);
      await this.router.navigate(this.adminContext ? this.clientRoute(this.draft().clientId) : this.routinesRoute(), { queryParams: {...this.contextParams, result: 'routine-deleted'} });
    } catch {
      this.error.set('No pudimos eliminar la rutina. Inténtalo nuevamente.');
      this.deleteDialogOpen.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async printRoutine(plan = this.draft()): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.pdfError.set('');
    try { await this.pdf.download(plan, this.profile(), this.gymId || undefined); }
    catch { this.pdfError.set('No pudimos descargar el PDF. Inténtalo nuevamente.'); }
    finally { this.exporting.set(false); }
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T12:00:00`));
  }

  blockLabel(exercise: RoutineDayExercise): string {
    if (exercise.blockType === 'single') return '';
    return `${exercise.blockType === 'triserie' ? 'Triserie' : 'Biserie'} ${exercise.blockLabel || ''}${exercise.blockPosition || ''}`.trim();
  }

  exerciseImage(exercise: ExerciseItem | RoutineDayExercise): string {
    const globalImage = resolveGlobalExerciseImage(exercise);
    if (globalImage) {
      return this.brokenGlobalExerciseImages().has(globalImage)
        ? referenceImage(exercise.muscleGroup)
        : globalImage;
    }
    return exercise.imageUrl || referenceImage(exercise.muscleGroup);
  }

  isGlobalAnimation(exercise: ExerciseItem | RoutineDayExercise): boolean {
    return exercise.source === 'global' && isGlobalExerciseImageUrl(this.exerciseImage(exercise));
  }

  onExerciseImageError(exercise: ExerciseItem | RoutineDayExercise): void {
    const globalImage = resolveGlobalExerciseImage(exercise);
    if (globalImage && !this.brokenGlobalExerciseImages().has(globalImage)) {
      this.brokenGlobalExerciseImages.update((images) => new Set([...images, globalImage]));
    }
  }

  canDeactivate(): boolean {
    if (this.allowNavigation || !this.dirty()) return true;
    if (this.isCreate()) {
      this.persistDraft();
      return true;
    }
    return window.confirm('¿Quieres salir sin guardar los cambios de la rutina?');
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    if (this.isCreate()) {
      this.persistDraft();
      return;
    }
    event.preventDefault();
  }

  private validateStep(step: number, plan = this.draft()): string[] {
    const issues: string[] = [];
    if (step === 1) {
      if (!plan.clientId || !this.clients().some((client) => client.id === plan.clientId)) {
        issues.push('Selecciona el cliente que recibirá esta rutina.');
      }
    } else if (step === 2) {
      if (!plan.name.trim()) issues.push('Escribe el nombre de la rutina.');
      if (!plan.objective.trim()) issues.push('Escribe el objetivo de la rutina.');
      if (plan.durationWeeks == null || !Number.isInteger(plan.durationWeeks) || plan.durationWeeks < 1 || plan.durationWeeks > 52) {
        issues.push('Indica una duración entre 1 y 52 semanas.');
      }
      if (!Number.isInteger(plan.trainingDaysCount) || plan.trainingDaysCount < 1 || plan.trainingDaysCount > 7
        || plan.days.length !== plan.trainingDaysCount) {
        issues.push('Selecciona entre 1 y 7 días de entrenamiento por semana.');
      }
      const durationValid = plan.durationWeeks != null && Number.isInteger(plan.durationWeeks)
        && plan.durationWeeks >= 1 && plan.durationWeeks <= 52;
      if (!calculateRoutineEndDate(plan.startDate, 1) || (durationValid && !plan.endDate)) {
        issues.push('Selecciona una fecha de inicio válida.');
      }
    } else if (step === 3) {
      plan.days.forEach((day) => {
        if (!day.dayName.trim()) issues.push(`Escribe el nombre del día ${day.dayNumber}.`);
        if (!day.muscleGroups.length) issues.push(`Selecciona al menos un grupo muscular para el día ${day.dayNumber}.`);
      });
    } else if (step === 4) {
      return [...new Set(plan.days.flatMap((day) => this.validateDay(day, plan)))];
    } else {
      return this.validatePlan(plan);
    }
    return issues;
  }

  private validateDay(day: RoutineDay, plan: RoutinePlan): string[] {
    const issues: string[] = [];
    if ((plan.generalWeekConfigs ?? []).some(config => this.invalidWeekConfig(config, plan.durationWeeks))) {
      issues.push('Revisa los rangos de la progresión general: semanas, series, repeticiones y descanso.');
    }
    const name = day.dayName || `día ${day.dayNumber}`;
    if (!day.exercises.length) issues.push(`Agrega al menos un ejercicio al ${name}.`);
    day.exercises.forEach((exercise) => {
      if (!Number.isInteger(exercise.sets) || exercise.sets < 1 || !exercise.reps.trim() || !exercise.rest.trim()) {
        issues.push(`Completa series, repeticiones y descanso de ${exercise.exerciseName} en ${name}.`);
      }
      if (exercise.weekConfigs.some(config => this.invalidWeekConfig(config, plan.durationWeeks))) {
        issues.push(`Revisa los rangos de progresión de ${exercise.exerciseName} en ${name}.`);
      }
    });
    return issues;
  }

  private invalidWeekConfig(config: RoutineWeekConfig, duration: number | null): boolean {
    return !Number.isInteger(config.startWeek) || !Number.isInteger(config.endWeek) || !Number.isInteger(config.sets)
      || config.startWeek < 1 || config.endWeek < config.startWeek || config.endWeek > (duration ?? 0)
      || config.sets < 1 || !config.reps.trim() || !config.rest.trim();
  }

  private validatePlan(plan: RoutinePlan): string[] {
    return [1, 2, 3, 4].flatMap((step) => this.validateStep(step, plan));
  }

  private revealValidation(): void {
    this.validationAttempted.set(true);
    requestAnimationFrame(() => document.getElementById('routine-validation')?.focus());
  }

  private normalizeBlocks(exercises: RoutineDayExercise[]): RoutineDayExercise[] {
    const groups = new Map<string, RoutineDayExercise[]>();
    exercises.forEach((exercise) => {
      if (exercise.blockId) groups.set(exercise.blockId, [...(groups.get(exercise.blockId) || []), exercise]);
    });
    return exercises.map((exercise, index) => {
      const expected = exercise.blockType === 'triserie' ? 3 : exercise.blockType === 'biserie' ? 2 : 1;
      const group = exercise.blockId ? groups.get(exercise.blockId) : null;
      return { ...(group && group.length === expected ? exercise : this.clearBlock(exercise)), order: index + 1 };
    });
  }

  private clearBlock(exercise: RoutineDayExercise): RoutineDayExercise {
    return {
      ...exercise,
      blockType: 'single',
      blockId: null,
      blockLabel: null,
      blockPosition: null,
      blockRest: null
    };
  }

  private persistDraft(): void {
    if (!this.isCreate() || !this.draftKey || typeof localStorage === 'undefined') return;
    localStorage.setItem(this.draftKey, JSON.stringify({ version: 1, plan: this.draft(), selectedDayIndex: this.selectedDayIndex() }));
    localStorage.setItem(`${this.draftKey}:step`, String(this.step()));
  }

  private readDraft(key: string): { plan: RoutinePlan; selectedDayIndex: number } | null {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || 'null');
      return stored?.version === 1 && stored?.plan ? {
        plan: stored.plan as RoutinePlan,
        selectedDayIndex: Number.isInteger(stored.selectedDayIndex) && stored.selectedDayIndex >= 0 ? stored.selectedDayIndex : 0
      } : null;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  private clearDraft(): void {
    if (!this.draftKey || typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.draftKey);
    localStorage.removeItem(`${this.draftKey}:step`);
  }

  private getDraftKey(coachId: string, clientId: string): string {
    return `zummith:routine-draft:${coachId}:${this.gymId || 'independent'}:${clientId}`;
  }

  routinesRoute(): string[] {
    if (this.adminContext) return ['/admin/coaches', this.adminCoachId, 'clients'];
    return this.gymId ? ['/gym', this.gymId, 'routines'] : ['/routines'];
  }

  routineRoute(routineId: string): string[] {
    if (this.adminContext) return this.clientRoute(this.draft().clientId);
    return this.gymId ? ['/gym', this.gymId, 'routines', routineId] : ['/routines', routineId];
  }

  clientRoute(clientId: string): string[] {
    if (this.adminContext) return ['/admin/clients', this.route.snapshot.paramMap.get('coachId') || this.adminCoachId, clientId];
    return this.gymId ? ['/gym', this.gymId, 'clients', clientId] : ['/clients', clientId];
  }

  newClientRoute(): string[] {
    if (this.adminContext) return ['/admin/coaches', this.adminCoachId, 'clients'];
    return this.gymId ? ['/gym', this.gymId, 'clients', 'new'] : ['/clients/new'];
  }

  private createId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (value) =>
          (Number(value) ^ Math.floor(Math.random() * 16) >> Number(value) / 4).toString(16));
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }
}
