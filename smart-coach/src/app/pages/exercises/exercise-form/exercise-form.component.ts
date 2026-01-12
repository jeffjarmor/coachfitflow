import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ExerciseService } from '../../../services/exercise.service';
import { AuthService } from '../../../services/auth.service';
import { StorageService } from '../../../services/storage.service';
import { ToastService } from '../../../services/toast.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { CreateExerciseData } from '../../../models/exercise.model';
import { MUSCLE_GROUPS } from '../../../utils/muscle-groups';

@Component({
    selector: 'app-exercise-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent],
    templateUrl: './exercise-form.component.html',
    styleUrls: ['./exercise-form.component.scss']
})
export class ExerciseFormComponent {
    private fb = inject(FormBuilder);
    private exerciseService = inject(ExerciseService);
    private authService = inject(AuthService);
    private storageService = inject(StorageService);
    private toastService = inject(ToastService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);

    exerciseForm: FormGroup;
    loading = signal<boolean>(false);
    isEditMode = signal<boolean>(false);
    exerciseId: string | null = null;

    // Image upload state
    selectedFile: File | null = null;
    imagePreview = signal<string | null>(null);
    uploadProgress = signal<number>(0);

    muscleGroups = MUSCLE_GROUPS;

    constructor() {
        this.exerciseForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            muscleGroup: ['', [Validators.required]],
            description: [''],
            videoUrl: ['', [Validators.pattern('https?://.+')]],
        });

        this.route.params.subscribe(async params => {
            if (params['id']) {
                this.isEditMode.set(true);
                this.exerciseId = params['id'];
                await this.loadExercise(this.exerciseId!);
            }
        });
    }

    async loadExercise(id: string) {
        try {
            this.loading.set(true);
            // Try to find in coach exercises first
            const exercises = await this.exerciseService.getCoachExercises(this.authService.getCurrentUserId()!);
            const exercise = exercises.find(e => e.id === id);

            if (exercise) {
                this.exerciseForm.patchValue(exercise);
                if (exercise.imageUrl) {
                    this.imagePreview.set(exercise.imageUrl);
                }
            }
        } catch (error) {
            console.error('Error loading exercise:', error);
        } finally {
            this.loading.set(false);
        }
    }

    onFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files[0]) {
            const file = input.files[0];

            // Validate file type
            if (!file.type.startsWith('image/')) {
                this.toastService.warning('Por favor selecciona un archivo de imagen válido');
                return;
            }

            // Validate file size (e.g., max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                this.toastService.warning('El tamaño del archivo debe ser menor a 5MB');
                return;
            }

            this.selectedFile = file;

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                this.imagePreview.set(e.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    }

    async onSubmit() {
        if (this.exerciseForm.invalid) {
            this.exerciseForm.markAllAsTouched();
            return;
        }

        this.loading.set(true);
        const userId = this.authService.getCurrentUserId();

        if (!userId) {
            console.error('No user logged in');
            return;
        }

        try {
            let imageUrl = this.imagePreview();

            // Upload image if selected
            if (this.selectedFile) {
                imageUrl = await this.storageService.uploadExerciseImage(
                    userId,
                    this.selectedFile,
                    false // isGlobal
                );
            }

            const exerciseData: CreateExerciseData = {
                ...this.exerciseForm.value,
                imageUrl,
                coachId: userId,
                isGlobal: false
            };

            if (this.isEditMode() && this.exerciseId) {
                await this.exerciseService.updateExercise(this.exerciseId, exerciseData);
            } else {
                await this.exerciseService.createExercise(exerciseData);
            }

            this.router.navigate(['/exercises']);
        } catch (error) {
            console.error('Error saving exercise:', error);
        } finally {
            this.loading.set(false);
        }
    }

    // Getters
    get name() { return this.exerciseForm.get('name'); }
    get muscleGroup() { return this.exerciseForm.get('muscleGroup'); }
    get videoUrl() { return this.exerciseForm.get('videoUrl'); }
}
