import { Component, inject, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RoutineService } from '../../../../../services/routine.service';
import { ExerciseService } from '../../../../../services/exercise.service';
import { AuthService } from '../../../../../services/auth.service';
import { MUSCLE_GROUPS } from '../../../../../utils/muscle-groups';
import { Exercise } from '../../../../../models/exercise.model';

@Component({
  selector: 'app-step3-muscle-groups',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="step-container">
      <h2>Planificación de la Rutina</h2>
      <p class="subtitle">Selecciona los grupos musculares y ejercicios para cada día</p>

      <div class="days-grid">
        <div *ngFor="let day of days(); let dayIndex = index" class="day-card">
          <div class="day-header">
            <h3>Día {{ dayIndex + 1 }}</h3>
            <span class="badge" *ngIf="day.exercises.length > 0">
              {{ day.exercises.length }} Ejercicios
            </span>
          </div>

          <!-- Muscle Groups Selection -->
          <div class="section-title">Grupos Musculares</div>
          <div class="muscle-groups">
            <div 
              *ngFor="let group of muscleGroups" 
              class="muscle-chip"
              [class.selected]="day.muscleGroups.includes(group)"
              [class.disabled]="day.muscleGroups.includes(group)"
              (click)="toggleMuscleGroup(dayIndex, group)"
              [title]="day.muscleGroups.includes(group) ? 'Ya seleccionado - click para remover' : 'Click para agregar'"
            >
              {{ group }}
            </div>
          </div>

          <!-- Selected Exercises List -->
          <div class="selected-exercises-list" *ngIf="day.exercises.length > 0">
            <div class="section-title">Ejercicios Seleccionados</div>
            <div *ngFor="let ex of day.exercises; let exIndex = index" class="selected-exercise-item">
                <span class="name">{{ ex.exercise.name }}</span>
                <button class="btn-remove" (click)="removeExercise(dayIndex, exIndex)">×</button>
            </div>
          </div>

          <!-- Available Exercises Selection -->
          <div class="available-exercises-section" *ngIf="day.muscleGroups.length > 0">
            <div class="section-title">Agregar Ejercicios ({{ getExercisesForDay(day.muscleGroups).length }})</div>
            <div class="exercises-scroll-grid">
                <div 
                    *ngFor="let exercise of getExercisesForDay(day.muscleGroups)" 
                    class="exercise-mini-card"
                    [class.added]="isExerciseInDay(dayIndex, exercise.id!)"
                    (click)="toggleExerciseInDay(dayIndex, exercise)"
                >
                    <div class="mini-image">
                        <img 
                            [src]="exercise.imageUrl || 'assets/placeholder-exercise.png'" 
                            [alt]="exercise.name"
                            onerror="this.src='https://placehold.co/100x100?text=Ex'"
                        >
                    </div>
                    <div class="mini-content">
                        <span class="mini-name">{{ exercise.name }}</span>
                        <span class="mini-group">{{ exercise.muscleGroup }}</span>
                    </div>
                    <div class="check-indicator" *ngIf="isExerciseInDay(dayIndex, exercise.id!)">✓</div>
                </div>
                <div *ngIf="getExercisesForDay(day.muscleGroups).length === 0" class="empty-exercises">
                    No hay ejercicios disponibles para los grupos seleccionados.
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./step3-muscle-groups.component.scss']
})
export class Step3MuscleGroupsComponent implements OnInit {
  private routineService = inject(RoutineService);
  private exerciseService = inject(ExerciseService);
  private authService = inject(AuthService);

  muscleGroups = MUSCLE_GROUPS;
  days = computed(() => this.routineService.wizardState().days);

  // Local state for exercises
  allExercises = signal<Exercise[]>([]);

  ngOnInit() {
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

  toggleMuscleGroup(dayIndex: number, group: string) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const groups = [...day.muscleGroups];

    if (groups.includes(group)) {
      day.muscleGroups = groups.filter(g => g !== group);
    } else {
      day.muscleGroups = [...groups, group];
    }

    currentDays[dayIndex] = day;
    this.routineService.updateWizardState({ days: currentDays });
  }

  getExercisesForDay(muscleGroups: string[]): Exercise[] {
    if (!muscleGroups || muscleGroups.length === 0) return [];
    return this.allExercises().filter(ex => muscleGroups.includes(ex.muscleGroup));
  }

  isExerciseInDay(dayIndex: number, exerciseId: string): boolean {
    const day = this.days()[dayIndex];
    return day.exercises.some(e => e.exercise.id === exerciseId);
  }

  toggleExerciseInDay(dayIndex: number, exercise: Exercise) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const currentExercises = [...day.exercises];

    const existingIndex = currentExercises.findIndex(e => e.exercise.id === exercise.id);

    if (existingIndex !== -1) {
      // Remove
      currentExercises.splice(existingIndex, 1);
    } else {
      // Add
      currentExercises.push({
        exercise: exercise,
        sets: 3, // Default
        reps: '10-12', // Default
        rest: '60s', // Default
        isSuperset: false,
        order: currentExercises.length
      });
    }

    day.exercises = currentExercises;
    currentDays[dayIndex] = day;

    // Update state
    // We also need to update selectedExercises list for compatibility with other steps if needed, 
    // but in this new flow, days.exercises is the source of truth.
    // However, the routine service might rely on selectedExercises for some logic.
    // Let's update selectedExercises as a flat list of all exercises used.

    const allSelected = new Set<string>();
    currentDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));

    // We need the full exercise objects for selectedExercises
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({
      days: currentDays,
      selectedExercises: newSelectedExercises
    });
  }

  removeExercise(dayIndex: number, exerciseIndex: number) {
    const currentDays = [...this.routineService.wizardState().days];
    const day = { ...currentDays[dayIndex] };
    const currentExercises = [...day.exercises];

    currentExercises.splice(exerciseIndex, 1);
    day.exercises = currentExercises;
    currentDays[dayIndex] = day;

    // Update selectedExercises as well
    const allSelected = new Set<string>();
    currentDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({
      days: currentDays,
      selectedExercises: newSelectedExercises
    });
  }
}
