import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ClientMeasurement, ClientMeasurementInput, CoachDataService } from '../../core/data/coach-data.service';
import { localMeasurementDate, MEASUREMENT_FIELDS } from '../../shared/measurement-fields';

type MeasurementDraft = Omit<ClientMeasurementInput, 'weight' | 'height'> & { weight: number | null; height: number | null };

@Component({
  selector: 'app-admin-measurements', standalone: true, imports: [ListPaginationComponent, FormsModule],
  styleUrl: './admin-client-detail.component.scss',
  template: `
    <section class="admin-section" id="admin-measurement-list" tabindex="-1" data-paginated-list>
      <header><div><h2>Mediciones</h2><p>Controles registrados en este contexto.</p></div><button class="btn btn-outline-dark" type="button" (click)="edit()">Nueva medición</button></header>
      @if (error()) { <p class="admin-feedback error" role="alert">{{ error() }} <button type="button" (click)="load()">Reintentar</button></p> }
      @if (loading()) { <p role="status">Cargando mediciones…</p> }
      @else if (!measurements().length) { <p>No hay mediciones en este contexto.</p> }
      @for (measurement of pagination.visibleItems(); track measurement.id) {
        <div class="admin-actions"><span>{{ measurement.date }} · {{ measurement.weight }} kg · IMC {{ measurement.bmi }}</span><button class="btn btn-outline-dark" type="button" (click)="edit(measurement)">Editar</button><button class="btn btn-outline-danger" type="button" [disabled]="saving()" (click)="remove(measurement)">Eliminar</button></div>
      }
      @if (!loading()) { <app-list-pagination label="Paginación de mediciones" [total]="pagination.total()" [page]="pagination.page()" [pageSize]="pagination.pageSize()" (pageChange)="pagination.goToPage($event)" (pageSizeChange)="pagination.changePageSize($event)" targetId="admin-measurement-list" [disabled]="saving()" /> }
      @if (editing()) {
        <form #measurementForm="ngForm" (ngSubmit)="save(measurementForm)">
          <h3>{{ measurementId ? 'Editar medición' : 'Nueva medición' }}</h3>
          <p>Peso y altura son obligatorios. Los demás campos son opcionales y el IMC se calcula automáticamente.</p>
          <div class="admin-form-grid">
            <div><label>Peso (kg) *<input class="form-control" type="number" name="weight" aria-label="Peso (kg)" min="20" max="300" step="0.1" required [(ngModel)]="draft.weight" [attr.aria-invalid]="measurementForm.controls['weight']?.touched && measurementForm.controls['weight']?.invalid" aria-describedby="admin-measurement-weight-error"></label>
              @if (measurementForm.controls['weight']?.touched && measurementForm.controls['weight']?.invalid) { <p id="admin-measurement-weight-error" class="admin-feedback error">Ingresa un peso entre 20 y 300 kg.</p> }
            </div>
            <div><label>Altura (cm) *<input class="form-control" type="number" name="height" aria-label="Altura (cm)" min="100" max="250" step="0.1" required [(ngModel)]="draft.height" [attr.aria-invalid]="measurementForm.controls['height']?.touched && measurementForm.controls['height']?.invalid" aria-describedby="admin-measurement-height-error"></label>
              @if (measurementForm.controls['height']?.touched && measurementForm.controls['height']?.invalid) { <p id="admin-measurement-height-error" class="admin-feedback error">Ingresa una altura entre 100 y 250 cm.</p> }
            </div>
            @for (field of fields; track field.key) {
              <div><label>{{ field.label }}<input class="form-control" type="number" [name]="field.key" [min]="field.min" [max]="field.max ?? null" [step]="field.step" [(ngModel)]="draft[field.key]" [attr.aria-invalid]="measurementForm.controls[field.key]?.touched && measurementForm.controls[field.key]?.invalid" [attr.aria-describedby]="'admin-measurement-' + field.key + '-error'"></label>
                @if (measurementForm.controls[field.key]?.touched && measurementForm.controls[field.key]?.invalid) { <p [id]="'admin-measurement-' + field.key + '-error'" class="admin-feedback error">{{ field.error }}</p> }
              </div>
            }
            <label class="wide">Notas<textarea class="form-control" name="notes" rows="3" [(ngModel)]="draft.notes"></textarea></label>
          </div>
          <div class="admin-form-actions"><button class="btn btn-outline-dark" type="button" [disabled]="saving()" (click)="editing.set(false)">Cancelar</button><button class="btn btn-primary" type="submit" [disabled]="saving() || measurementForm.invalid">{{ saving() ? 'Guardando…' : 'Guardar medición' }}</button></div>
        </form>
      }
    </section>`
})
export class AdminMeasurementsComponent implements OnChanges {
  readonly pagination = createListPagination(() => this.measurements());

  @Input({ required: true }) clientId = '';
  @Input() gymId = '';
  @Output() changed = new EventEmitter<void>();
  private readonly data = inject(CoachDataService);
  readonly measurements = signal<ClientMeasurement[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly error = signal('');
  measurementId: string | undefined;
  draft: MeasurementDraft = this.empty();
  readonly fields = MEASUREMENT_FIELDS;
  ngOnChanges(): void { this.pagination.reset(); this.editing.set(false); void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.measurements.set(await this.data.getClientMeasurements(this.clientId, this.gymId || undefined)); }
    catch { this.error.set('No pudimos cargar las mediciones.'); }
    finally { this.loading.set(false); }
  }
  edit(measurement?: ClientMeasurement): void {
    this.measurementId = measurement?.id;
    this.draft = measurement ? {...measurement} : this.empty();
    this.editing.set(true);
  }
  async save(form?: NgForm): Promise<void> {
    if (form?.invalid) { form.form.markAllAsTouched(); return; }
    if (this.saving() || !this.draft.date || this.draft.weight == null || this.draft.height == null
      || this.draft.weight < 20 || this.draft.weight > 300 || this.draft.height < 100 || this.draft.height > 250) return;
    this.saving.set(true); this.error.set('');
    try { await this.data.saveClientMeasurement(this.clientId, { ...this.draft, weight: this.draft.weight, height: this.draft.height }, this.measurementId, this.gymId || undefined); this.editing.set(false); await this.load(); this.changed.emit(); }
    catch { this.error.set('No pudimos guardar la medición. Revisa los datos e inténtalo nuevamente.'); }
    finally { this.saving.set(false); }
  }
  async remove(measurement: ClientMeasurement): Promise<void> {
    if (this.saving() || !window.confirm('¿Eliminar esta medición? Esta acción no se puede deshacer.')) return;
    this.saving.set(true); this.error.set('');
    try { await this.data.deleteClientMeasurement(this.clientId, measurement.id, this.gymId || undefined); await this.load(); this.changed.emit(); }
    catch { this.error.set('No pudimos eliminar la medición.'); }
    finally { this.saving.set(false); }
  }
  private empty(): MeasurementDraft { return {date: localMeasurementDate(), weight: null, height: null, notes: ''}; }
}
