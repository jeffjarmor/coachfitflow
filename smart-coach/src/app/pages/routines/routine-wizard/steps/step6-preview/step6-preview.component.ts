import { Component, inject, computed, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RoutineService } from '../../../../../services/routine.service';
import { PdfService } from '../../../../../services/pdf.service';
import { ClientService } from '../../../../../services/client.service';
import { CoachService } from '../../../../../services/coach.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';
import { ButtonComponent } from '../../../../../components/ui/button/button.component';

@Component({
  selector: 'app-step6-preview',
  standalone: true,
  imports: [CommonModule, ButtonComponent, FormsModule],
  template: `
    <div class="step-container">
      <div class="header">
        <div class="title-area">
          <h2>Vista Previa y Guardar</h2>
          <p class="subtitle">Revisa la rutina y guárdala</p>
        </div>
        <div class="actions" *ngIf="!isEditing()">
          <app-button (click)="toggleEditMode()" variant="outline" size="small">
            Editar Detalles
          </app-button>
        </div>
        <div class="actions" *ngIf="isEditing()">
          <app-button (click)="cancelEdit()" variant="outline" size="small">
            Cancelar
          </app-button>
          <app-button (click)="saveEdits()" variant="primary" size="small">
            Terminar Edición
          </app-button>
        </div>
      </div>

      <div class="preview-card">
        <div class="routine-meta">
          <div class="meta-item">
            <span class="label">Cliente</span>
            <span class="value">{{ state().clientName }}</span>
          </div>
          <div class="meta-item">
            <span class="label">Nombre de la Rutina</span>
            <span class="value">{{ state().routineName }}</span>
          </div>
          <div class="meta-item">
            <span class="label">Objetivo</span>
            <span class="value">{{ state().objective || 'N/A' }}</span>
          </div>
          <div class="meta-item">
            <span class="label">Duración</span>
            <span class="value">División de {{ state().daysCount }} Días</span>
          </div>
        </div>

        <div class="days-preview">
          <!-- View Mode (using state().days) -->
          <ng-container *ngIf="!isEditing()">
            <div *ngFor="let day of state().days; let i = index" class="day-section">
              <div class="day-header">
                <h3>Día {{ i + 1 }}</h3>
                <div class="muscles">
                  <span *ngFor="let m of day.muscleGroups">{{ m }}</span>
                </div>
              </div>

              <div class="exercises-table">
                <div class="table-header">
                  <div class="col-name">Ejercicio</div>
                  <div class="col-sets">Series</div>
                  <div class="col-reps">Reps</div>
                  <div class="col-rest">Descanso</div>
                  <div class="col-notes">Notas</div>
                </div>
                
                <div *ngFor="let ex of day.exercises" class="table-row-group">
                  <div class="table-row">
                    <div class="col-name">{{ ex.exercise.name }}</div>
                    <div class="col-sets">{{ ex.sets }}</div>
                    <div class="col-reps">{{ ex.reps }}</div>
                    <div class="col-rest">{{ ex.rest }}</div>
                    <div class="col-notes">{{ ex.notes || '-' }}</div>
                  </div>
                  
                  <!-- Progressive Overload View -->
                  <div class="progressive-overload-view" *ngIf="ex.weekConfigs && ex.weekConfigs.length > 0">
                    <div class="po-badge" *ngFor="let po of ex.weekConfigs">
                      <span class="weeks">Sem {{ po.startWeek }}-{{ po.endWeek }}:</span>
                      <span class="val">{{ po.sets }} x {{ po.reps }}</span>
                    </div>
                  </div>
                </div>

                <div *ngIf="day.exercises.length === 0" class="empty-day">
                  No hay ejercicios asignados
                </div>
              </div>
            </div>
          </ng-container>

          <!-- Edit Mode (using editedDays) -->
          <ng-container *ngIf="isEditing()">
            <div *ngFor="let day of editedDays; let dayIndex = index" class="day-section">
              <div class="day-header">
                <h3>Día {{ dayIndex + 1 }}</h3>
                <div class="muscles">
                  <span *ngFor="let m of day.muscleGroups">{{ m }}</span>
                </div>
              </div>

              <div class="exercises-table">
                <div class="table-header">
                  <div class="col-name">Ejercicio</div>
                  <div class="col-sets">Series</div>
                  <div class="col-reps">Reps</div>
                  <div class="col-rest">Descanso</div>
                  <div class="col-notes">Notas</div>
                </div>
                
                <div *ngFor="let ex of day.exercises; let exIndex = index" class="table-row-group">
                  <div class="table-row">
                    <div class="col-name">{{ ex.exercise.name }}</div>
                    <div class="col-sets">
                      <input type="number" [(ngModel)]="ex.sets" class="edit-input small">
                    </div>
                    <div class="col-reps">
                      <input type="text" [(ngModel)]="ex.reps" class="edit-input">
                    </div>
                    <div class="col-rest">
                      <input type="text" [(ngModel)]="ex.rest" class="edit-input">
                    </div>
                    <div class="col-notes">
                      <input type="text" [(ngModel)]="ex.notes" class="edit-input" placeholder="Notas...">
                    </div>
                  </div>

                  <!-- Progressive Overload Edit -->
                  <div class="progressive-overload-edit">
                    <div class="po-header">
                      <span>Sobrecarga Progresiva</span>
                      <button class="btn-add-po" (click)="addProgressiveOverload(dayIndex, exIndex)">
                        + Agregar
                      </button>
                    </div>
                    
                    <div class="po-list" *ngIf="ex.weekConfigs && ex.weekConfigs.length > 0">
                      <div class="po-item" *ngFor="let po of ex.weekConfigs; let poIndex = index">
                        <div class="po-inputs">
                            <div class="input-group">
                                <label>Sem Inicio</label>
                                <input type="number" [(ngModel)]="po.startWeek">
                            </div>
                            <div class="input-group">
                                <label>Sem Fin</label>
                                <input type="number" [(ngModel)]="po.endWeek">
                            </div>
                            <div class="input-group">
                                <label>Series</label>
                                <input type="number" [(ngModel)]="po.sets">
                            </div>
                            <div class="input-group">
                                <label>Reps</label>
                                <input type="text" [(ngModel)]="po.reps">
                            </div>
                        </div>
                        <button class="btn-remove-po" (click)="removeProgressiveOverload(dayIndex, exIndex, poIndex)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div *ngIf="day.exercises.length === 0" class="empty-day">
                  No hay ejercicios asignados
                </div>
              </div>
            </div>
          </ng-container>
        </div>

        <!-- Global Notes Section -->
        <div class="global-notes-section">
          <h3>Notas de la Rutina</h3>
          
          <div *ngIf="!isEditing()" class="notes-view">
            <p>{{ state().notes || 'No se agregaron notas globales.' }}</p>
          </div>

          <div *ngIf="isEditing()" class="notes-edit">
            <textarea 
              [(ngModel)]="editedGlobalNotes" 
              placeholder="Agrega notas generales para esta rutina (ej. instrucciones de calentamiento)..."
              rows="3"
              class="notes-textarea"
            ></textarea>
          </div>
        </div>
      </div>

      <div class="actions-footer" *ngIf="!isEditing()">
        <div class="left-actions">
            <!-- Back button is handled by parent wizard -->
        </div>
        <div class="right-actions">
            <app-button 
                variant="secondary" 
                (click)="saveRoutine(false)" 
                [loading]="saving() && !generatingPdf()"
                [disabled]="saving()"
            >
                Guardar Rutina
            </app-button>
            <app-button 
                variant="primary" 
                (click)="saveRoutine(true)" 
                [loading]="saving() && generatingPdf()"
                [disabled]="saving()"
            >
                Guardar y Generar PDF
            </app-button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./step6-preview.component.scss']
})
export class Step6PreviewComponent {
  // Admin mode inputs
  @Input() adminMode: boolean = false;
  @Input() targetCoachId: string | null = null;

  private routineService = inject(RoutineService);
  private pdfService = inject(PdfService);
  private clientService = inject(ClientService);
  private coachService = inject(CoachService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  state = this.routineService.wizardState;
  saving = signal(false);
  generatingPdf = signal(false);

  // Edit Mode State
  isEditing = signal(false);
  editedDays: any[] = [];
  editedGlobalNotes = '';

  toggleEditMode() {
    if (!this.isEditing()) {
      // Clone current days and notes for editing
      this.editedDays = JSON.parse(JSON.stringify(this.state().days));
      this.editedGlobalNotes = this.state().notes || '';
      this.isEditing.set(true);
    }
  }

  cancelEdit() {
    this.editedDays = [];
    this.editedGlobalNotes = '';
    this.isEditing.set(false);
  }

  saveEdits() {
    // Update wizard state with edited days and notes
    this.routineService.updateWizardState({
      days: this.editedDays,
      notes: this.editedGlobalNotes
    });
    this.isEditing.set(false);
    this.editedDays = [];
    this.editedGlobalNotes = '';
  }

  addProgressiveOverload(dayIndex: number, exerciseIndex: number) {
    const exercise = this.editedDays[dayIndex].exercises[exerciseIndex];
    if (!exercise.weekConfigs) {
      exercise.weekConfigs = [];
    }

    // Find next available week start
    let nextStart = 1;
    if (exercise.weekConfigs.length > 0) {
      const lastRange = exercise.weekConfigs[exercise.weekConfigs.length - 1];
      nextStart = (parseInt(lastRange.endWeek) || 0) + 1;
    }

    exercise.weekConfigs.push({
      startWeek: nextStart,
      endWeek: nextStart + 3,
      sets: exercise.sets,
      reps: exercise.reps
    });
  }

  removeProgressiveOverload(dayIndex: number, exerciseIndex: number, rangeIndex: number) {
    const exercise = this.editedDays[dayIndex].exercises[exerciseIndex];
    if (exercise.weekConfigs) {
      exercise.weekConfigs.splice(rangeIndex, 1);
    }
  }

  async saveRoutine(generatePdf: boolean) {
    try {
      this.saving.set(true);
      if (generatePdf) {
        this.generatingPdf.set(true);
      }

      console.log('Saving routine...');
      // 1. Save Routine
      // Pass targetCoachId if in admin mode
      const routineId = await this.routineService.saveRoutineFromWizard(
        this.adminMode ? this.targetCoachId : null
      );
      console.log('Routine saved with ID:', routineId);

      // 2. Generate PDF if requested
      if (generatePdf) {
        // Use targetCoachId if in admin mode, otherwise current user
        const coachId = this.adminMode && this.targetCoachId
          ? this.targetCoachId
          : this.authService.getCurrentUserId();

        if (!coachId) throw new Error('No coach logged in');

        console.log('Fetching data for PDF...');
        // Fetch required data
        const [routine, client, coach] = await Promise.all([
          this.routineService.getRoutineWithDays(coachId, routineId),
          this.clientService.getClient(coachId, this.state().clientId!),
          this.coachService.getCoachProfile(coachId)
        ]);

        console.log('Data fetched:', { routine: !!routine, client: !!client, coach: !!coach });

        if (routine && client && coach) {
          console.log('Generating PDF...');
          await this.pdfService.generateRoutinePDF(routine, client, coach);
          console.log('PDF generated successfully');
        } else {
          console.error('Missing data for PDF generation:', { routine, client, coach });
          this.toastService.warning('Rutina guardada, pero no se pudo generar el PDF');
        }
      }

      // 3. Navigate away
      this.routineService.resetWizardState();

      if (this.adminMode && this.targetCoachId) {
        this.router.navigate(['/routines', routineId], {
          queryParams: { coachId: this.targetCoachId }
        });
      } else {
        this.router.navigate(['/routines', routineId]);
      }

    } catch (error: any) {
      console.error('Error saving routine:', error);
      this.toastService.error(`Error: ${error.message || 'Error desconocido'}`);
    } finally {
      this.saving.set(false);
      this.generatingPdf.set(false);
    }
  }
}
