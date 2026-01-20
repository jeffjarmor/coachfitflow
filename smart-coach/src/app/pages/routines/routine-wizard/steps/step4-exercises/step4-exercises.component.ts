import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, FormArray, FormGroup, Validators } from '@angular/forms';
import { RoutineService } from '../../../../../services/routine.service';
import { Exercise } from '../../../../../models/exercise.model';

@Component({
  selector: 'app-step4-exercises',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="step-container">
      <div class="header-section">
        <div>
          <h2>Configurar Ejercicios</h2>
          <p class="subtitle">Define series, repeticiones y sobrecarga progresiva para cada ejercicio</p>
        </div>
      </div>

      <!-- Global Progressive Overload Section -->
      <div class="global-progressive-overload-section">
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
                <div class="config-grid config-grid-compact">
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
                    <label>Descanso (min)</label>
                    <input type="number" formControlName="rest" placeholder="1.5" step="0.5" min="0.5">
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

      <!-- Mobile: Day Progress Indicator -->
      <div class="day-progress-mobile">
        <div class="progress-dots">
          <div 
            *ngFor="let day of dayAssignments(); let i = index" 
            class="progress-dot"
            [class.active]="i === currentDayIndex()"
            [class.completed]="day.exercises.length > 0"
            (click)="goToDay(i)"
          >
            <span class="dot-number">{{ i + 1 }}</span>
          </div>
        </div>
      </div>

      <!-- Assignments List (Desktop: All days) -->
      <div class="preview-section">
        <div class="assignments-grid assignments-grid-desktop">
          <div *ngFor="let day of dayAssignments(); let dayIndex = index" class="day-card">
            <div class="day-header">
              <span class="day-title">Día {{ day.dayNumber }}</span>
              <div class="muscle-tags">
                  <span *ngFor="let group of day.muscleGroups" class="tag">{{ group }}</span>
              </div>
            </div>
            
            <div class="day-exercises">
              <div *ngFor="let ex of day.exercises; let exIndex = index" class="exercise-item">
                <div class="exercise-content">
                    <div class="exercise-main">
                        <span class="exercise-name">{{ ex.name }}</span>
                        <button class="btn-edit-icon" (click)="editExercise(dayIndex, exIndex, ex.data)" title="Editar detalles">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                    
                    <div class="exercise-details">
                        <ng-container *ngIf="ex.weekConfigs && ex.weekConfigs.length > 0; else defaultDetails">
                            <div class="progressive-overload-preview">
                                <div *ngFor="let config of ex.weekConfigs" class="week-badge">
                                    <span class="weeks">Sem {{ config.startWeek }}-{{ config.endWeek }}:</span>
                                    <span class="val">{{ config.sets }}x{{ config.reps }}</span>
                                </div>
                            </div>
                        </ng-container>
                        <ng-template #defaultDetails>
                            <span class="detail-pill">
                                <span class="label">Series:</span> {{ ex.sets }}
                            </span>
                            <span class="detail-pill">
                                <span class="label">Reps:</span> {{ ex.reps }}
                            </span>
                        </ng-template>
                    </div>
                </div>
              </div>
              <div *ngIf="day.exercises.length === 0" class="empty-day">
                <p>No hay ejercicios asignados para este día. Vuelve al paso anterior para agregar ejercicios.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Mobile: Single day view -->
        <div class="assignments-grid assignments-grid-mobile">
          <div *ngIf="dayAssignments()[currentDayIndex()] as day" class="day-card">
            <div class="day-header">
              <span class="day-title">Día {{ day.dayNumber }} de {{ dayAssignments().length }}</span>
              <div class="muscle-tags">
                  <span *ngFor="let group of day.muscleGroups" class="tag">{{ group }}</span>
              </div>
            </div>
            
            <div class="day-exercises">
              <div *ngFor="let ex of day.exercises; let exIndex = index" class="exercise-item">
                <div class="exercise-content">
                    <div class="exercise-main">
                        <span class="exercise-name">{{ ex.name }}</span>
                        <button class="btn-edit-icon" (click)="editExercise(currentDayIndex(), exIndex, ex.data)" title="Editar detalles">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                    
                    <div class="exercise-details">
                        <ng-container *ngIf="ex.weekConfigs && ex.weekConfigs.length > 0; else defaultDetails">
                            <div class="progressive-overload-preview">
                                <div *ngFor="let config of ex.weekConfigs" class="week-badge">
                                    <span class="weeks">Sem {{ config.startWeek }}-{{ config.endWeek }}:</span>
                                    <span class="val">{{ config.sets }}x{{ config.reps }}</span>
                                </div>
                            </div>
                        </ng-container>
                        <ng-template #defaultDetails>
                            <span class="detail-pill">
                                <span class="label">Series:</span> {{ ex.sets }}
                            </span>
                            <span class="detail-pill">
                                <span class="label">Reps:</span> {{ ex.reps }}
                            </span>
                        </ng-template>
                    </div>
                </div>
              </div>
              <div *ngIf="day.exercises.length === 0" class="empty-day">
                <p>No hay ejercicios asignados para este día. Vuelve al paso anterior para agregar ejercicios.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile: Navigation Buttons -->
      <div class="day-navigation-mobile">
        <button 
          class="nav-btn prev-btn" 
          [disabled]="currentDayIndex() === 0"
          (click)="prevDay()"
        >
          <span class="arrow">←</span>
          <span class="text">Anterior</span>
        </button>
        
        <button 
          class="nav-btn next-btn" 
          [disabled]="currentDayIndex() === dayAssignments().length - 1"
          (click)="nextDay()"
        >
          <span class="text">Siguiente</span>
          <span class="arrow">→</span>
        </button>
      </div>

      <!-- Edit Modal -->
      <div class="modal-overlay" *ngIf="editingExercise()">
        <div class="modal-content">
          <h3>Editar Detalles del Ejercicio</h3>
          
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                  <label>Series (Base)</label>
                  <input type="number" [formControl]="editSets">
              </div>
              <div class="form-group">
                  <label>Repeticiones (Base)</label>
                  <input type="text" [formControl]="editReps">
              </div>
            </div>
            <div class="form-group">
                <label>Descanso (minutos)</label>
                <input type="number" [formControl]="editRest" placeholder="1.5" step="0.5" min="0.5">
            </div>
            <div class="form-group">
                <label>Notas</label>
                <textarea [formControl]="editNotes" rows="2"></textarea>
            </div>

            <!-- Progressive Overload Section -->
            <div class="progressive-overload-section">
                <div class="section-header">
                    <h4>Sobrecarga Progresiva (Opcional)</h4>
                    <button class="btn-add" (click)="addWeekConfig()">+ Agregar Rango</button>
                </div>
                
                <div class="week-configs" [formGroup]="weekConfigsForm">
                    <div formArrayName="configs">
                        <div *ngFor="let config of weekConfigsArray.controls; let i = index" [formGroupName]="i" class="week-config-row">
                            <div class="config-grid-modal">
                                <div class="input-group small">
                                    <label>Sem Inicio</label>
                                    <input type="number" formControlName="startWeek">
                                </div>
                                <div class="input-group small">
                                    <label>Sem Fin</label>
                                    <input type="number" formControlName="endWeek">
                                </div>
                                <div class="input-group small">
                                    <label>Series</label>
                                    <input type="number" formControlName="sets">
                                </div>
                                <div class="input-group small">
                                    <label>Reps</label>
                                    <input type="text" formControlName="reps">
                                </div>
                            </div>
                            <button class="btn-remove" (click)="removeWeekConfig(i)">🗑️</button>
                        </div>
                    </div>
                    <div *ngIf="weekConfigsArray.length === 0" class="empty-configs">
                        <p>No hay configuraciones por semana. Se usarán los valores base.</p>
                    </div>
                </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" (click)="cancelEdit()">Cancelar</button>
            <button class="btn-save" (click)="saveExerciseDetails()">Guardar</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./step4-exercises.component.scss']
})
export class Step4ExercisesComponent {
  private routineService = inject(RoutineService);

