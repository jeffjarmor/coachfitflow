import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { Component, HostListener, inject, NgZone, OnDestroy, OnInit, signal, computed } from '@angular/core';
import { AbstractControl, FormBuilder, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { PendingChangesAware } from '../../core/auth/pending-changes.guard';
import { RouterLink } from '@angular/router';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { AnnouncementsComponent, AnnouncementMessage } from '../../shared/announcements.component';
import {
  AdminAnnouncementsService, AnnouncementAccessError, AnnouncementAudience, AnnouncementState,
  AnnouncementValidationError, CoachAnnouncement, announcementAudienceLabel, announcementDateInput,
  announcementState, compareAnnouncements
} from './admin-announcements.service';

function dateRange(control: AbstractControl): ValidationErrors | null {
  const { startsAt, endsAt } = control.value;
  return startsAt && endsAt && startsAt > endsAt ? { dateRange: true } : null;
}

@Component({
  selector: 'app-admin-announcements',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, ReactiveFormsModule, RouterLink, CustomSelectComponent, AnnouncementsComponent],
  templateUrl: './admin-announcements.component.html',
  styleUrl: './admin-announcements.component.scss'
})
export class AdminAnnouncementsComponent implements OnInit, OnDestroy, PendingChangesAware {
  readonly pagination = createListPagination(() => this.filtered(), () => JSON.stringify([this.query(), this.filter()]));

