import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';
import { internationalPhoneValidator } from '../../shared/phone-number';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest } from 'rxjs';
import { FormsModule, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminMeasurementsComponent } from './admin-measurements.component';
import { AdminClientDetail, AdminCoachRecord, AdminDataService } from './admin-data.service';

@Component({
  selector: 'app-admin-client-detail',
  standalone: true,
  imports: [ListPaginationComponent, ReactiveFormsModule, FormsModule, RouterLink, AdminMeasurementsComponent, CustomSelectComponent],
  templateUrl: './admin-client-detail.component.html',
  styleUrl: './admin-client-detail.component.scss'
})
export class AdminClientDetailComponent implements OnInit {
  readonly routinePagination = createListPagination(() => this.detail()?.routines || [], () => this.detail()?.client.contextKey);

  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly data = inject(AdminDataService);

  private readonly destroyRef = inject(DestroyRef);
  private loadSequence = 0;
  get coachId(): string { return this.route.snapshot.paramMap.get('coachId') || ''; }
  get clientId(): string { return this.route.snapshot.paramMap.get('clientId') || ''; }
  get contextParams() { return { membershipId: this.detail()?.client.membershipId || null, gymId: this.detail()?.client.gymId || null }; }
  readonly cloneOptions = computed(() => this.coaches().map(coach => ({value: coach.id, label: `${coach.name} · ${coach.email}`})));
  readonly cloneTarget = signal('');
  readonly coaches = signal<AdminCoachRecord[]>([]);
  readonly editMode = signal(!!this.route.snapshot.data['editMode']);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly detail = signal<AdminClientDetail | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', internationalPhoneValidator],
    birthDate: [''],
    weight: this.fb.control<number | null>(null, [Validators.min(20), Validators.max(500)]),
    height: this.fb.control<number | null>(null, [Validators.min(50), Validators.max(300)]),
    goal: [''],
    address: [''],
    notes: ['']
  });

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.detail.set(null); void this.load(); });
  }

  async load(): Promise<void> {
    if (!this.coachId || !this.clientId) return;
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.error.set('');
    try {
      const [detail, coaches] = await Promise.all([
        this.data.getClientDetail(this.coachId, this.clientId, this.route.snapshot.queryParamMap.get('membershipId')),
        this.data.listCoaches()
      ]);
      if (sequence !== this.loadSequence) return;
      if (!detail) {
        this.error.set('El cliente ya no está vinculado con este entrenador.');
        return;
      }
      this.detail.set(detail);
      this.coaches.set(coaches.filter(coach => coach.role !== 'admin'));
      this.patchForm(detail);
      if (this.route.snapshot.queryParamMap.get('result') === 'routine-created') {
        this.notice.set('La rutina se creó correctamente para este cliente.');
      }
    } catch {
      if (sequence !== this.loadSequence) return;
      this.error.set('No pudimos cargar la ficha. Revisa la conexión e inténtalo nuevamente.');
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  startEditing(): void {
    const detail = this.detail();
    if (!detail) return;
    this.patchForm(detail);
    this.editMode.set(true);
  }

  cancelEditing(): void {
    if (this.form.dirty && !window.confirm('¿Quieres descartar los cambios del formulario?')) return;
    if (this.route.snapshot.data['editMode']) {
      this.form.markAsPristine();
      void this.router.navigate(['/admin/clients', this.coachId, this.clientId], { queryParams: this.contextParams });
      return;
    }
    this.editMode.set(false);
    if (this.detail()) this.patchForm(this.detail()!);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const value = this.form.getRawValue();
      await this.data.updateClient(this.clientId, {
        name: value.name,
        email: value.email,
        phone: value.phone,
        birthDate: value.birthDate,
        weight: value.weight,
        height: value.height,
        goal: value.goal,
        address: value.address,
        notes: value.notes
      });
      await this.load();
      this.editMode.set(false);
      this.notice.set('Los datos del cliente se actualizaron correctamente.');
      await this.router.navigate(['/admin/clients', this.coachId, this.clientId], { replaceUrl: true, queryParams: this.contextParams });
    } catch {
      this.error.set('No pudimos guardar los cambios. Revisa los datos e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  async cloneClient(): Promise<void> {
    const client = this.detail()?.client;
    if (!client || !this.cloneTarget() || this.saving()) return;
    this.saving.set(true);
    try {
      const target = this.cloneTarget();
      const id = await this.data.cloneClient(client, target);
      this.notice.set('Cliente clonado con sus rutinas y mediciones.');
      await this.router.navigate(['/admin/clients', target, id]);
    } catch { this.error.set('No pudimos clonar el cliente. Inténtalo nuevamente.'); }
    finally { this.saving.set(false); }
  }

  async removeClient(): Promise<void> {
    const client = this.detail()?.client;
    if (!client || this.saving()) return;
    if (!window.confirm('¿Eliminar al cliente de este contexto y sus rutinas, mediciones y pagos asociados? Esta acción no se puede deshacer.')) return;
    this.saving.set(true);
    try { await this.data.deleteClientContext(client); await this.router.navigate(['/admin/clients']); }
    catch { this.error.set('No pudimos eliminar el cliente de este contexto.'); }
    finally { this.saving.set(false); }
  }

  canDeactivate(): boolean {
    return !this.editMode() || !this.form.dirty
      || window.confirm('¿Quieres salir sin guardar los cambios del cliente?');
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric' })
      .format(new Date(`${value.slice(0, 10)}T12:00:00`));
  }

  formatMetric(value: number | null, unit: string): string {
    if (value == null) return 'Sin registrar';
    return `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
  }

  private patchForm(detail: AdminClientDetail): void {
    const client = detail.client;
    this.form.patchValue({
      name: client.name,
      email: client.email,
      phone: client.phone || '',
      birthDate: client.birthDate || '',
      weight: client.weight ?? null,
      height: client.height ?? null,
      goal: client.goal,
      address: client.address || '',
      notes: client.notes || ''
    });
    this.form.markAsPristine();
  }

}