  // Mobile navigation: current day being viewed
  currentDayIndex = signal(0);

  // Computed for preview
  dayAssignments = computed(() => {
    const state = this.routineService.wizardState();
    return state.days.map((day, index) => ({
      dayNumber: index + 1,
      muscleGroups: day.muscleGroups,
      exercises: day.exercises.map(e => ({
        name: e.exercise.name,
        sets: e.sets,
        reps: e.reps,
        weekConfigs: e.weekConfigs,
        data: e
      })),
      count: day.exercises.length
    }));
  });

  // Edit State
  editingExercise = signal<{ dayIndex: number, exerciseIndex: number, data: any } | null>(null);

  // Global Progressive Overload State
  showGlobalConfig = signal(false);

  // Computed: total exercises count across all days
  totalExercisesCount = computed(() => {
    const state = this.routineService.wizardState();
    return state.days.reduce((total, day) => total + day.exercises.length, 0);
  });

  // Form controls for editing individual exercise
  editSets = new FormControl(3);
  editReps = new FormControl('10-12');
  editRest = new FormControl(1.0); // Changed to minutes
  editNotes = new FormControl('');

  // Form group for individual exercise week configs
  weekConfigsForm = new FormGroup({
    configs: new FormArray([])
  });

  // Form group for global week configs
  globalWeekConfigsForm = new FormGroup({
    configs: new FormArray([])
  });