  private readonly data = inject(AdminAnnouncementsService);
  private readonly fb = inject(FormBuilder);
  private readonly zone = inject(NgZone);
  private readonly stateNow = signal(Date.now());
  private stateTimer?: ReturnType<typeof setTimeout>;
  private readInFlight = false;
  private destroyed = false;
  readonly announcements = signal<CoachAnnouncement[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly loadError = signal('');
  readonly actionError = signal('');
  readonly saveError = signal('');
  readonly success = signal('');
  readonly query = signal('');
  readonly filter = signal<'all' | AnnouncementState>('all');
  readonly audienceOptions = [
    { value: 'all', label: 'Todos' }, { value: 'standard', label: 'Entrenadores estándar' }, { value: 'paid', label: 'Entrenadores Pro' }
  ];
  readonly stateOptions = [
    { value: 'all', label: 'Todos los estados' }, { value: 'published', label: 'Publicados' },
    { value: 'draft', label: 'Borradores' }, { value: 'scheduled', label: 'Programados' }, { value: 'expired', label: 'Vencidos' }
  ];
  readonly form = this.fb.nonNullable.group({
    title: ['', Validators.required], message: ['', Validators.required], audience: ['all' as AnnouncementAudience, Validators.required],
    active: [true], sortOrder: [0, [Validators.required, Validators.pattern(/^-?\d+$/), Validators.min(-2147483648), Validators.max(2147483647)]], startsAt: [''], endsAt: ['']
  }, { validators: dateRange });
  private readonly previewValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly preview = computed<AnnouncementMessage[]>(() => {
    const value = this.previewValue();
    const title = value.title?.trim() || '';
    const message = value.message?.trim() || '';
    return title || message
      ? [{ id: 'announcement-preview', title: title || 'Título del aviso', message: message || 'Mensaje del aviso' }]
      : [];
  });
  readonly filtered = computed(() => {
    const term = this.query().trim().toLocaleLowerCase('es');
    const now = new Date(this.stateNow());
    return this.announcements().filter(item => (this.filter() === 'all' || announcementState(item, now) === this.filter())
      && (!term || `${item.title} ${item.message} ${announcementAudienceLabel(item.audience)}`.toLocaleLowerCase('es').includes(term)));
  });
  readonly isBusy = computed(() => this.loading() || this.saving() || this.busyId() !== null);

  ngOnInit(): void { void this.load(); }
  ngOnDestroy(): void { this.destroyed = true; clearTimeout(this.stateTimer); }

  async load(): Promise<void> {
    if (this.readInFlight || this.saving() || this.busyId() !== null) return;
    this.readInFlight = true;
    this.loading.set(true);
    this.loadError.set('');
    try {
      this.announcements.set(await this.data.getAllAnnouncements());
      this.refreshStates();
    }
    catch (error) { this.loadError.set(error instanceof AnnouncementAccessError ? error.message : 'No pudimos cargar los anuncios. Revisa la conexión e inténtalo nuevamente.'); }
    finally { this.readInFlight = false; this.loading.set(false); }
  }

  startCreate(): void {
    if (this.isBusy() || !this.confirmDiscard()) return;
    this.reset();
    this.focusEditor();
  }

  edit(item: CoachAnnouncement): void {
    if (this.isBusy() || !this.confirmDiscard()) return;
    this.selectedId.set(item.id);
    this.form.reset({ title: item.title, message: item.message, audience: item.audience,
      active: item.active, sortOrder: item.sortOrder, startsAt: announcementDateInput(item.startsAt), endsAt: announcementDateInput(item.endsAt) });
    this.clearFeedback();
    this.focusEditor();
  }

  async save(): Promise<void> {
    if (this.isBusy()) return;
    this.form.markAllAsTouched();
    this.saveError.set('');
    this.success.set('');
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.saving.set(true);
    try {
      const item = this.selectedId()
        ? await this.data.updateAnnouncement(this.selectedId()!, value)
        : await this.data.createAnnouncement(value);
      this.remember(item);
      this.reset();
      this.success.set('Anuncio guardado correctamente.');
    } catch (error) {
      // Keep all entered values and the selected record available for retry.
      this.saveError.set(error instanceof AnnouncementValidationError || error instanceof AnnouncementAccessError
        ? error.message : 'No pudimos guardar el anuncio. Tus cambios siguen en el formulario. Inténtalo nuevamente.');
    } finally { this.saving.set(false); }
  }

  async toggle(item: CoachAnnouncement): Promise<void> {
    if (this.isBusy()) return;
    this.clearFeedback();
    if (this.selectedId() === item.id && this.form.dirty) {
      this.actionError.set('Guarda o cancela los cambios del formulario antes de cambiar el estado de este anuncio.');
      return;
    }
    this.busyId.set(item.id);
    try {
      const saved = await this.data.toggleAnnouncementActive(item.id, !item.active);
      this.remember(saved);
      if (this.selectedId() === item.id) this.form.controls.active.setValue(saved.active);
      this.success.set(saved.active ? 'Anuncio activado correctamente.' : 'Anuncio desactivado correctamente.');
    } catch (error) {
      this.actionError.set(error instanceof AnnouncementAccessError ? error.message : 'No pudimos cambiar el estado del anuncio. Inténtalo nuevamente desde su botón.');
    } finally { this.busyId.set(null); }
  }

  async remove(item: CoachAnnouncement): Promise<void> {
    if (this.isBusy() || !window.confirm(`¿Eliminar el anuncio “${item.title}”? Dejará de mostrarse a los entrenadores. Esta acción no se puede deshacer.`)) return;
    this.clearFeedback();
    this.busyId.set(item.id);
    try {
      await this.data.deleteAnnouncement(item.id);
      this.announcements.update(rows => rows.filter(row => row.id !== item.id));
      this.refreshStates();
      if (this.selectedId() === item.id) this.reset();
      this.success.set('Anuncio eliminado correctamente.');
    } catch (error) {
      this.actionError.set(error instanceof AnnouncementAccessError ? error.message : 'No pudimos eliminar el anuncio. Inténtalo nuevamente desde su botón.');
    } finally { this.busyId.set(null); }
  }

  cancel(): void {
    if (this.isBusy() || !this.confirmDiscard()) return;
    this.reset();
  }

  canDeactivate(): boolean { return this.confirmDiscard(); }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.form.dirty) { event.preventDefault(); event.returnValue = ''; }
  }

  state(item: CoachAnnouncement): AnnouncementState { return announcementState(item, new Date(this.stateNow())); }
  audienceLabel = announcementAudienceLabel;
  stateLabel(item: CoachAnnouncement): string {
    return { draft: 'Borrador', scheduled: 'Programado', expired: 'Vencido', published: 'Publicado' }[this.state(item)];
  }

  schedule(item: CoachAnnouncement): string {
    const format = (value: string) => new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
    if (item.startsAt && item.endsAt) return `Del ${format(item.startsAt)} al ${format(item.endsAt)}`;
    if (item.startsAt) return `Desde ${format(item.startsAt)}`;
    if (item.endsAt) return `Hasta ${format(item.endsAt)}`;
    return 'Sin fechas de inicio ni vencimiento';
  }

  private remember(item: CoachAnnouncement): void {
    this.announcements.update(rows => [...rows.filter(row => row.id !== item.id), item].sort(compareAnnouncements));
    this.refreshStates();
  }

  private refreshStates(): void {
    clearTimeout(this.stateTimer);
    if (this.destroyed) return;
    const now = Date.now();
    this.stateNow.set(now);
    let next = Infinity;
    for (const item of this.announcements()) {
      if (!item.active) continue;
      // Start is inclusive; end becomes expired one millisecond after its bound.
      for (const boundary of [Date.parse(item.startsAt ?? ''), Date.parse(item.endsAt ?? '') + 1]) {
        if (boundary > now && boundary < next) next = boundary;
      }
    }
    if (Number.isFinite(next)) {
      this.stateTimer = this.zone.runOutsideAngular(() => setTimeout(
        () => this.zone.run(() => this.refreshStates()), Math.min(next - now, 2_147_483_647)));
    }
  }

  private reset(): void {
    this.selectedId.set(null);
    this.form.reset({ title: '', message: '', audience: 'all', active: true, sortOrder: 0, startsAt: '', endsAt: '' });
    this.clearFeedback();
  }

  private clearFeedback(): void { this.actionError.set(''); this.saveError.set(''); this.success.set(''); }
  private confirmDiscard(): boolean {
    return !this.form.dirty || typeof window === 'undefined' || window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?');
  }

  private focusEditor(): void {
    requestAnimationFrame(() => {
      document.getElementById('announcement-editor')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      document.getElementById('announcement-title')?.focus({ preventScroll: true });
    });
  }
}
