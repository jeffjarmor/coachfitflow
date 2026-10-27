import { ListPaginationComponent } from '../../shared/list-pagination.component';
import { createListPagination } from '../../shared/list-pagination';
import { CustomSelectComponent } from '../../shared/custom-select.component';

import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, ExerciseItem } from '../../core/data/coach-data.service';
import { getExerciseImage, MUSCLE_GROUPS } from './exercise-images';
import { isGlobalExerciseImageUrl, resolveGlobalExerciseImage } from '../../shared/global-exercise-media';

type ExerciseTab = 'global' | 'coach';

@Component({
  selector: 'app-exercise-library',
  standalone: true,
  imports: [ListPaginationComponent, FormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './exercise-library.component.html',
  styleUrl: './exercise-library.component.scss'
})
export class ExerciseLibraryComponent implements OnInit {
  readonly pagination = createListPagination(() => this.filteredExercises(), () => JSON.stringify([this.query(), this.selectedMuscleGroup(), this.activeTab()]));

  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly route = inject(ActivatedRoute);

  readonly gymId = this.route.snapshot.paramMap.get('gymId') || '';
  readonly libraryRoute = this.gymId ? `/gym/${this.gymId}/exercises` : '/exercises';
  canEditExercise(exercise: ExerciseItem): boolean { return exercise.source === 'coach' && exercise.coachId === this.auth.user()?.id; }
  readonly loading = signal(true);
  readonly deleting = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly query = signal('');
  readonly selectedMuscleGroup = signal('');
  readonly activeTab = signal<ExerciseTab>('global');
  readonly exercises = signal<ExerciseItem[]>([]);
  readonly exerciseToDelete = signal<ExerciseItem | null>(null);
  readonly muscleGroups = MUSCLE_GROUPS;

  readonly globalCount = computed(() => this.exercises().filter((exercise) => exercise.source === 'global').length);
  readonly coachCount = computed(() => this.exercises().filter((exercise) => exercise.source === 'coach').length);
  readonly filtersActive = computed(() => !!this.query().trim() || !!this.selectedMuscleGroup());
  readonly filteredExercises = computed(() => {
    const query = this.query().trim().toLocaleLowerCase('es');
    const group = this.selectedMuscleGroup();
    return this.exercises().filter((exercise) => {
      const matchesTab = exercise.source === this.activeTab();
      const matchesGroup = !group || exercise.muscleGroup === group;
      const text = `${exercise.name} ${exercise.description || ''}`.toLocaleLowerCase('es');
      return matchesTab && matchesGroup && (!query || text.includes(query));
    });
  });

  async ngOnInit(): Promise<void> {
    const result = this.route.snapshot.queryParamMap.get('result');
    if (result === 'created') {
      this.activeTab.set('coach');
      this.success.set('El ejercicio se agregó a tu biblioteca.');
    } else if (result === 'updated') {
      this.activeTab.set('coach');
      this.success.set('Los cambios del ejercicio se guardaron.');
    }
    await this.load();
  }

  async load(): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId) {
      this.error.set('Tu sesión terminó. Inicia sesión nuevamente.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      this.exercises.set(await this.coachData.getExercises(coachId, this.gymId || undefined));
    } catch {
      this.exercises.set([]);
      this.error.set('No pudimos cargar la biblioteca. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  setActiveTab(tab: ExerciseTab): void {
    this.activeTab.set(tab);
    this.success.set('');
  }

  clearFilters(): void {
    this.query.set('');
    this.selectedMuscleGroup.set('');
  }

  imageFor(exercise: ExerciseItem): string {
    return resolveGlobalExerciseImage(exercise) || exercise.imageUrl?.trim() || getExerciseImage(exercise.muscleGroup);
  }

  isGlobalAnimation(exercise: ExerciseItem): boolean {
    return exercise.source === 'global' && isGlobalExerciseImageUrl(this.imageFor(exercise));
  }

  onImageError(event: Event, exercise: ExerciseItem): void {
    const image = event.target as HTMLImageElement;
    const fallback = getExerciseImage(exercise.muscleGroup);
    if (image.src !== fallback) image.src = fallback;
  }

  requestDelete(exercise: ExerciseItem): void {
    this.exerciseToDelete.set(exercise);
  }

  closeDeleteDialog(): void {
    if (!this.deleting()) this.exerciseToDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const exercise = this.exerciseToDelete();
    const coachId = this.auth.user()?.id;
    if (!exercise || !coachId || this.deleting()) return;

    this.deleting.set(true);
    this.error.set('');
    try {
      await this.coachData.deleteCoachExercise(exercise.id, coachId);
      this.exercises.update((items) => items.filter((item) => item.id !== exercise.id));
      this.exerciseToDelete.set(null);
      this.success.set('El ejercicio se eliminó de tu biblioteca.');
    } catch {
      this.exerciseToDelete.set(null);
      this.error.set('No pudimos eliminar el ejercicio. Inténtalo nuevamente.');
    } finally {
      this.deleting.set(false);
    }
  }
}
