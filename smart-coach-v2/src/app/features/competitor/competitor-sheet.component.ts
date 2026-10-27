import { GymContextService } from '../gyms/gym-context.service';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { fadeOutModal } from '../../shared/modal-motion';
import { Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, CoachProfile } from '../../core/data/coach-data.service';
import { CompetitorDataService } from './competitor-data.service';
import {
  CompetitorClientOption,
  CompetitorExerciseBlock,
  CompetitorSheet,
  CompetitorWorkout,
  createCompetitorSheet,
  createExerciseBlock,
  createWorkout,
  workoutKey
} from './competitor.models';
import { CompetitorPdfService } from './competitor-pdf.service';
import { ContextHelpComponent, ContextHelpStep } from '../../shared/context-help/context-help.component';

@Component({
  selector: 'app-competitor-sheet',
  standalone: true,
  imports: [FormsModule, RouterLink, ContextHelpComponent, CustomSelectComponent],
  templateUrl: './competitor-sheet.component.html',
  styleUrl: './competitor-sheet.component.scss'
})
export class CompetitorSheetComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly data = inject(CompetitorDataService);
  private readonly coachData = inject(CoachDataService);
  private readonly pdf = inject(CompetitorPdfService);

  private readonly gyms = inject(GymContextService);
  readonly canModify = computed(() => this.coachData.currentProfile()?.role === 'admin' || (!this.gymId || (!!this.gyms.activeGym()?.permissions.canCreateRoutines && (!this.sheetId || this.sheet().coachId === this.auth.user()?.id))));

  readonly sheetId = this.route.snapshot.paramMap.get('id');
  readonly gymId = this.route.snapshot.paramMap.get('gymId') || '';
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly generatingPdf = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly clients = signal<CompetitorClientOption[]>([]);
  readonly profile = signal<CoachProfile | null>(null);
  readonly sheet = signal<CompetitorSheet>(createCompetitorSheet());
  workoutSelectOptions(): { value: string; label: string }[] {
    return this.sheet().workouts.map((workout) => ({ value: workout.key, label: `${workout.key} - ${workout.title}` }));
  }
  readonly step = signal(1);
  readonly validationAttempted = signal(false);
  readonly validationIssues = computed(() => this.validationAttempted() ? this.validateStep(this.step()) : []);
  readonly dirty = signal(false);
  readonly draftRestored = signal(false);
  readonly openBlocks = signal<Record<string, number>>({});
  readonly deleteDialogOpen = signal(false);
  private allowNavigation = false;
  private draftKey = '';
  readonly helpSteps: ContextHelpStep[] = [
    { title: 'Configura la preparación', description: 'Selecciona el atleta, define mesociclo y macrociclo, y organiza la distribución de entrenamientos por semana.' },
    { title: 'Diseña cada entreno', description: 'Cada etapa del asistente corresponde a un entrenamiento. Agrega bloques y prescribe los tres microciclos.' },
    { title: 'Revisa el documento', description: 'Comprueba el contenido completo antes de guardar. Puedes generar el PDF desde la revisión final.' },
    { title: 'Borrador automático', description: 'Los cambios se guardan localmente durante la edición para que puedas retomar el trabajo sin perderlo.' }
  ];

  readonly isCreate = computed(() => !this.sheetId);
  readonly totalSteps = computed(() => this.sheet().workouts.length + 2);
  readonly isReview = computed(() => this.step() === this.totalSteps());
  readonly currentWorkoutIndex = computed(() => {
    const index = this.step() - 2;
    return index >= 0 && index < this.sheet().workouts.length ? index : -1;
  });
  readonly currentWorkout = computed(() => {
    const index = this.currentWorkoutIndex();
    return index >= 0 ? this.sheet().workouts[index] : null;
  });
  readonly stepLabels = computed(() => [
    'Plan',
    ...this.sheet().workouts.map((workout) => `Entreno ${workout.key}`),
    'Revisión'
  ]);
  readonly totalBlocks = computed(() => this.sheet().workouts.reduce((total, workout) => total + workout.blocks.length, 0));

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    await this.auth.waitUntilReady();
    const coachId = this.auth.user()?.id;
    if (!coachId) {
      this.error.set('No pudimos identificar la sesión activa. Inicia sesión nuevamente.');
      this.loading.set(false);
      return;
    }

    try {
      const [clients, profile] = await Promise.all([
        this.data.getClients(coachId, this.gymId || undefined),
        this.coachData.getProfile(coachId)
      ]);
      this.clients.set(clients);
      this.profile.set(profile);

      if (this.sheetId) {
        const sheet = await this.data.getSheet(this.sheetId, coachId, this.gymId || undefined);
        this.sheet.set(sheet);
        this.notice.set(this.route.snapshot.queryParamMap.get('result') === 'created' ? 'La hoja de competidor quedó guardada.' : '');
      } else {
        this.prepareNewDraft(coachId, clients);
      }
      this.initializeOpenBlocks();
    } catch {
      this.error.set(this.sheetId
        ? 'No pudimos cargar la hoja. Comprueba que aún tengas acceso e inténtalo nuevamente.'
        : 'No pudimos preparar el editor. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  selectClient(clientId: string): void {
    const client = this.clients().find((option) => option.id === clientId);
    this.sheet.update((sheet) => ({ ...sheet, clientId, clientName: client?.name || '' }));
    const coachId = this.auth.user()?.id;
    if (coachId) this.draftKey = this.getDraftKey(coachId, clientId || 'unassigned');
    this.changed();
  }

  changed(): void {
    this.sheet.update((sheet) => ({ ...sheet }));
    this.allowNavigation = false;
    this.dirty.set(true);
    this.persistDraft();
  }

  next(): void {
    const issues = this.validateStep(this.step());
    if (issues.length) {
      this.revealValidation();
      return;
    }
    this.validationAttempted.set(false);
    this.error.set('');
    this.step.update((step) => Math.min(this.totalSteps(), step + 1));
    this.persistDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.scrollActiveStep();
  }

  previous(): void {
    if (this.step() === 1) {
      void this.cancel();
      return;
    }
    this.validationAttempted.set(false);
    this.step.update((step) => Math.max(1, step - 1));
    this.persistDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.scrollActiveStep();
  }

  goToStep(target: number): void {
    if (target < 1 || target > this.totalSteps()) return;
    if (target === this.step() + 1) {
      this.next();
      return;
    }
    if (target <= this.step()) {
      this.step.set(target);
      this.validationAttempted.set(false);
      this.error.set('');
      this.persistDraft();
      this.scrollActiveStep();
    }
  }

  addWorkout(): void {
    this.sheet.update((sheet) => ({ ...sheet, workouts: [...sheet.workouts, createWorkout(sheet.workouts.length)] }));
    this.renumberWorkouts();
    const workout = this.sheet().workouts.at(-1)!;
    this.openBlocks.update((blocks) => ({ ...blocks, [workout.key]: 0 }));
    this.changed();
  }

  removeWorkout(index: number): void {
    if (this.sheet().workouts.length <= 1) return;
    const removedKey = this.sheet().workouts[index]?.key;
    this.sheet.update((sheet) => ({ ...sheet, workouts: sheet.workouts.filter((_workout, itemIndex) => itemIndex !== index) }));
    this.sheet.update((sheet) => ({
      ...sheet,
      weekPlans: sheet.weekPlans.map((week) => ({
        ...week,
        workouts: week.workouts.map((key) => key === removedKey ? '' : key)
      }))
    }));
    this.renumberWorkouts();
    this.step.set(Math.min(this.step(), this.totalSteps()));
    this.initializeOpenBlocks();
    this.changed();
  }

  moveWorkout(index: number, direction: -1 | 1): void {
    const target = index + direction;
    const workouts = [...this.sheet().workouts];
    if (target < 0 || target >= workouts.length) return;
    [workouts[index], workouts[target]] = [workouts[target], workouts[index]];
    this.sheet.update((sheet) => ({ ...sheet, workouts }));
    this.renumberWorkouts();
    this.initializeOpenBlocks();
    this.changed();
  }

  addDay(): void {
    if (this.sheet().dayLabels.length >= 7) return;
    const number = this.sheet().dayLabels.length + 1;
    this.sheet.update((sheet) => ({
      ...sheet,
      dayLabels: [...sheet.dayLabels, `Día ${number}`],
      weekPlans: sheet.weekPlans.map((week) => ({ ...week, workouts: [...week.workouts, ''] }))
    }));
    this.changed();
  }

  removeDay(index: number): void {
    if (this.sheet().dayLabels.length <= 1) return;
    this.sheet.update((sheet) => ({
      ...sheet,
      dayLabels: sheet.dayLabels.filter((_day, dayIndex) => dayIndex !== index),
      weekPlans: sheet.weekPlans.map((week) => ({
        ...week,
        workouts: week.workouts.filter((_workout, dayIndex) => dayIndex !== index)
      }))
    }));
    this.changed();
  }

  addWeek(): void {
    this.sheet.update((sheet) => ({
      ...sheet,
      weekPlans: [...sheet.weekPlans, {
        weekLabel: `Semana ${sheet.weekPlans.length + 1}`,
        workouts: Array.from({ length: sheet.dayLabels.length }, () => '')
      }]
    }));
    this.changed();
  }

  removeWeek(index: number): void {
    this.sheet.update((sheet) => ({ ...sheet, weekPlans: sheet.weekPlans.filter((_week, weekIndex) => weekIndex !== index) }));
    this.changed();
  }

  addBlock(workout: CompetitorWorkout): void {
    workout.blocks.push(createExerciseBlock());
    this.openBlocks.update((blocks) => ({ ...blocks, [workout.key]: workout.blocks.length - 1 }));
    this.changed();
  }

  removeBlock(workout: CompetitorWorkout, index: number): void {
    if (workout.blocks.length <= 1) return;
    workout.blocks.splice(index, 1);
    this.openBlocks.update((blocks) => ({ ...blocks, [workout.key]: Math.min(index, workout.blocks.length - 1) }));
    this.changed();
  }

  moveBlock(workout: CompetitorWorkout, index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= workout.blocks.length) return;
    [workout.blocks[index], workout.blocks[target]] = [workout.blocks[target], workout.blocks[index]];
    this.openBlocks.update((blocks) => ({ ...blocks, [workout.key]: target }));
    this.changed();
  }

  toggleBlock(workoutKeyValue: string, index: number): void {
    this.openBlocks.update((blocks) => ({ ...blocks, [workoutKeyValue]: blocks[workoutKeyValue] === index ? -1 : index }));
  }

  async save(downloadPdf = false): Promise<void> {
    const issues = this.validateSheet();
    if (issues.length) {
      this.revealValidation();
      return;
    }
    const coachId = this.auth.user()?.id;
    if (!coachId || this.saving() || !this.canModify()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const id = await this.data.saveSheet(this.sheet(), coachId, this.gymId || undefined);
      this.sheet.update((sheet) => ({ ...sheet, id }));
      this.clearDraft();
      this.dirty.set(false);
      this.allowNavigation = true;
      if (downloadPdf && !await this.downloadPdf()) {
        this.notice.set('La hoja quedó guardada. Puedes reintentar la descarga del PDF.');
        return;
      }
      if (!this.sheetId) {
        await this.router.navigate(this.sheetRoute(id), { queryParams: { result: 'created' } });
        return;
      }
      this.notice.set(downloadPdf ? 'La hoja se guardó y el PDF se descargó.' : 'Los cambios de la hoja se guardaron correctamente.');
    } catch {
      this.error.set('No pudimos guardar la hoja completa. Tu borrador sigue disponible; revisa la conexión e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async downloadPdf(): Promise<boolean> {
    if (this.generatingPdf()) return false;
    const issues = this.validateSheet();
    if (issues.length) {
      this.revealValidation();
      return false;
    }
    this.generatingPdf.set(true);
    this.error.set('');
    try {
      await this.pdf.download(this.sheet(), this.profile());
      this.notice.set('El PDF de competidor se descargó correctamente.');
      return true;
    } catch {
      this.error.set('No pudimos generar el PDF. Revisa el contenido e inténtalo nuevamente.');
      return false;
    } finally {
      this.generatingPdf.set(false);
    }
  }

  resetTemplate(): void {
    if (!window.confirm('¿Quieres restaurar la plantilla? Se reemplazarán los cambios actuales.')) return;
    const current = this.sheet();
    this.sheet.set(createCompetitorSheet(current.clientId, current.clientName));
    this.step.set(1);
    this.validationAttempted.set(false);
    this.initializeOpenBlocks();
    this.changed();
  }

  async deleteSheet(modal?: HTMLElement): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId || !this.sheetId || this.saving() || !this.canModify()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.data.deleteSheet(this.sheetId, coachId, this.gymId || undefined);
      this.allowNavigation = true;
      await fadeOutModal(modal);
      await this.router.navigate(this.clientRoute(this.sheet().clientId), { queryParams: { result: 'competitor-deleted' } });
    } catch {
      this.error.set('No pudimos eliminar la hoja. Inténtalo nuevamente.');
      this.deleteDialogOpen.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async cancel(): Promise<void> {
    if (this.dirty() && !window.confirm('¿Quieres salir? El borrador quedará guardado en este navegador.')) return;
    this.allowNavigation = true;
    await this.router.navigate(this.sheet().clientId ? this.clientRoute(this.sheet().clientId) : this.clientsRoute());
  }

  canDeactivate(): boolean {
    return this.allowNavigation || !this.dirty()
      || window.confirm('¿Quieres salir? El borrador quedará guardado en este navegador.');
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.dirty()) return;
    event.preventDefault();
  }

  private prepareNewDraft(coachId: string, clients: CompetitorClientOption[]): void {
    const queryClientId = this.route.snapshot.queryParamMap.get('clientId') || '';
    const client = clients.find((option) => option.id === queryClientId);
    this.draftKey = this.getDraftKey(coachId, queryClientId || 'unassigned');
    const stored = this.readDraft();
    if (stored && (!queryClientId || stored.clientId === queryClientId)) {
      this.sheet.set(stored);
      this.step.set(Math.min(stored.workouts.length + 2, Math.max(1, Number(localStorage.getItem(`${this.draftKey}:step`)) || 1)));
      this.draftRestored.set(true);
      this.dirty.set(true);
      return;
    }
    this.sheet.set(createCompetitorSheet(client?.id || '', client?.name || ''));
  }

  private validateStep(step: number): string[] {
    const sheet = this.sheet();
    if (step === 1) {
      const issues: string[] = [];
      if (!sheet.clientId) issues.push('Selecciona el atleta que recibirá esta hoja.');
      if (!sheet.mesocycleTitle.trim()) issues.push('Escribe el mesociclo.');
      if (!sheet.macrocycleTitle.trim()) issues.push('Escribe el macrociclo.');
      if (!sheet.frequencyText.trim()) issues.push('Indica la frecuencia de entrenamiento.');
      if (!sheet.splitText.trim()) issues.push('Escribe la división muscular.');
      if (!sheet.trainingDaysText.trim()) issues.push('Indica los días de entrenamiento.');
      if (!sheet.dayLabels.length || sheet.dayLabels.some((day) => !day.trim())) issues.push('Asigna un nombre a cada día de la distribución.');
      if (!sheet.workouts.length) issues.push('Agrega al menos un entrenamiento.');
      if (sheet.weekPlans.some((week) => !week.weekLabel.trim())) issues.push('Asigna un nombre a cada semana.');
      return issues;
    }
    const workoutIndex = step - 2;
    if (workoutIndex >= 0 && workoutIndex < sheet.workouts.length) return this.validateWorkout(sheet.workouts[workoutIndex]);
    return this.validateSheet();
  }

  private validateWorkout(workout: CompetitorWorkout): string[] {
    const issues: string[] = [];
    if (!workout.title.trim()) issues.push(`Escribe el título del entrenamiento ${workout.key}.`);
    if (!workout.code.trim()) issues.push(`Escribe el código del entrenamiento ${workout.key}.`);
    if (!workout.blocks.length) issues.push(`Agrega al menos un bloque al entrenamiento ${workout.key}.`);
    for (const block of workout.blocks) {
      if (!block.name.trim()) issues.push(`Asigna un ejercicio a cada bloque del entrenamiento ${workout.key}.`);
      if (block.microcycles.some((microcycle) => !microcycle.series.trim() || !microcycle.reps.trim())
        || block.rest.some((rest) => !rest.trim())) {
        issues.push(`Completa series, repeticiones y descansos de ${block.name || `un bloque del entrenamiento ${workout.key}`}.`);
      }
    }
    return issues;
  }

  private validateSheet(): string[] {
    const general = this.validateStep(1);
    const issues = [...general];
    for (const workout of this.sheet().workouts) {
      issues.push(...this.validateWorkout(workout));
    }
    return issues;
  }

  private revealValidation(): void {
    this.validationAttempted.set(true);
    requestAnimationFrame(() => document.getElementById('competitor-validation')?.focus());
  }

  private renumberWorkouts(): void {
    const keyMap = new Map<string, string>();
    this.sheet().workouts.forEach((workout, index) => keyMap.set(workout.key, workoutKey(index)));
    this.sheet().workouts.forEach((workout, index) => {
      const previousKey = workout.key;
      const nextKey = workoutKey(index);
      workout.key = nextKey;
      if (workout.title === `Entrenamiento ${previousKey}`) workout.title = `Entrenamiento ${nextKey}`;
      if (workout.code === `COMP-${previousKey}`) workout.code = `COMP-${nextKey}`;
    });
    this.sheet.update((sheet) => ({
      ...sheet,
      workouts: [...sheet.workouts],
      weekPlans: sheet.weekPlans.map((week) => ({
        ...week,
        workouts: week.workouts.map((key) => keyMap.get(key) || '')
      }))
    }));
  }

  private initializeOpenBlocks(): void {
    this.openBlocks.set(Object.fromEntries(this.sheet().workouts.map((workout) => [workout.key, 0])));
  }

  private persistDraft(): void {
    if (!this.isCreate() || !this.draftKey || typeof localStorage === 'undefined') return;
    localStorage.setItem(this.draftKey, JSON.stringify({ version: 1, sheet: this.sheet() }));
    localStorage.setItem(`${this.draftKey}:step`, String(this.step()));
  }

  private readDraft(): CompetitorSheet | null {
    try {
      const stored = JSON.parse(localStorage.getItem(this.draftKey) || 'null');
      return stored?.version === 1 && stored?.sheet ? stored.sheet as CompetitorSheet : null;
    } catch {
      localStorage.removeItem(this.draftKey);
      return null;
    }
  }

  private clearDraft(): void {
    if (!this.draftKey || typeof localStorage === 'undefined') return;
    localStorage.removeItem(this.draftKey);
    localStorage.removeItem(`${this.draftKey}:step`);
  }

  private getDraftKey(coachId: string, clientId: string): string {
    return `zummith:competitor-draft:${coachId}:${this.gymId || 'independent'}:${clientId}`;
  }

  clientsRoute(): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients'] : ['/clients'];
  }

  clientRoute(clientId: string): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients', clientId] : ['/clients', clientId];
  }

  newClientRoute(): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients', 'new'] : ['/clients/new'];
  }

  sheetRoute(sheetId: string): string[] {
    return this.gymId ? ['/gym', this.gymId, 'competitor', sheetId, 'edit'] : ['/competitor', sheetId, 'edit'];
  }

  private scrollActiveStep(): void {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.sheet-progress button.active')
      ?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' }));
  }
}
