import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { RoutineService } from '../../../../../services/routine.service';
import { ExerciseService } from '../../../../../services/exercise.service';
import { AuthService } from '../../../../../services/auth.service';
import { Exercise } from '../../../../../models/exercise.model';
import { MUSCLE_GROUPS } from '../../../../../utils/muscle-groups';

@Component({
  selector: 'app-step4-exercises',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="step-container">
      <div class="header-section">
        <div>
          <h2>Seleccionar Ejercicios</h2>
          <p class="subtitle">Elige ejercicios para la rutina ({{ selectedExercises().length || 0 }} seleccionados)</p>
        </div>
        
        <div class="filters">
          <div class="search-box">
            <span class="icon">🔍</span>
            <input 
              type="text" 
              [formControl]="searchControl" 
              placeholder="Buscar ejercicios..."
            >
          </div>
          
          <select [formControl]="muscleGroupControl" class="filter-select">
            <option value="">Todos los Grupos Musculares</option>
            <option *ngFor="let group of muscleGroups" [value]="group">
              {{ group }}
            </option>
          </select>
        </div>
      </div>

      <div class="exercises-grid">
        <div 
          *ngFor="let exercise of filteredExercises()" 
          class="exercise-card"
          [class.selected]="isSelected(exercise.id!)"
          (click)="toggleExercise(exercise)"
        >
          <div class="card-image">
            <img 
              [src]="exercise.imageUrl || 'assets/placeholder-exercise.png'" 
              [alt]="exercise.name"
              onerror="this.src='https://placehold.co/300x200?text=No+Image'"
            >
            <div class="badge">{{ exercise.muscleGroup }}</div>
            <div class="check-overlay" *ngIf="isSelected(exercise.id!)">
              <span>✓</span>
            </div>
          </div>
          
          <div class="card-content">
            <h3>{{ exercise.name }}</h3>
            <p class="source-badge" [class.global]="exercise.isGlobal">
              {{ exercise.isGlobal ? 'Global' : 'Personalizado' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Auto-Assignment Preview -->
      <div class="preview-section" *ngIf="selectedExercises().length > 0">
        <h3>Vista Previa de Asignación Automática</h3>
        
        <div class="assignments-grid">
          <div *ngFor="let day of dayAssignments(); let dayIndex = index" class="day-card">
            <div class="day-header">
              <span class="day-number">Día {{ day.dayNumber }}</span>
              <span class="muscle-groups">{{ day.muscleGroups.join(', ') }}</span>
            </div>
            <div class="day-exercises">
              <div *ngFor="let ex of day.exercises; let exIndex = index" class="exercise-item">
                <div class="exercise-info">
                  <span class="name">• {{ ex.name }}</span>
                  <span class="details">{{ ex.sets }}x{{ ex.reps }}</span>
                </div>
                <button class="edit-btn" (click)="editExercise(dayIndex, exIndex, ex.data)">
                  ✏️
                </button>
              </div>
              <div *ngIf="day.exercises.length === 0" class="empty-day">
                No hay ejercicios asignados
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="unassignedExercisesCount() > 0" class="warning-box">
          ⚠️ {{ unassignedExercisesCount() }} ejercicios no están asignados a ningún día porque su grupo muscular no coincide con ninguna configuración de día.
        </div>
      </div>

      <!-- Edit Modal -->
      <div class="modal-overlay" *ngIf="editingExercise()">
        <div class="modal-content">
          <h3>Editar Detalles del Ejercicio</h3>
          <div class="form-group">
            <label>Series</label>
            <input type="number" [formControl]="editSets">
          </div>
          <div class="form-group">
            <label>Repeticiones</label>
            <input type="text" [formControl]="editReps">
          </div>
          <div class="form-group">
            <label>Descanso</label>
            <input type="text" [formControl]="editRest">
          </div>
          <div class="form-group">
            <label>Notas</label>
            <textarea [formControl]="editNotes" rows="3"></textarea>
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
  private exerciseService = inject(ExerciseService);
  private authService = inject(AuthService);

  muscleGroups = MUSCLE_GROUPS;

  // Filters
  searchControl = new FormControl('');
  muscleGroupControl = new FormControl('');

  searchQuery = toSignal(
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged()
    ),
    { initialValue: '' }
  );

  selectedMuscleGroup = toSignal(
    this.muscleGroupControl.valueChanges,
    { initialValue: '' }
  );

  // Data
  allExercises = signal<Exercise[]>([]);
  selectedExercises = computed(() => this.routineService.wizardState().selectedExercises);

  filteredExercises = computed(() => {
    const query = this.searchQuery()?.toLowerCase() || '';
    const group = this.selectedMuscleGroup();

    return this.allExercises().filter(ex => {
      const matchesSearch = ex.name.toLowerCase().includes(query);
      const matchesGroup = !group || ex.muscleGroup === group;
      return matchesSearch && matchesGroup;
    });
  });

  constructor() {
    this.loadExercises();
  }

  async loadExercises() {
    const userId = this.authService.getCurrentUserId();
    const [global, coach] = await Promise.all([
      this.exerciseService.getGlobalExercises(),
      userId ? this.exerciseService.getCoachExercises(userId) : Promise.resolve([])
    ]);

    this.allExercises.set([...global, ...coach]);
  }

  isSelected(exerciseId: string): boolean {
    return this.selectedExercises().some(e => e.id === exerciseId);
  }

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
        data: e
      })),
      count: day.exercises.length
    }));
  });

  unassignedExercisesCount = computed(() => {
    const state = this.routineService.wizardState();
    const assignedCount = state.days.reduce((acc, day) => acc + day.exercises.length, 0);
    return state.selectedExercises.length - assignedCount;
  });

  // Edit State
  editingExercise = signal<{ dayIndex: number, exerciseIndex: number, data: any } | null>(null);

  // Form controls for editing
  editSets = new FormControl(3);
  editReps = new FormControl('10-12');
  editRest = new FormControl('60s');
  editNotes = new FormControl('');

  editExercise(dayIndex: number, exerciseIndex: number, exercise: any) {
    this.editingExercise.set({ dayIndex, exerciseIndex, data: exercise });
    this.editSets.setValue(exercise.sets);
    this.editReps.setValue(exercise.reps);
    this.editRest.setValue(exercise.rest);
    this.editNotes.setValue(exercise.notes || '');
  }

  cancelEdit() {
    this.editingExercise.set(null);
  }

  saveExerciseDetails() {
    const currentEdit = this.editingExercise();
    if (!currentEdit) return;

    const state = this.routineService.wizardState();
    const days = [...state.days];
    const day = { ...days[currentEdit.dayIndex] };
    const exercises = [...day.exercises];

    // Update the specific exercise
    exercises[currentEdit.exerciseIndex] = {
      ...exercises[currentEdit.exerciseIndex],
      sets: this.editSets.value || 3,
      reps: this.editReps.value || '',
      rest: this.editRest.value || '',
      notes: this.editNotes.value || ''
    };

    day.exercises = exercises;
    days[currentEdit.dayIndex] = day;

    // Update state directly (this won't trigger auto-assign because we're not changing selectedExercises)
    this.routineService.updateWizardState({ days });
    this.editingExercise.set(null);
  }

  toggleExercise(exercise: Exercise) {
    const currentSelected = this.selectedExercises();
    const index = currentSelected.findIndex(e => e.id === exercise.id);

    let newSelected: Exercise[];
    if (index === -1) {
      newSelected = [...currentSelected, exercise];
    } else {
      newSelected = currentSelected.filter(e => e.id !== exercise.id);
    }

    // Update state with selected exercises
    this.routineService.updateWizardState({ selectedExercises: newSelected });

    // Trigger auto-assignment
    this.routineService.autoAssignExercises();
  }

}
