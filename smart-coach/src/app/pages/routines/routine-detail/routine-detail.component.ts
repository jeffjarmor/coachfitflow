import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormArray, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RoutineService } from '../../../services/routine.service';
import { AuthService } from '../../../services/auth.service';
import { PdfService } from '../../../services/pdf.service';
import { ClientService } from '../../../services/client.service';
import { CoachService } from '../../../services/coach.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmService } from '../../../services/confirm.service';
import { RoutineWithDays, WeekConfig } from '../../../models/routine.model';
import { ButtonComponent } from '../../../components/ui/button/button.component';

@Component({
  selector: 'app-routine-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, FormsModule, ReactiveFormsModule],
  template: `
    <div class="page-container" *ngIf="routine(); else loadingTpl">
      <div class="header-section">
        <div class="title-area">
          <app-button routerLink="../../" variant="outline" size="small">← Volver al Cliente</app-button>
          
          <ng-container *ngIf="!isEditing()">
            <h1>{{ routine()!.name }}</h1>
            <p class="subtitle">{{ routine()!.objective }}</p>
          </ng-container>

          <ng-container *ngIf="isEditing()">
            <div class="edit-header-form">
              <input type="text" [(ngModel)]="routine()!.name" class="edit-input h1-input" placeholder="Nombre de la rutina">
              <input type="text" [(ngModel)]="routine()!.objective" class="edit-input subtitle-input" placeholder="Objetivo">
            </div>
          </ng-container>
        </div>
        
        <div class="actions">
          <ng-container *ngIf="!isEditing()">
            <app-button (click)="toggleEditMode()" variant="outline">
              Editar Rutina
            </app-button>
            <app-button (click)="downloadPdf()" [loading]="generatingPdf()" variant="primary">
              Descargar PDF
            </app-button>
          </ng-container>
          
          <ng-container *ngIf="isEditing()">
            <app-button (click)="deleteRoutine()" variant="danger" [disabled]="saving()">
              Eliminar Rutina
            </app-button>
            <app-button (click)="cancelEdit()" variant="outline" [disabled]="saving()">
              Cancelar
            </app-button>
            <app-button (click)="saveChanges()" [loading]="saving()" variant="primary">
              Guardar Cambios
            </app-button>
          </ng-container>
        </div>
      </div>

      <div class="content-grid">
        <div class="meta-card">
          <div class="meta-item">
            <span class="label">Duración</span>
            <span class="value">{{ routine()!.trainingDaysCount }} Días / Semana</span>
          </div>
          <div class="meta-item">
            <span class="label">Creado</span>
            <span class="value">{{ routine()!.createdAt | date:'mediumDate' }}</span>
          </div>
          <div class="meta-item" *ngIf="routine()!.notes">
            <span class="label">Notas</span>
            <span class="value">{{ routine()!.notes }}</span>
          </div>
        </div>



      <!-- Global Progressive Overload (Edit Mode Only) -->
      <div class="global-progressive-overload-section" *ngIf="isEditing()">
        <div class="global-header" (click)="toggleGlobalConfig()">
          <div class="header-left">
            <h3>⚡ Sobrecarga Progresiva Global</h3>
            <p class="description">Configura una vez y aplica a todos los ejercicios</p>
          </div>
          <div class="header-right">
            <span class="toggle-icon">{{ showGlobalConfig() ? '▼' : '▶' }}</span>
          </div>
        </div>

        <div class="global-content" *ngIf="showGlobalConfig()">
          <div class="global-info">
            <p>Define los rangos de semanas y se aplicarán automáticamente a <strong>{{ totalExercisesCount() }} ejercicios</strong> en todos los días.</p>
          </div>

          <div class="week-configs" [formGroup]="globalWeekConfigsForm">
            <div formArrayName="configs">
              <div *ngFor="let config of globalWeekConfigsArray.controls; let i = index" [formGroupName]="i" class="week-config-row">
                <div class="config-grid">
                  <div class="input-group">
                    <label>Sem Inicio</label>
                    <input type="number" formControlName="startWeek">
                  </div>
                  <div class="input-group">
                    <label>Sem Fin</label>
                    <input type="number" formControlName="endWeek">
                  </div>
                  <div class="input-group">
                    <label>Series</label>
                    <input type="number" formControlName="sets">
                  </div>
                  <div class="input-group">
                    <label>Reps</label>
                    <input type="text" formControlName="reps" placeholder="10-12">
                  </div>
                  <div class="input-group">
                    <label>Descanso</label>
                    <input type="text" formControlName="rest" placeholder="60s">
                  </div>
                </div>
                <button class="btn-remove" (click)="removeGlobalWeekConfig(i)" type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
            
            <div *ngIf="globalWeekConfigsArray.length === 0" class="empty-configs">
              <p>No hay configuraciones globales. Agrega rangos de semanas para aplicar a todos los ejercicios.</p>
            </div>
          </div>

          <div class="global-actions">
            <button class="btn-add-range" (click)="addGlobalWeekConfig()">
              + Agregar Rango de Semanas
            </button>
            <button 
              class="btn-apply-global" 
              (click)="applyGlobalProgressiveOverload()"
              [disabled]="globalWeekConfigsArray.length === 0"
            >
              ✓ Aplicar a Todos los Ejercicios ({{ totalExercisesCount() }})
            </button>
          </div>
        </div>
      </div>

      <div class="days-list">
          <div *ngFor="let day of routine()!.days" class="day-card">
            <div class="day-header">
              <h3>{{ day.dayName }}</h3>
              <div class="muscles">
                <span *ngFor="let m of day.muscleGroups" class="muscle-tag">{{ m }}</span>
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
                  <div class="col-name">
                    {{ ex.exerciseName }}
                    <a *ngIf="ex.videoUrl" [href]="ex.videoUrl" target="_blank" class="video-link">📺</a>
                  </div>
                  
                  <!-- View Mode -->
                  <ng-container *ngIf="!isEditing()">
                    <div class="col-sets">{{ ex.sets }}</div>
                    <div class="col-reps">{{ ex.reps }}</div>
                    <div class="col-rest">{{ ex.rest }}</div>
                    <div class="col-notes">{{ ex.notes || '-' }}</div>
                  </ng-container>

                  <!-- Edit Mode -->
                  <ng-container *ngIf="isEditing()">
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
                  </ng-container>
                </div>

                <!-- Progressive Overload View -->
                <div class="progressive-overload-view" *ngIf="!isEditing() && ex.weekConfigs && ex.weekConfigs.length > 0">
                    <div class="po-badge" *ngFor="let po of ex.weekConfigs">
                        <span class="weeks">Sem {{ po.startWeek }}-{{ po.endWeek }}:</span>
                        <span class="val">{{ po.sets }}x{{ po.reps }} ({{ po.rest }})</span>
                    </div>
                </div>

                <!-- Progressive Overload Edit -->
                <div class="progressive-overload-edit" *ngIf="isEditing()">
                    <div class="po-header">
                        <span>Sobrecarga Progresiva</span>
                        <button class="btn-add-po" (click)="addProgressiveOverload(day.id!, exIndex)">
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
                                <div class="input-group">
                                    <label>Descanso</label>
                                    <input type="text" [(ngModel)]="po.rest">
                                </div>
                            </div>
                            <button class="btn-remove-po" (click)="removeProgressiveOverload(day.id!, exIndex, poIndex)">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ng-template #loadingTpl>
      <div class="loading-container">
        Cargando detalles de la rutina...
      </div>
    </ng-template>
  `,
  styleUrls: ['./routine-detail.component.scss']
})
export class RoutineDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private routineService = inject(RoutineService);
  private authService = inject(AuthService);
  private pdfService = inject(PdfService);
  private clientService = inject(ClientService);
  private coachService = inject(CoachService);
  private toastService = inject(ToastService);
  private confirmService = inject(ConfirmService);

  routine = signal<RoutineWithDays | null>(null);
  generatingPdf = signal<boolean>(false);

  isEditing = signal<boolean>(false);
  showGlobalConfig = signal(false);

  totalExercisesCount = computed(() => {
    const routine = this.routine();
    if (!routine) return 0;
    return routine.days.reduce((total, day) => total + day.exercises.length, 0);
  });

  // Global Config Form
  globalWeekConfigsForm = new FormGroup({
    configs: new FormArray([])
  });

  get globalWeekConfigsArray() {
    return this.globalWeekConfigsForm.get('configs') as FormArray;
  }
  saving = signal<boolean>(false);
  originalRoutine: RoutineWithDays | null = null;

  async ngOnInit() {
    console.log('RoutineDetailComponent initialized');
    const routineId = this.route.snapshot.paramMap.get('id');
    // Check for coachId in query params (for admin mode)
    const queryCoachId = this.route.snapshot.queryParamMap.get('coachId');
    const coachId = queryCoachId || this.authService.getCurrentUserId();

    if (routineId && coachId) {
      try {
        const data = await this.routineService.getRoutineWithDays(coachId, routineId);
        // Ensure exercises is an array (fix for previous data corruption)
        if (data && data.days) {
          data.days.forEach(day => {
            if (!Array.isArray(day.exercises)) {
              day.exercises = [];
            }
          });
        }
        this.routine.set(data);
        console.log('Routine loaded:', data);
      } catch (error) {
        console.error('Error loading routine:', error);
      }
    }
  }

  toggleEditMode() {
    console.log('Toggling edit mode. Current:', this.isEditing());
    if (!this.isEditing()) {
      // Enter edit mode: clone current routine to original for rollback
      this.originalRoutine = JSON.parse(JSON.stringify(this.routine()));
      this.isEditing.set(true);
    }
  }

  cancelEdit() {
    // Revert changes
    if (this.originalRoutine) {
      this.routine.set(this.originalRoutine);
      this.originalRoutine = null;
    }
    this.isEditing.set(false);
  }

  async saveChanges() {
    const routine = this.routine();
    const queryCoachId = this.route.snapshot.queryParamMap.get('coachId');
    const coachId = queryCoachId || this.authService.getCurrentUserId();

    if (!routine || !coachId) return;

    this.saving.set(true);
    try {
      // Update each day that has changes
      // For simplicity, we'll update all days since we don't track dirty state per day yet
      // Update routine metadata (name, objective)
      await this.routineService.updateRoutine(coachId, routine.id!, {
        name: routine.name,
        objective: routine.objective
      });

      // Update each day that has changes
      // For simplicity, we'll update all days since we don't track dirty state per day yet
      const updatePromises = routine.days.map(day =>
        this.routineService.updateTrainingDay(coachId, routine.id!, day.id!, {
          exercises: day.exercises
        })
      );

      await Promise.all(updatePromises);

      this.isEditing.set(false);
      this.originalRoutine = null;
      // Optional: Show success message
    } catch (error) {
      console.error('Error saving routine:', error);
      this.toastService.error('Error al guardar los cambios');
    } finally {
      this.saving.set(false);
    }
  }

  async downloadPdf() {
    const routine = this.routine();
    const queryCoachId = this.route.snapshot.queryParamMap.get('coachId');
    const coachId = queryCoachId || this.authService.getCurrentUserId();

    if (!routine || !coachId) return;

    this.generatingPdf.set(true);
    try {
      const [client, coach] = await Promise.all([
        this.clientService.getClient(coachId, routine.clientId),
        this.coachService.getCoachProfile(coachId)
      ]);

      if (client && coach) {
        console.log('Generating PDF with Coach Data:', coach);
        console.log('Coach Brand Color:', coach.brandColor);
        console.log('Coach Logo URL:', coach.logoUrl);
        await this.pdfService.generateRoutinePDF(routine, client, coach);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      this.toastService.error('Error al generar el PDF');
    } finally {
      this.generatingPdf.set(false);
    }
  }

  async deleteRoutine() {
    const routine = this.routine();
    const queryCoachId = this.route.snapshot.queryParamMap.get('coachId');
    const coachId = queryCoachId || this.authService.getCurrentUserId();

    if (!routine || !coachId) return;

    const confirmed = await this.confirmService.confirm({
      title: '¿Eliminar rutina?',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (confirmed) {
      this.saving.set(true);
      try {
        await this.routineService.deleteRoutine(coachId, routine.id!);
        this.toastService.success('Rutina eliminada');
        // Navigate back
        if (queryCoachId) {
          this.router.navigate(['/admin/clients', queryCoachId, routine.clientId]);
        } else {
          this.router.navigate(['../../'], { relativeTo: this.route });
        }
      } catch (error) {
        console.error('Error deleting routine:', error);
        this.toastService.error('Error al eliminar la rutina');
        this.saving.set(false);
      }
    }
  }

  addProgressiveOverload(dayId: string, exIndex: number) {
    const routine = this.routine();
    if (!routine) return;

    const day = routine.days.find(d => d.id === dayId);
    if (!day) return;

    const exercise = day.exercises[exIndex];
    if (!exercise.weekConfigs) {
      exercise.weekConfigs = [];
    }

    exercise.weekConfigs.push({
      startWeek: 1,
      endWeek: 4,
      sets: exercise.sets,
      reps: exercise.reps,
      rest: exercise.rest
    });
  }

  removeProgressiveOverload(dayId: string, exIndex: number, poIndex: number) {
    const routine = this.routine();
    if (!routine) return;

    const day = routine.days.find(d => d.id === dayId);
    if (!day) return;

    const exercise = day.exercises[exIndex];
    if (exercise.weekConfigs) {
      exercise.weekConfigs.splice(poIndex, 1);
    }
  }

  toggleGlobalConfig() {
    this.showGlobalConfig.set(!this.showGlobalConfig());
  }

  addGlobalWeekConfig() {
    const lastConfig = this.globalWeekConfigsArray.length > 0
      ? this.globalWeekConfigsArray.at(this.globalWeekConfigsArray.length - 1).value
      : null;

    const nextStartWeek = lastConfig ? (parseInt(lastConfig.endWeek) || 0) + 1 : 1;
    const nextEndWeek = nextStartWeek + 3;

    const configGroup = new FormGroup({
      startWeek: new FormControl(nextStartWeek, Validators.required),
      endWeek: new FormControl(nextEndWeek, Validators.required),
      sets: new FormControl(3, Validators.required),
      reps: new FormControl('10-12', Validators.required),
      rest: new FormControl('60s', Validators.required),
      notes: new FormControl('')
    });
    this.globalWeekConfigsArray.push(configGroup);
  }

  removeGlobalWeekConfig(index: number) {
    this.globalWeekConfigsArray.removeAt(index);
  }

  applyGlobalProgressiveOverload() {
    const globalConfigs = this.globalWeekConfigsArray.value;
    const routine = this.routine();

    if (globalConfigs.length === 0 || !routine) {
      return;
    }

    // Deep clone routine to trigger signal update
    const updatedRoutine = { ...routine };
    updatedRoutine.days = updatedRoutine.days.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => ({
        ...ex,
        weekConfigs: JSON.parse(JSON.stringify(globalConfigs)) // Deep clone
      }))
    }));

    this.routine.set(updatedRoutine);
    this.toastService.success('Sobrecarga progresiva aplicada a todos los ejercicios');
    this.showGlobalConfig.set(false);
  }
}