  get weekConfigsArray() {
    return this.weekConfigsForm.get('configs') as FormArray;
  }

  get globalWeekConfigsArray() {
    return this.globalWeekConfigsForm.get('configs') as FormArray;
  }

  // Toggle global config section
  toggleGlobalConfig() {
    this.showGlobalConfig.set(!this.showGlobalConfig());
  }

  // Navigate to next day
  nextDay() {
    const totalDays = this.dayAssignments().length;
    if (this.currentDayIndex() < totalDays - 1) {
      this.currentDayIndex.set(this.currentDayIndex() + 1);
    }
  }

  // Navigate to previous day
  prevDay() {
    if (this.currentDayIndex() > 0) {
      this.currentDayIndex.set(this.currentDayIndex() - 1);
    }
  }

  // Jump to specific day
  goToDay(index: number) {
    if (index >= 0 && index < this.dayAssignments().length) {
      this.currentDayIndex.set(index);
    }
  }

  editExercise(dayIndex: number, exerciseIndex: number, exercise: any) {
    this.editingExercise.set({ dayIndex, exerciseIndex, data: exercise });
    this.editSets.setValue(exercise.sets);
    this.editReps.setValue(exercise.reps);
    this.editRest.setValue(exercise.rest);
    this.editNotes.setValue(exercise.notes || '');

    // Clear and populate week configs
    this.weekConfigsArray.clear();
    if (exercise.weekConfigs && exercise.weekConfigs.length > 0) {
      exercise.weekConfigs.forEach((config: any) => {
        this.addWeekConfig(config);
      });
    }
  }

  addWeekConfig(data?: any) {
    const configGroup = new FormGroup({
      startWeek: new FormControl(data?.startWeek || 1, Validators.required),
      endWeek: new FormControl(data?.endWeek || 4, Validators.required),
      sets: new FormControl(data?.sets || 3, Validators.required),
      reps: new FormControl(data?.reps || '10', Validators.required),
      rest: new FormControl(data?.rest || 1.0, Validators.required), // Changed to minutes
      notes: new FormControl(data?.notes || '')
    });
    this.weekConfigsArray.push(configGroup);
  }

  removeWeekConfig(index: number) {
    this.weekConfigsArray.removeAt(index);
  }

  // Global week config methods
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
      rest: new FormControl(1.0, Validators.required), // Changed to minutes
      notes: new FormControl('')
    });
    this.globalWeekConfigsArray.push(configGroup);
  }

  removeGlobalWeekConfig(index: number) {
    this.globalWeekConfigsArray.removeAt(index);
  }

  applyGlobalProgressiveOverload() {
    const globalConfigs = this.globalWeekConfigsArray.value;

    if (globalConfigs.length === 0) {
      return;
    }

    const state = this.routineService.wizardState();
    const updatedDays = state.days.map(day => ({
      ...day,
      exercises: day.exercises.map(ex => ({
        ...ex,
        weekConfigs: JSON.parse(JSON.stringify(globalConfigs)) // Deep clone
      }))
    }));

    this.routineService.updateWizardState({ days: updatedDays });
  }

  cancelEdit() {
    this.editingExercise.set(null);
    this.weekConfigsArray.clear();
  }

  saveExerciseDetails() {
    const currentEdit = this.editingExercise();
    if (!currentEdit) return;

    const state = this.routineService.wizardState();
    const days = [...state.days];
    const day = { ...days[currentEdit.dayIndex] };
    const exercises = [...day.exercises];

    // Get week configs values
    const weekConfigs = this.weekConfigsArray.value;

    // Update the specific exercise
    exercises[currentEdit.exerciseIndex] = {
      ...exercises[currentEdit.exerciseIndex],
      sets: this.editSets.value || 3,
      reps: this.editReps.value || '',
      rest: this.editRest.value?.toString() || '1.0',
      notes: this.editNotes.value || '',
      weekConfigs: weekConfigs.length > 0 ? weekConfigs : undefined
    };

    day.exercises = exercises;
    days[currentEdit.dayIndex] = day;

    // Update state directly
    this.routineService.updateWizardState({ days });
    this.editingExercise.set(null);
    this.weekConfigsArray.clear();
  }
}
