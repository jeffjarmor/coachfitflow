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

      <!-- Mobile: Day Progress Indicator -->
      <div class="day-progress-mobile">
        <div class="progress-dots">
          <div 
            *ngFor="let day of days(); let i = index" 
            class="progress-dot"
            [class.active]="i === currentDayIndex()"
            [class.completed]="day.exercises.length > 0"
            (click)="goToDay(i)"
          >
            <span class="dot-number">{{ i + 1 }}</span>
          </div>
        </div>
      </div>

      <!-- Desktop: All days grid -->
      <div class="days-grid days-grid-desktop">
        <div *ngFor="let day of days(); let dayIndex = index" class="day-card">
          <div class="day-header">
            <h3>Día {{ dayIndex + 1 }}</h3>
            <div class="day-header-right">
              <span class="badge" *ngIf="day.exercises.length > 0">
                {{ day.exercises.length }} Ejercicios
              </span>
              <button
                *ngIf="day.exercises.length > 0"
                class="btn-copy-day"
                (click)="openCopyModal(dayIndex)"
                title="Copiar este día a otros días"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copiar día
              </button>
            </div>
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
            <div class="section-title">Agregar Ejercicios</div>
            
            <!-- Single muscle group: simple view -->
            <div *ngIf="day.muscleGroups.length === 1" class="exercises-scroll-grid">
                <div 
                    *ngFor="let exercise of getExercisesForDay(day.muscleGroups)" 
                    class="exercise-mini-card"
                    [class.added]="isExerciseInDay(dayIndex, exercise.id!)"
                    (mousedown)="toggleExerciseInDay(dayIndex, exercise, $event)"
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

            <!-- Multiple muscle groups: accordion view -->
            <div *ngIf="day.muscleGroups.length > 1" class="muscle-group-accordions">
              <div *ngFor="let group of day.muscleGroups" class="accordion-item">
                <div class="accordion-header" (click)="toggleGroupAccordion(group)">
                  <div class="header-left">
                    <span class="group-name">{{ group }}</span>
                    <span class="exercise-count">({{ getExercisesForGroup(group).length }} ejercicios)</span>
                  </div>
                  <span class="toggle-icon">{{ expandedGroups().has(group) ? '▼' : '▶' }}</span>
                </div>
                
                <div class="accordion-content" *ngIf="expandedGroups().has(group)">
                  <div class="search-box">
                    <input 
                      type="text"
                      placeholder="🔍 Buscar ejercicio..."
                      [value]="searchTerms().get(group) || ''"
                      (input)="updateSearchTerm(group, $any($event.target).value)"
                    />
                  </div>
                  
                  <div class="exercises-scroll-grid">
                    <div *ngFor="let exercise of getFilteredExercisesForGroup(group, dayIndex)"
                         class="exercise-mini-card"
                         [class.added]="isExerciseInDay(dayIndex, exercise.id!)"
                         (mousedown)="toggleExerciseInDay(dayIndex, exercise, $event)">
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
                    <div *ngIf="getFilteredExercisesForGroup(group, dayIndex).length === 0" class="empty-exercises">
                        {{ searchTerms().get(group) ? 'No se encontraron ejercicios' : 'No hay ejercicios disponibles' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Copy Day Modal -->
      <div class="modal-overlay" *ngIf="copyingFromDayIndex() !== null" (click)="closeCopyModal()">
        <div class="modal-content copy-day-modal" (click)="$event.stopPropagation()">
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copiar Día {{ (copyingFromDayIndex() ?? 0) + 1 }} a…
          </h3>
          <p class="copy-modal-subtitle">Selecciona los días destino. Su contenido será reemplazado.</p>
          <div class="copy-day-list">
            <div
              *ngFor="let day of days(); let i = index"
              class="copy-day-item"
              [class.source]="i === copyingFromDayIndex()"
              [class.has-exercises]="day.exercises.length > 0 && i !== copyingFromDayIndex()"
            >
              <label class="copy-day-label">
                <input
                  type="checkbox"
                  [disabled]="i === copyingFromDayIndex()"
                  [checked]="selectedTargetDays().has(i)"
                  (change)="toggleTargetDay(i)"
                />
                <span class="copy-day-name">Día {{ i + 1 }}</span>
                <span class="copy-day-muscles" *ngIf="day.muscleGroups.length > 0">
                  {{ day.muscleGroups.join(', ') }}
                </span>
                <span class="copy-day-badge source-badge" *ngIf="i === copyingFromDayIndex()">Origen</span>
                <span class="copy-day-badge replace-badge" *ngIf="day.exercises.length > 0 && i !== copyingFromDayIndex() && selectedTargetDays().has(i)">Se reemplazará</span>
              </label>
            </div>
          </div>
          <div class="copy-modal-actions">
            <button class="btn-cancel" (click)="closeCopyModal()">Cancelar</button>
            <button
              class="btn-save"
              [disabled]="selectedTargetDays().size === 0"
              (click)="confirmCopy()"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copiar ({{ selectedTargetDays().size }})
            </button>
          </div>
        </div>
      </div>

      <!-- Mobile: Single day view -->
      <div class="days-grid days-grid-mobile">
        <div *ngIf="days()[currentDayIndex()] as day" class="day-card">
          <div class="day-header">
            <h3>Día {{ currentDayIndex() + 1 }} de {{ days().length }}</h3>
            <div class="day-header-right">
              <span class="badge" *ngIf="day.exercises.length > 0">
                {{ day.exercises.length }} Ejercicios
              </span>
              <button
                *ngIf="day.exercises.length > 0"
                class="btn-copy-day"
                (click)="openCopyModal(currentDayIndex())"
                title="Copiar este día a otros días"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copiar
              </button>
            </div>
          </div>

          <!-- Muscle Groups Selection -->
          <div class="section-title">Grupos Musculares</div>
          <div class="muscle-groups">
            <div 
              *ngFor="let group of muscleGroups" 
              class="muscle-chip"
              [class.selected]="day.muscleGroups.includes(group)"
              [class.disabled]="day.muscleGroups.includes(group)"
              (click)="toggleMuscleGroup(currentDayIndex(), group)"
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
                <button class="btn-remove" (click)="removeExercise(currentDayIndex(), exIndex)">×</button>
            </div>
          </div>

          <!-- Available Exercises Selection -->
          <div class="available-exercises-section" *ngIf="day.muscleGroups.length > 0">
            <div class="section-title">Agregar Ejercicios</div>
            
            <!-- Single muscle group: simple view -->
            <div *ngIf="day.muscleGroups.length === 1" class="exercises-scroll-grid">
                <div 
                    *ngFor="let exercise of getExercisesForDay(day.muscleGroups)" 
                    class="exercise-mini-card"
                    [class.added]="isExerciseInDay(currentDayIndex(), exercise.id!)"
                    (mousedown)="toggleExerciseInDay(currentDayIndex(), exercise, $event)"
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
                    <div class="check-indicator" *ngIf="isExerciseInDay(currentDayIndex(), exercise.id!)">✓</div>
                </div>
                <div *ngIf="getExercisesForDay(day.muscleGroups).length === 0" class="empty-exercises">
                    No hay ejercicios disponibles para los grupos seleccionados.
                </div>
            </div>

            <!-- Multiple muscle groups: accordion view -->
            <div *ngIf="day.muscleGroups.length > 1" class="muscle-group-accordions">
              <div *ngFor="let group of day.muscleGroups" class="accordion-item">
                <div class="accordion-header" (click)="toggleGroupAccordion(group)">
                  <div class="header-left">
                    <span class="group-name">{{ group }}</span>
                    <span class="exercise-count">({{ getExercisesForGroup(group).length }})</span>
                  </div>
                  <span class="toggle-icon">{{ expandedGroups().has(group) ? '▼' : '▶' }}</span>
                </div>
                
                <div class="accordion-content" *ngIf="expandedGroups().has(group)">
                  <div class="search-box">
                    <input 
                      type="text"
                      placeholder="🔍 Buscar ejercicio..."
                      [value]="searchTerms().get(group) || ''"
                      (input)="updateSearchTerm(group, $any($event.target).value)"
                    />
                  </div>
                  
                  <div class="exercises-scroll-grid">
                    <div *ngFor="let exercise of getFilteredExercisesForGroup(group, currentDayIndex())"
                         class="exercise-mini-card"
                         [class.added]="isExerciseInDay(currentDayIndex(), exercise.id!)"
                         (mousedown)="toggleExerciseInDay(currentDayIndex(), exercise, $event)">
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
                      <div class="check-indicator" *ngIf="isExerciseInDay(currentDayIndex(), exercise.id!)">✓</div>
                    </div>
                    <div *ngIf="getFilteredExercisesForGroup(group, currentDayIndex()).length === 0" class="empty-exercises">
                        {{ searchTerms().get(group) ? 'No se encontraron ejercicios' : 'No hay ejercicios disponibles' }}
                    </div>
                  </div>
                </div>
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
          [disabled]="currentDayIndex() === days().length - 1"
          (click)="nextDay()"
        >
          <span class="text">Siguiente</span>
          <span class="arrow">→</span>
        </button>
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

  // Copy-day modal state
  copyingFromDayIndex = signal<number | null>(null);
  selectedTargetDays = signal<Set<number>>(new Set());

  // Mobile navigation: current day being edited
  currentDayIndex = signal(0);

  // Accordion state: which muscle groups are expanded
  expandedGroups = signal<Set<string>>(new Set());

  // Search terms for each muscle group
  searchTerms = signal<Map<string, string>>(new Map());

  // Computed: check if current day is complete (has at least one exercise)
  isCurrentDayComplete = computed(() => {
    const day = this.days()[this.currentDayIndex()];
    return day && day.exercises.length > 0;
  });

  ngOnInit() {
    this.loadExercises();
  }

  // Navigate to next day
  nextDay() {
    const totalDays = this.days().length;
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
    if (index >= 0 && index < this.days().length) {
      this.currentDayIndex.set(index);
    }
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

    // Initialize expanded groups when muscle groups change
    if (day.muscleGroups.length > 1) {
      this.initializeExpandedGroups(day.muscleGroups);
    }
  }

  getExercisesForDay(muscleGroups: string[]): Exercise[] {
    if (!muscleGroups || muscleGroups.length === 0) return [];

    // Filter exercises that match the selected muscle groups
    const filteredExercises = this.allExercises().filter(ex => muscleGroups.includes(ex.muscleGroup));

    // Sort exercises by the order of muscle groups selected
    return filteredExercises.sort((a, b) => {
      const indexA = muscleGroups.indexOf(a.muscleGroup);
      const indexB = muscleGroups.indexOf(b.muscleGroup);
      return indexA - indexB;
    });
  }

  // Toggle accordion for a muscle group
  toggleGroupAccordion(group: string) {
    const expanded = new Set(this.expandedGroups());
    if (expanded.has(group)) {
      expanded.delete(group);
    } else {
      expanded.add(group);
    }
    this.expandedGroups.set(expanded);
  }

  // Update search term for a muscle group
  updateSearchTerm(group: string, term: string) {
    const terms = new Map(this.searchTerms());
    terms.set(group, term.toLowerCase());
    this.searchTerms.set(terms);
  }

  // Get exercises for a specific muscle group
  getExercisesForGroup(group: string): Exercise[] {
    return this.allExercises().filter(ex => ex.muscleGroup === group);
  }

  // Get filtered exercises for a muscle group based on search term
  getFilteredExercisesForGroup(group: string, dayIndex: number): Exercise[] {
    const exercises = this.getExercisesForGroup(group);
    const searchTerm = this.searchTerms().get(group) || '';

    if (!searchTerm) {
      return exercises;
    }

    return exercises.filter(ex =>
      ex.name.toLowerCase().includes(searchTerm)
    );
  }

  // Initialize expanded groups when muscle groups change
  initializeExpandedGroups(muscleGroups: string[]) {
    if (muscleGroups.length > 0) {
      const expanded = new Set<string>();
      expanded.add(muscleGroups[0]); // Expand first group by default
      this.expandedGroups.set(expanded);
    }
  }

  isExerciseInDay(dayIndex: number, exerciseId: string): boolean {
    const day = this.days()[dayIndex];
    return day.exercises.some(e => e.exercise.id === exerciseId);
  }

  toggleExerciseInDay(dayIndex: number, exercise: Exercise, event?: MouseEvent) {
    // Prevent default behavior and stop propagation to avoid scroll
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

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

  // --- Copy Day ---

  openCopyModal(dayIndex: number) {
    this.copyingFromDayIndex.set(dayIndex);
    this.selectedTargetDays.set(new Set());
  }

  closeCopyModal() {
    this.copyingFromDayIndex.set(null);
    this.selectedTargetDays.set(new Set());
  }

  toggleTargetDay(dayIndex: number) {
    const current = new Set(this.selectedTargetDays());
    if (current.has(dayIndex)) {
      current.delete(dayIndex);
    } else {
      current.add(dayIndex);
    }
    this.selectedTargetDays.set(current);
  }

  confirmCopy() {
    const sourceIndex = this.copyingFromDayIndex();
    const targets = this.selectedTargetDays();
    if (sourceIndex === null || targets.size === 0) return;

    const state = this.routineService.wizardState();
    const sourceDay = state.days[sourceIndex];
    const updatedDays = [...state.days];

    targets.forEach(targetIndex => {
      updatedDays[targetIndex] = {
        ...updatedDays[targetIndex],
        muscleGroups: [...sourceDay.muscleGroups],
        exercises: JSON.parse(JSON.stringify(sourceDay.exercises))
      };
    });

    // Recalculate selectedExercises
    const allSelected = new Set<string>();
    updatedDays.forEach(d => d.exercises.forEach(e => allSelected.add(e.exercise.id!)));
    const newSelectedExercises = this.allExercises().filter(e => allSelected.has(e.id!));

    this.routineService.updateWizardState({ days: updatedDays, selectedExercises: newSelectedExercises });
    this.closeCopyModal();
  }
}
