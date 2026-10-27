import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  ClientPortalContext,
  ClientPortalDataService,
  ClientPortalDay,
  ClientPortalExercise,
  ClientPortalRoutineDetail,
  ClientPortalTrainingDayState,
  ClientPortalTrainingSet
} from './client-portal-data.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';
import { ClientPortalPdfService } from './client-portal-pdf.service';
import { getGlobalExerciseImage, isGlobalExerciseImageUrl } from '../../shared/global-exercise-media';

const trainingSaveError = 'No pudimos guardar esta serie. Tus valores se conservan; vuelve a intentarlo.';

@Component({
  selector: 'app-client-routine-detail',
  standalone: true,
  imports: [RouterLink, ClientPortalHeaderComponent, AppFooterComponent],
  templateUrl: './client-routine-detail.component.html',
  styleUrl: './client-routine-detail.component.scss'
})
export class ClientRoutineDetailComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly portal = inject(ClientPortalDataService);
  private readonly pdf = inject(ClientPortalPdfService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private sequence = 0;

  readonly loading = signal(true);
  readonly error = signal('');
  readonly notFound = signal(false);
  readonly context = signal<ClientPortalContext | null>(null);
  readonly routine = signal<ClientPortalRoutineDetail | null>(null);
  readonly activeDayId = signal<string | null>(null);
  readonly activeDay = computed(() => this.routine()?.days.find(day => day.id === this.activeDayId()) ?? this.routine()?.days[0] ?? null);
  readonly sessionByDay = signal<Record<string, ClientPortalTrainingDayState>>({});
  readonly setEntries = signal<Record<string, ClientPortalTrainingSet>>({});
  readonly savingEntries = signal<Record<string, boolean>>({});
  readonly failedEntries = signal<Record<string, boolean>>({});
  readonly expandedTrackers = signal<Record<string, boolean>>({});
  readonly editingCompletedDays = signal<Record<string, boolean>>({});
  readonly trackingError = signal('');
  readonly trackingNotice = signal('');
  readonly completingDayId = signal<string | null>(null);
  readonly downloadingPdf = signal(false);
  readonly pdfError = signal('');
  readonly expandedMovements = signal<Record<string, boolean>>({});
  readonly movementErrors = signal<Record<string, boolean>>({});

  private readonly saveQueues = new Map<string, Promise<void>>();

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      void this.load(params.get('id'));
    });
  }

  async load(routineId = this.route.snapshot.paramMap.get('id')): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId || !routineId) return;
    const sequence = ++this.sequence;
    this.loading.set(true);
    this.error.set('');
    this.notFound.set(false);
    this.routine.set(null);
    this.expandedMovements.set({});
    this.movementErrors.set({});
    try {
      const context = this.portal.initialContext(userId, await this.portal.listContexts(userId));
      if (sequence !== this.sequence) return;
      if (!context) {
        this.error.set('No encontramos un perfil de cliente activo para esta cuenta.');
        return;
      }
      this.context.set(context);
      const detail = await this.portal.getRoutineDetail(context, routineId);
      if (sequence !== this.sequence) return;
      if (!detail) {
        this.notFound.set(true);
        return;
      }
      this.routine.set(detail);
      this.activeDayId.set(detail.days[0]?.id ?? null);
      this.initializeTrackers(detail.days);
      await this.loadTrackingState(detail);
    } catch {
      if (sequence === this.sequence) this.error.set('No pudimos cargar esta rutina. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (sequence === this.sequence) this.loading.set(false);
    }
  }

  selectDay(id: string): void {
    this.expandedMovements.set({});
    this.activeDayId.set(id);
    this.trackingError.set(this.hasFailedSaves(id) ? trainingSaveError : '');
    this.trackingNotice.set('');
  }

  async downloadRoutinePdf(): Promise<void> {
    const routine = this.routine();
    const context = this.context();
    if (!routine || !context || this.downloadingPdf()) return;
    this.downloadingPdf.set(true);
    this.pdfError.set('');
    try {
      const pdfContext = await this.portal.getRoutinePdfContext(context);
      await this.pdf.downloadRoutine(routine, pdfContext);
    } catch {
      this.pdfError.set('No pudimos generar el PDF de la rutina. Inténtalo nuevamente.');
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  setNumbers(count: number): number[] {
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  movementImage(exercise: ClientPortalExercise): string | null {
    if (exercise.source != null && exercise.source !== 'global') return null;
    const catalogImage = exercise.imageUrl?.trim();
    if (exercise.source === 'global' && isGlobalExerciseImageUrl(catalogImage)) return catalogImage!;
    return getGlobalExerciseImage(exercise.exerciseId, exercise.source);
  }

  setMovementOpen(assignmentId: string, open: boolean): void {
    this.expandedMovements.update(current => ({ ...current, [assignmentId]: open }));
  }

  onMovementError(assignmentId: string): void {
    this.movementErrors.update(current => ({ ...current, [assignmentId]: true }));
  }

  retryMovement(assignmentId: string): void {
    this.movementErrors.update(current => ({ ...current, [assignmentId]: false }));
  }

  toggleTracker(day: ClientPortalDay, exercise: ClientPortalExercise): void {
    const key = this.trackerKey(day.id, exercise.order);
    const wasOpen = !!this.expandedTrackers()[key];
    const next = { ...this.expandedTrackers() };
    for (const currentKey of Object.keys(next)) {
      if (currentKey.startsWith(`${day.id}:`)) next[currentKey] = false;
    }
    next[key] = !wasOpen;
    this.expandedTrackers.set(next);
  }

  isTrackerExpanded(day: ClientPortalDay, exercise: ClientPortalExercise): boolean {
    return !!this.expandedTrackers()[this.trackerKey(day.id, exercise.order)];
  }

  getSetEntry(day: ClientPortalDay, exercise: ClientPortalExercise, setNumber: number): ClientPortalTrainingSet | null {
    return this.setEntries()[this.entryKey(day.id, exercise.order, setNumber)] || null;
  }

  hasTrackedValues(day: ClientPortalDay, exercise: ClientPortalExercise, setNumber: number): boolean {
    const entry = this.getSetEntry(day, exercise, setNumber);
    return !!entry && (entry.actualReps != null || entry.rir != null || entry.load != null);
  }

  completedSetCount(day: ClientPortalDay, exercise?: ClientPortalExercise): number {
    const exercises = exercise ? [exercise] : day.exercises;
    return exercises.reduce((total, item) => total + this.setNumbers(item.sets)
      .filter(setNumber => this.hasTrackedValues(day, item, setNumber)).length, 0);
  }

  totalSetCount(day: ClientPortalDay): number {
    return day.exercises.reduce((total, exercise) => total + exercise.sets, 0);
  }

  dayIsReadOnly(_dayId: string): boolean { return false; }

  isSaving(day: ClientPortalDay, exercise: ClientPortalExercise, setNumber: number): boolean {
    return !!this.savingEntries()[this.entryKey(day.id, exercise.order, setNumber)];
  }

  hasPendingSaves(dayId: string): boolean {
    return Object.entries(this.savingEntries()).some(([key, saving]) => saving && key.startsWith(`${dayId}:`));
  }

  hasFailedSave(day: ClientPortalDay, exercise: ClientPortalExercise, setNumber: number): boolean {
    return !!this.failedEntries()[this.entryKey(day.id, exercise.order, setNumber)];
  }

  hasFailedSaves(dayId: string): boolean {
    return Object.entries(this.failedEntries()).some(([key, failed]) => failed && key.startsWith(`${dayId}:`));
  }

  retryFailedSets(day: ClientPortalDay): void {
    if (this.hasPendingSaves(day.id)) return;
    for (const exercise of day.exercises) {
      for (const setNumber of this.setNumbers(exercise.sets)) {
        const entry = this.getSetEntry(day, exercise, setNumber);
        if (entry && this.hasFailedSave(day, exercise, setNumber)) this.queueSetSave(day, exercise, setNumber, entry);
      }
    }
  }

  updateSetValue(
    day: ClientPortalDay,
    exercise: ClientPortalExercise,
    setNumber: number,
    field: 'actualReps' | 'rir' | 'load',
    rawValue: string
  ): void {
    const parsed = this.parseTrainingValue(field, rawValue);
    if (parsed === undefined) return;
    const key = this.entryKey(day.id, exercise.order, setNumber);
    const previous = this.getSetEntry(day, exercise, setNumber);
    const optimistic: ClientPortalTrainingSet = {
      id: previous?.id ?? null,
      sessionId: previous?.sessionId || this.sessionByDay()[day.id]?.sessionId || '',
      exerciseOrder: exercise.order,
      setNumber,
      actualReps: previous?.actualReps ?? null,
      rir: previous?.rir ?? null,
      load: previous?.load ?? null,
      loadUnit: previous?.loadUnit || 'kg',
      [field]: parsed
    };
    this.setEntries.update(current => ({ ...current, [key]: optimistic }));
    this.queueSetSave(day, exercise, setNumber, optimistic);
  }

  private queueSetSave(day: ClientPortalDay, exercise: ClientPortalExercise, setNumber: number, optimistic: ClientPortalTrainingSet): void {
    const key = this.entryKey(day.id, exercise.order, setNumber);
    this.savingEntries.update(current => ({ ...current, [key]: true }));
    this.failedEntries.update(current => ({ ...current, [key]: false }));
    this.trackingError.set('');
    this.trackingNotice.set('');

    const priorQueue = this.saveQueues.get(key) ?? Promise.resolve();
    const queued = priorQueue.catch(() => undefined).then(async () => {
      const current = this.setEntries()[key] || optimistic;
      try {
        const saved = await this.portal.saveTrainingSet(
          this.context()!,
          this.routine()!.id,
          day.id,
          exercise.id,
          exercise.order,
          setNumber,
          { actualReps: current.actualReps, rir: current.rir, load: current.load }
        );
        if (saved.sessionId) {
          this.sessionByDay.update(sessions => ({
            ...sessions,
            [day.id]: { sessionId: saved.sessionId!, status: 'in_progress', sets: [] }
          }));
          this.editingCompletedDays.update(value => ({ ...value, [day.id]: true }));
        } else {
          this.sessionByDay.update(sessions => {
            const next = { ...sessions };
            delete next[day.id];
            return next;
          });
        }
        this.setEntries.update(entries => {
          const next = { ...entries };
          if (!saved.set) delete next[key];
          else next[key] = {
            ...saved.set,
            ...next[key],
            id: saved.set.id,
            sessionId: saved.set.sessionId,
            loadUnit: saved.set.loadUnit
          };
          return next;
        });
        this.failedEntries.update(current => ({ ...current, [key]: false }));
        if (!this.hasFailedSaves(this.activeDay()?.id ?? day.id)) this.trackingError.set('');
      } catch {
        this.failedEntries.update(current => ({ ...current, [key]: true }));
        this.trackingError.set(trainingSaveError);
      }
    });
    this.saveQueues.set(key, queued);
    void queued.finally(() => {
      if (this.saveQueues.get(key) !== queued) return;
      this.saveQueues.delete(key);
      this.savingEntries.update(current => ({ ...current, [key]: false }));
    });
  }

  videoLink(value: string | null): string | null {
    if (!value?.trim()) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
    } catch {
      return null;
    }
  }

  blockLabel(type: string, label: string | null, position: number | null): string | null {
    if (type === 'single') return null;
    const group = type === 'triserie' ? 'Triserie' : 'Biserie';
    return `${group}${label ? ` ${label}` : ''}${position ? position : ''}`;
  }

  weekRange(start: number, end: number): string {
    return start === end ? `Semana ${start}` : `Semanas ${start}–${end}`;
  }

  private initializeTrackers(days: ClientPortalDay[]): void {
    const trackers: Record<string, boolean> = {};
    for (const day of days) {
      for (const exercise of day.exercises) trackers[this.trackerKey(day.id, exercise.order)] = false;
    }
    this.expandedTrackers.set(trackers);
  }

  private async loadTrackingState(detail: ClientPortalRoutineDetail): Promise<void> {
    try {
      const states = await Promise.all(detail.days.map(async day => ({
        day,
        state: await this.portal.getTrainingDayState(this.context()!, detail.id, day.id)
      })));
      const sessions: Record<string, ClientPortalTrainingDayState> = {};
      const entries: Record<string, ClientPortalTrainingSet> = {};
      for (const { day, state } of states) {
        if (!state) continue;
        sessions[day.id] = state;
        for (const set of state.sets) entries[this.entryKey(day.id, set.exerciseOrder, set.setNumber)] = set;
      }
      this.sessionByDay.set(sessions);
      this.setEntries.set(entries);
    } catch {
      this.trackingError.set('La rutina está disponible, pero no pudimos cargar el registro de hoy. Puedes reintentarlo.');
    }
  }

  private parseTrainingValue(field: 'actualReps' | 'rir' | 'load', rawValue: string): number | null | undefined {
    if (rawValue.trim() === '') return null;
    const value = Number(rawValue);
    const valid = Number.isFinite(value) && value >= 0
      && (field === 'load' ? value <= 999999.99 : Number.isInteger(value))
      && (field === 'rir' ? value <= 10 : true)
      && (field === 'actualReps' ? value <= 999 : true);
    if (!valid) {
      this.trackingError.set(field === 'rir'
        ? 'El RIR debe ser un número entero entre 0 y 10.'
        : field === 'actualReps'
          ? 'Las repeticiones deben ser un número entero entre 0 y 999.'
          : 'La carga debe ser un número positivo válido.');
      return undefined;
    }
    return value;
  }

  private entryKey(dayId: string, exerciseOrder: number, setNumber: number): string {
    return `${dayId}:${exerciseOrder}:${setNumber}`;
  }

  private trackerKey(dayId: string, exerciseOrder: number): string {
    return `${dayId}:${exerciseOrder}`;
  }
}
