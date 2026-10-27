import { ListPaginationComponent } from '../../../shared/list-pagination.component';
import { createListPagination } from '../../../shared/list-pagination';
import { ZUMMITH_CONTACT } from '../../../core/config/contact';

import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import {
  ClientMeasurement,
  ClientRecord,
  ClientRoutine,
  CoachDataService,
  CoachProfile,
  CompetitorSheetRecord,
  TrainingSetRecord,
  TrainingSessionRecord
} from '../../../core/data/coach-data.service';
import { hasActiveIndependentPro } from '../../../core/data/plan-access';
import { ClientFormComponent } from '../client-form/client-form.component';
import { ContextHelpComponent, ContextHelpStep } from '../../../shared/context-help/context-help.component';
import { GymContextService } from '../../gyms/gym-context.service';
import { localMeasurementDate, MEASUREMENT_CIRCUMFERENCES, MEASUREMENT_FIELDS, MEASUREMENT_INDICATORS, MeasurementFieldKey } from '../../../shared/measurement-fields';
import { SiteChartComponent } from '../../../shared/charts/site-chart.component';
import { measurementChartPoints, MeasurementMetric } from '../../../shared/charts/measurement-chart';

type ClientTab = 'profile' | 'routines' | 'measurements' | 'competitor' | 'rir';
type ProfileView = 'summary' | 'edit';
type EditorKind = 'measurement';
type DeleteTarget = { kind: 'client' | 'routine' | 'competitor' | EditorKind; id: string; label: string };
type PortalAccessStatus = 'standard' | 'active' | 'pending' | 'unsupported';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [ListPaginationComponent, ReactiveFormsModule, RouterLink, ClientFormComponent, ContextHelpComponent, SiteChartComponent],
  templateUrl: './client-detail.component.html',
  styleUrl: './client-detail.component.scss'
})
export class ClientDetailComponent implements OnDestroy {
  readonly contact = ZUMMITH_CONTACT;
  readonly routinePagination = createListPagination(() => this.routines(), () => this.client()?.id);
  readonly measurementPagination = createListPagination(() => this.measurements(), () => this.client()?.id);
  readonly competitorPagination = createListPagination(() => this.competitorSheets(), () => this.client()?.id);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly data = inject(CoachDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gyms = inject(GymContextService);

  clientId = '';
  readonly gymId = this.route.snapshot.paramMap.get('gymId') || '';
  readonly gymContext = this.gyms.activeGym;
  readonly canEditClient = computed(() => !this.gymId || !!this.gymContext()?.permissions.canEditClients);
  readonly canCreateRoutines = computed(() => !this.gymId || !!this.gymContext()?.permissions.canCreateRoutines);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly inviting = signal(false);
  readonly rirRefreshing = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly warning = signal('');
  readonly measurementSaveError = signal('');
  readonly rirError = signal('');
  readonly client = signal<ClientRecord | null>(null);
  readonly profile = signal<CoachProfile | null>(null);
  readonly routines = signal<ClientRoutine[]>([]);
  readonly measurements = signal<ClientMeasurement[]>([]);
  readonly competitorSheets = signal<CompetitorSheetRecord[]>([]);
  readonly trainingHistory = signal<TrainingSessionRecord[]>([]);
  readonly rirPageSizeOptions = [5, 10, 20];
  readonly rirPageSize = signal(5);
  private readonly requestedRirPage = signal(1);
  readonly rirTotalPages = computed(() => Math.max(1, Math.ceil(this.trainingHistory().length / this.rirPageSize())));
  readonly rirPage = computed(() => Math.min(this.requestedRirPage(), this.rirTotalPages()));
  readonly visibleRirSessions = computed(() => {
    const start = (this.rirPage() - 1) * this.rirPageSize();
    return this.trainingHistory().slice(start, start + this.rirPageSize());
  });
  readonly rirVisibleRange = computed(() => {
    if (!this.trainingHistory().length) return '0';
    const start = (this.rirPage() - 1) * this.rirPageSize() + 1;
    return `${start}–${start + this.visibleRirSessions().length - 1}`;
  });
  readonly activeTab = signal<ClientTab>('routines');
  readonly profileView = signal<ProfileView>('summary');
  readonly editor = signal<EditorKind | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly deleteTarget = signal<DeleteTarget | null>(null);
  readonly showProDialog = signal(false);
  readonly expandedRirSessions = signal<Record<string, boolean>>({});
  readonly selectedMeasurementMetric = signal<MeasurementMetric>('weight');
  private historyRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private loadSequence = 0;
  private requestedTab: ClientTab | null = null;
  readonly clientHelpSteps: ContextHelpStep[] = [
    { title: 'Perfil', description: 'Consulta datos personales, métricas iniciales, objetivo y notas. En Editar, Guardar cambios solo se activa cuando modificas algo.' },
    { title: 'Rutinas', description: 'Abre los planes del cliente o crea uno nuevo ya vinculado a esta ficha.' },
    { title: 'Mediciones', description: 'Registra controles corporales y compara peso, grasa corporal o masa muscular en la gráfica de evolución.' },
    { title: 'Competidor y RIR', description: 'Prepara hojas específicas de competición. Con Pro activo también puedes enviar acceso y revisar las series RIR del portal.' }
  ];

  readonly portalAccessStatus = computed<PortalAccessStatus>(() => {
    if (this.gymId) return 'active';
    const profile = this.profile();
    if (!profile) return 'standard';
    if (profile.accountType !== 'independent') return 'unsupported';
    if (profile.coachPlan !== 'paid') return 'standard';
    return hasActiveIndependentPro(profile) ? 'active' : 'pending';
  });
  readonly hasProAccess = computed(() => this.portalAccessStatus() === 'active');
  readonly latestMeasurement = computed(() => this.measurements()[0] || null);
  readonly chartPoints = computed(() => measurementChartPoints(this.measurements(), this.selectedMeasurementMetric(), 8));

  readonly measurementIndicators = MEASUREMENT_INDICATORS;
  readonly measurementCircumferences = MEASUREMENT_CIRCUMFERENCES;
  readonly measurementForm = this.fb.group({
    date: this.fb.nonNullable.control(localMeasurementDate(), Validators.required),
    weight: this.fb.control<number | null>(null, [Validators.required, Validators.min(20), Validators.max(300)]),
    height: this.fb.control<number | null>(null, [Validators.required, Validators.min(100), Validators.max(250)]),
    bodyFatPercentage: this.measurementControl('bodyFatPercentage'), muscleMass: this.measurementControl('muscleMass'),
    visceralFat: this.measurementControl('visceralFat'), metabolicAge: this.measurementControl('metabolicAge'),
    calories: this.measurementControl('calories'), boneMass: this.measurementControl('boneMass'),
    waterPercentage: this.measurementControl('waterPercentage'), waist: this.measurementControl('waist'),
    hips: this.measurementControl('hips'), chest: this.measurementControl('chest'), arms: this.measurementControl('arms'),
    legs: this.fb.control<number | null>(null), calf: this.measurementControl('calf'), thigh: this.measurementControl('thigh'),
    notes: this.fb.nonNullable.control('')
  });

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const result = params.get('result');
      if (result === 'created') this.notice.set('El cliente se creó correctamente.');
      if (result === 'updated') this.notice.set('Los cambios del cliente se guardaron.');
      if (result === 'competitor-deleted') this.notice.set('La hoja de competidor se eliminó correctamente.');
      const portalInvite = params.get('portalInvite');
      if (portalInvite === 'sent') this.notice.set('El cliente se creó y la invitación al portal fue enviada.');
      if (portalInvite === 'rate-limited') {
        this.warning.set('El cliente se creó, pero Supabase limitó temporalmente el correo. Puedes reintentarlo en 1 o 2 minutos.');
      }
      if (portalInvite === 'failed') {
        this.warning.set('El cliente se creó, pero no pudimos enviar la invitación al portal. Puedes reintentarla desde esta ficha.');
      }
      const tab = params.get('tab');
      const requestedTab = tab && ['profile', 'routines', 'measurements', 'competitor', 'rir'].includes(tab)
        ? tab as ClientTab
        : null;
      this.requestedTab = requestedTab;
      if (requestedTab && (requestedTab !== 'rir' || this.profile())) {
        this.selectTab(requestedTab);
      }
    });
    this.route.data.subscribe((data) => {
      if (data['profileEdit']) {
        this.activeTab.set('profile');
        this.profileView.set('edit');
      }
    });
    this.route.paramMap.subscribe((params) => {
      const nextId = params.get('id') || '';
      if (nextId === this.clientId) return;
      this.stopHistoryAutoRefresh();
      this.clientId = nextId;
      this.client.set(null);
      this.routines.set([]);
      this.measurements.set([]);
      this.competitorSheets.set([]);
      this.trainingHistory.set([]);
      this.requestedRirPage.set(1);
      const profileEdit = !!this.route.snapshot.data['profileEdit'];
      if (profileEdit) this.activeTab.set('profile');
      else if (!this.requestedTab) this.activeTab.set('routines');
      this.profileView.set(profileEdit ? 'edit' : 'summary');
      void this.load();
    });
  }

  async load(): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId || !this.clientId) {
      this.loading.set(false);
      this.error.set('No pudimos identificar al cliente o la sesión activa.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const requestedClientId = this.clientId;
    const sequence = ++this.loadSequence;
    try {
      const [client, profile] = await Promise.all([
        this.data.getClient(requestedClientId, coachId, this.gymId || undefined),
        this.data.getProfile(coachId)
      ]);
      if (sequence !== this.loadSequence || requestedClientId !== this.clientId) return;
      this.client.set(client);
      this.profile.set(profile);
      await this.loadRelated(requestedClientId);
      if (this.requestedTab === 'rir') this.selectTab('rir');
    } catch {
      if (sequence === this.loadSequence) {
        this.error.set('No pudimos cargar la ficha del cliente. Comprueba que aún tengas acceso e inténtalo nuevamente.');
      }
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  async loadRelated(requestedClientId = this.clientId): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId) return;
    const [routines, measurements, sheets] = await Promise.all([
      this.data.getClientRoutines(requestedClientId, coachId, this.gymId || undefined),
      this.data.getClientMeasurements(requestedClientId, this.gymId || undefined),
      this.data.getCompetitorSheets(requestedClientId, coachId, this.gymId || undefined)
    ]);
    if (requestedClientId !== this.clientId) return;
    this.routines.set(routines);
    this.measurements.set(measurements);
    this.competitorSheets.set(sheets);
    if (this.hasProAccess()) {
      const history = await this.data.getTrainingHistory(requestedClientId, coachId, this.gymId || undefined);
      if (requestedClientId !== this.clientId) return;
      this.applyTrainingHistory(history);
    } else {
      this.trainingHistory.set([]);
      this.requestedRirPage.set(1);
      this.expandedRirSessions.set({});
      this.stopHistoryAutoRefresh();
    }
  }

  selectTab(tab: ClientTab): void {
    if (tab === 'rir' && !this.hasProAccess()) {
      this.showProDialog.set(true);
      return;
    }
    if (tab !== 'rir') this.stopHistoryAutoRefresh();
    if (tab === 'profile') this.profileView.set('summary');
    this.activeTab.set(tab);
    if (tab === 'rir') {
      void this.refreshTrainingHistory();
      this.startHistoryAutoRefresh();
    }
  }

  openProfileEditor(): void {
    this.activeTab.set('profile');
    this.profileView.set('edit');
  }

  selectProfileView(view: ProfileView): void {
    this.profileView.set(view);
  }

  async profileSaved(): Promise<void> {
    await this.load();
    this.activeTab.set('profile');
    this.profileView.set('summary');
    this.notice.set('Los cambios del cliente se guardaron.');
    if (this.route.snapshot.data['profileEdit']) {
      await this.router.navigate(this.clientRoute(), { replaceUrl: true, queryParams: { result: 'updated', tab: 'profile' } });
    }
  }

  async closeProfileEditor(): Promise<void> {
    this.profileView.set('summary');
    if (this.route.snapshot.data['profileEdit']) {
      await this.router.navigate(this.clientRoute(), { replaceUrl: true });
    }
  }

  profileTabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next: ProfileView = event.key === 'ArrowLeft' || event.key === 'Home' ? 'summary' : 'edit';
    this.profileView.set(next);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLButtonElement>(`[data-profile-tab="${next}"]`)
      ?.focus();
  }

  tabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs: ClientTab[] = ['profile', 'routines', 'measurements', 'competitor', 'rir'];
    const current = tabs.indexOf(this.activeTab());
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    this.selectTab(next);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLButtonElement>(`[data-client-tab="${next}"]`)
      ?.focus();
  }

  openMeasurement(measurement?: ClientMeasurement): void {
    this.measurementSaveError.set('');
    this.editingId.set(measurement?.id || null);
    this.measurementForm.reset({
      date: measurement?.date || localMeasurementDate(),
      weight: measurement?.weight ?? null,
      height: measurement?.height ?? null,
      bodyFatPercentage: measurement?.bodyFatPercentage ?? null, muscleMass: measurement?.muscleMass ?? null,
      visceralFat: measurement?.visceralFat ?? null, metabolicAge: measurement?.metabolicAge ?? null,
      calories: measurement?.calories ?? null, boneMass: measurement?.boneMass ?? null,
      waterPercentage: measurement?.waterPercentage ?? null, waist: measurement?.waist ?? null,
      hips: measurement?.hips ?? null, chest: measurement?.chest ?? null, arms: measurement?.arms ?? null,
      legs: measurement?.legs ?? null, calf: measurement?.calf ?? null, thigh: measurement?.thigh ?? null,
      notes: measurement?.notes || ''
    });
    this.editor.set('measurement');
  }

  closeEditor(): void {
    if (this.saving()) return;
    this.editor.set(null);
    this.editingId.set(null);
  }

  async saveMeasurement(): Promise<void> {
    this.measurementSaveError.set('');
    if (this.measurementForm.invalid) return this.measurementForm.markAllAsTouched();
    await this.runSave(async () => {
      const value = this.measurementForm.getRawValue();
      await this.data.saveClientMeasurement(this.clientId, {
        date: value.date, weight: Number(value.weight), height: Number(value.height), notes: value.notes,
        bodyFatPercentage: value.bodyFatPercentage, muscleMass: value.muscleMass,
        visceralFat: value.visceralFat, metabolicAge: value.metabolicAge,
        calories: value.calories, boneMass: value.boneMass,
        waterPercentage: value.waterPercentage, waist: value.waist,
        hips: value.hips, chest: value.chest, arms: value.arms,
        legs: value.legs, calf: value.calf, thigh: value.thigh
      }, this.editingId() || undefined, this.gymId || undefined);
    }, 'La medición quedó guardada.');
  }

  canModifyPlan(plan: {coachId?: string}): boolean {
    return this.data.currentProfile()?.role === 'admin' || (this.canCreateRoutines() && (!this.gymId || plan.coachId === this.auth.user()?.id));
  }

  requestDelete(kind: DeleteTarget['kind'], id: string, label: string): void {
    this.deleteTarget.set({ kind, id, label });
  }

  async confirmDelete(): Promise<void> {
    const coachId = this.auth.user()?.id;
    const target = this.deleteTarget();
    if (!coachId || !target || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      if (target.kind === 'client') {
        await this.data.deleteClient(this.clientId, coachId, this.gymId || undefined);
        await this.router.navigate(this.clientsRoute(), { queryParams: { result: 'deleted' } });
        return;
      }
      if (target.kind === 'routine') await this.data.deleteClientRoutine(this.clientId, coachId, target.id, this.gymId || undefined);
      if (target.kind === 'measurement') await this.data.deleteClientMeasurement(this.clientId, target.id, this.gymId || undefined);
      if (target.kind === 'competitor') await this.data.deleteCompetitorSheet(this.clientId, coachId, target.id, this.gymId || undefined);
      this.deleteTarget.set(null);
      await this.loadRelated();
      this.notice.set('El registro se eliminó correctamente.');
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      this.error.set(code === '23503' && target.kind === 'client'
        ? 'Este cliente tiene datos vinculados a un gimnasio u otro entrenador. Resuelve esos vínculos antes de eliminarlo para conservar su historial.'
        : 'No pudimos eliminar el registro. Inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async resendPortalInvite(): Promise<void> {
    const coachId = this.auth.user()?.id;
    const client = this.client();
    if (!coachId || !client?.email || !this.hasProAccess() || this.inviting()) return;
    this.inviting.set(true);
    this.error.set('');
    this.warning.set('');
    try {
      if (this.gymId) await this.auth.inviteGymClient(this.gymId, this.clientId, client.email);
      else await this.auth.inviteIndependentClient(coachId, this.clientId, client.email);
      this.notice.set('La invitación al portal se envió al cliente.');
    } catch (error) {
      this.warning.set(error instanceof Error ? error.message : 'No pudimos enviar la invitación. Inténtalo nuevamente.');
    } finally {
      this.inviting.set(false);
    }
  }

  clientsRoute(): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients'] : ['/clients'];
  }

  clientRoute(): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients', this.clientId] : ['/clients', this.clientId];
  }

  routineRoute(routineId?: string): string[] {
    const tail = routineId || 'new';
    return this.gymId ? ['/gym', this.gymId, 'routines', tail] : ['/routines', tail];
  }

  competitorRoute(sheetId?: string): string[] {
    const tail = sheetId ? [sheetId, 'edit'] : ['new'];
    return this.gymId ? ['/gym', this.gymId, 'competitor', ...tail] : ['/competitor', ...tail];
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
  }

  completedSets(session: TrainingSessionRecord): number {
    return session.sets.filter((set) => set.actualReps != null || set.rir != null || set.load != null).length;
  }

  averageRir(session: TrainingSessionRecord): string {
    const values = session.sets.flatMap((set) => set.rir == null ? [] : [set.rir]);
    if (!values.length) return '-';
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return average % 1 ? average.toFixed(1) : String(average);
  }

  groupedExerciseSets(session: TrainingSessionRecord): Array<{ key: string; exerciseName: string; dayLabel: string | null; sets: TrainingSetRecord[] }> {
    const groups = new Map<string, { key: string; exerciseName: string; dayLabel: string | null; sets: TrainingSetRecord[] }>();
    for (const set of session.sets) {
      const key = `${set.routineDayId}:${set.exerciseOrder}:${set.exerciseName}`;
      const existing = groups.get(key) || {
        key,
        exerciseName: set.exerciseName,
        dayLabel: set.routineDayName
          ? `Día ${set.routineDayNumber ?? '—'} · ${set.routineDayName}`
          : null,
        sets: []
      };
      existing.sets.push(set);
      groups.set(key, existing);
    }
    return [...groups.values()].map((group) => ({
      ...group,
      sets: group.sets.sort((a, b) => a.setNumber - b.setNumber)
    }));
  }

  toggleRirSession(sessionId: string): void {
    this.expandedRirSessions.update((expanded) => ({ ...expanded, [sessionId]: !expanded[sessionId] }));
  }

  goToRirPage(page: number): void {
    if (!Number.isInteger(page)) return;
    const next = Math.max(1, Math.min(page, this.rirTotalPages()));
    if (next === this.rirPage()) return;
    this.requestedRirPage.set(next);
    requestAnimationFrame(() => {
      const heading = document.getElementById('client-rir-title');
      heading?.scrollIntoView({ block: 'start' });
      heading?.focus({ preventScroll: true });
    });
  }

  changeRirPageSize(size: number): void {
    if (!this.rirPageSizeOptions.includes(size) || size === this.rirPageSize()) return;
    this.rirPageSize.set(size);
    this.requestedRirPage.set(1);
  }

  private applyTrainingHistory(history: TrainingSessionRecord[]): void {
    this.trainingHistory.set(history);
    this.requestedRirPage.set(this.rirPage());
    this.expandedRirSessions.update((current) => Object.fromEntries(
      history.map((session, index) => [session.id, current[session.id] ?? index === 0])
    ));
  }

  isRirSessionExpanded(sessionId: string): boolean {
    return !!this.expandedRirSessions()[sessionId];
  }

  measurementChange(metric: MeasurementMetric): { direction: 'up' | 'down' | 'same'; amount: number } | null {
    const [latest, previous] = this.measurements();
    const latestValue = latest?.[metric];
    const previousValue = previous?.[metric];
    if (latestValue == null || previousValue == null) return null;
    const difference = Number(latestValue) - Number(previousValue);
    return {
      direction: difference === 0 ? 'same' : difference > 0 ? 'up' : 'down',
      amount: Math.abs(difference)
    };
  }

  changeText(metric: MeasurementMetric): string {
    const change = this.measurementChange(metric);
    if (!change) return 'Sin medición anterior comparable';
    if (change.direction === 'same') return 'Sin cambio desde la anterior';
    const arrow = change.direction === 'up' ? '↑' : '↓';
    return `${arrow} ${this.formatMeasurement(change.amount, this.metricUnit(metric))} desde la anterior`;
  }

  metricLabel(metric: MeasurementMetric = this.selectedMeasurementMetric()): string {
    return ({ weight: 'Peso', bodyFatPercentage: 'Grasa corporal', muscleMass: 'Masa muscular' })[metric];
  }

  metricUnit(metric: MeasurementMetric = this.selectedMeasurementMetric()): string {
    return metric === 'bodyFatPercentage' ? '%' : 'kg';
  }

  selectMeasurementMetric(metric: MeasurementMetric): void {
    this.selectedMeasurementMetric.set(metric);
  }

  formatMeasurement(value: number | null | undefined, unit = '', maximumFractionDigits = 1): string {
    if (value == null) return 'Sin registrar';
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'Sin registrar';
    const formatted = new Intl.NumberFormat('es-CR', { maximumFractionDigits }).format(numeric);
    return unit ? `${formatted} ${unit}` : formatted;
  }

  proDialogTitle(): string {
    if (this.portalAccessStatus() === 'pending') return 'Tu acceso Pro está pendiente';
    if (this.portalAccessStatus() === 'unsupported') return 'Portal no disponible en esta versión';
    return 'Seguimiento conectado con tu cliente';
  }

  proDialogMessage(): string {
    if (this.portalAccessStatus() === 'pending') {
      return 'Renueva o confirma el pago de tu plan para volver a enviar accesos y consultar el historial RIR.';
    }
    if (this.portalAccessStatus() === 'unsupported') {
      return 'Esta versión solo implementa Portal y RIR para entrenadores independientes. Las cuentas de gimnasio continúan fuera de este alcance.';
    }
    return 'El Portal y el historial RIR están disponibles para entrenadores independientes con una suscripción Pro activa.';
  }

  routineStatus(endDate: string | null | undefined): string {
    if (!endDate) return 'Activa';
    return new Date(`${endDate}T23:59:59`).getTime() >= Date.now() ? 'Activa' : 'Finalizada';
  }

  async refreshTrainingHistory(silent = false): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId || !this.hasProAccess() || (this.rirRefreshing() && !silent)) return;
    if (!silent) this.rirRefreshing.set(true);
    this.rirError.set('');
    const requestedClientId = this.clientId;
    try {
      const history = await this.data.getTrainingHistory(requestedClientId, coachId, this.gymId || undefined);
      if (requestedClientId !== this.clientId) return;
      this.applyTrainingHistory(history);
    } catch {
      if (!silent) this.rirError.set('No pudimos actualizar el historial RIR. Inténtalo nuevamente.');
    } finally {
      if (!silent) this.rirRefreshing.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopHistoryAutoRefresh();
  }

  private async runSave(operation: (coachId: string) => Promise<void>, success: string): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    let saved = false;
    try {
      await operation(coachId);
      await this.loadRelated();
      this.notice.set(success);
      saved = true;
    } catch {
      this.error.set('No pudimos guardar los cambios. Revisa los datos e inténtalo nuevamente.');
      if (this.editor() === 'measurement') this.measurementSaveError.set('No pudimos guardar la medición. Tus datos siguen en el formulario. Inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
      if (saved) {
        this.editor.set(null);
        this.editingId.set(null);
      }
    }
  }

  private measurementControl(key: MeasurementFieldKey) {
    const field = MEASUREMENT_FIELDS.find(item => item.key === key)!;
    return this.fb.control<number | null>(null, [Validators.min(field.min), ...(field.max == null ? [] : [Validators.max(field.max)])]);
  }

  private startHistoryAutoRefresh(): void {
    this.stopHistoryAutoRefresh();
    this.historyRefreshTimer = setInterval(() => {
      if (this.activeTab() === 'rir' && this.hasProAccess()) void this.refreshTrainingHistory(true);
    }, 5000);
  }

  private stopHistoryAutoRefresh(): void {
    if (!this.historyRefreshTimer) return;
    clearInterval(this.historyRefreshTimer);
    this.historyRefreshTimer = null;
  }

}
