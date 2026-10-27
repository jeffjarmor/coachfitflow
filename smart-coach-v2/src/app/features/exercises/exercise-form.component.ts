import { CustomSelectComponent } from '../../shared/custom-select.component';

import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { getExerciseImage, MUSCLE_GROUPS } from './exercise-images';

@Component({
  selector: 'app-exercise-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './exercise-form.component.html',
  styleUrl: './exercise-form.component.scss'
})
export class ExerciseFormComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly imagePreview = signal(getExerciseImage('Full Body'));
  readonly muscleGroups = MUSCLE_GROUPS;
  readonly exerciseId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = !!this.exerciseId;
  readonly gymId = this.route.snapshot.paramMap.get('gymId') || '';
  readonly libraryRoute = this.gymId ? `/gym/${this.gymId}/exercises` : this.route.snapshot.data['libraryRoute'] || '/exercises';
  readonly exerciseLoaded = signal(!this.exerciseId);

  readonly exerciseForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    muscleGroup: ['', Validators.required],
    videoUrl: ['', Validators.pattern(/^https?:\/\/.+/i)],
    description: ['']
  });

  get name() { return this.exerciseForm.controls.name; }
  get muscleGroup() { return this.exerciseForm.controls.muscleGroup; }
  get videoUrl() { return this.exerciseForm.controls.videoUrl; }

  constructor() {
    this.exerciseForm.controls.muscleGroup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((group) => {
        if (group) this.imagePreview.set(getExerciseImage(group));
      });
  }

  async ngOnInit(): Promise<void> {
    if (this.exerciseId) await this.loadExercise(this.exerciseId);
  }

  async loadExercise(exerciseId: string): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId) {
      this.error.set('Tu sesión terminó. Inicia sesión nuevamente.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const exercise = await this.coachData.getCoachExercise(exerciseId, coachId, this.gymId || undefined);
      this.exerciseForm.reset({
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        videoUrl: exercise.videoUrl || '',
        description: exercise.description || ''
      });
      this.imagePreview.set(exercise.imageUrl?.trim() || getExerciseImage(exercise.muscleGroup));
      this.exerciseForm.markAsPristine();
      this.exerciseLoaded.set(true);
    } catch {
      this.error.set('No pudimos cargar este ejercicio. Puede que ya no exista o no te pertenezca.');
    } finally {
      this.loading.set(false);
    }
  }

  async saveExercise(): Promise<void> {
    if (this.saving() || !this.exerciseLoaded()) return;
    this.name.setValue(this.name.value.trim());
    if (this.exerciseForm.invalid) {
      this.exerciseForm.markAllAsTouched();
      return;
    }

    const coachId = this.auth.user()?.id;
    if (!coachId) {
      this.error.set('Tu sesión terminó. Inicia sesión nuevamente para guardar.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const value = this.exerciseForm.getRawValue();
    const input = {
      name: value.name,
      muscleGroup: value.muscleGroup,
      videoUrl: value.videoUrl,
      description: value.description,
      imageUrl: this.imagePreview()
    };

    try {
      if (this.exerciseId) {
        await this.coachData.updateCoachExercise(this.exerciseId, coachId, input);
        await this.router.navigate([this.libraryRoute], { queryParams: { result: 'updated' } });
      } else {
        await this.coachData.createCoachExercise(coachId, input, this.gymId || undefined);
        await this.router.navigate([this.libraryRoute], { queryParams: { result: 'created' } });
      }
    } catch {
      this.error.set('No pudimos guardar el ejercicio. Revisa los datos e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }
}
