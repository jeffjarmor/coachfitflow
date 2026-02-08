import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ExerciseService } from '../../../services/exercise.service';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service'; // Added import
import { ToastService } from '../../../services/toast.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { CreateExerciseData } from '../../../models/exercise.model';
import { MUSCLE_GROUPS } from '../../../utils/muscle-groups';

// Helper to create SVG data URI for emojis (copied from spanish-exercises.ts)
const getEmojiImage = (emoji: string, color: string = '#f3f4f6') => {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="${color}"/>
        <text x="50" y="50" font-family="Arial" font-size="60" text-anchor="middle" dy=".35em">${emoji}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

const MUSCLE_GROUP_IMAGES: Record<string, string> = {
    'Pecho': getEmojiImage('🏋️', '#fee2e2'),
    'Espalda': getEmojiImage('🏋️', '#dbeafe'),
    'Hombros': getEmojiImage('🏋️', '#ffedd5'),
    'Bíceps': getEmojiImage('🏋️', '#dcfce7'),
    'Tríceps': getEmojiImage('🏋️', '#f3e8ff'),
    'Antebrazos': getEmojiImage('🏋️', '#f5f5f4'),
    'Core': getEmojiImage('🧘', '#fef9c3'),
    'Glúteos': getEmojiImage('🍑', '#fee2e2'),
    'Cuádriceps': getEmojiImage('🏋️', '#dbeafe'),
    'Isquiotibiales': getEmojiImage('🏋️', '#dcfce7'),
    'Aductores': getEmojiImage('🏋️', '#f3e8ff'),
    'Abductores': getEmojiImage('🏋️', '#f3e8ff'),
    'Pantorrillas': getEmojiImage('🏋️', '#ffedd5'),
    'Cuello': getEmojiImage('🏋️', '#f3f4f6'),
    'Cardio': getEmojiImage('❤️', '#f3f4f6'),
    'Potencia': getEmojiImage('⚡', '#fef08a'),
    'Rehabilitación': getEmojiImage('♿', '#e5e7eb'),
    'Full Body': getEmojiImage('🏋️', '#f3f4f6')
};

@Component({
    selector: 'app-exercise-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonComponent, PageHeaderComponent],
    templateUrl: './exercise-form.component.html',
    styleUrls: ['./exercise-form.component.scss']
})
export class ExerciseFormComponent {
    private fb = inject(FormBuilder);
    private exerciseService = inject(ExerciseService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private coachService = inject(CoachService); // Added inject

    exerciseForm: FormGroup;
    loading = signal<boolean>(false);
    isEditMode = signal<boolean>(false);
    exerciseId: string | null = null;
    imagePreview = signal<string | null>(null);

    muscleGroups = MUSCLE_GROUPS;

    constructor() {
        this.exerciseForm = this.fb.group({
            name: ['', [Validators.required, Validators.minLength(2)]],
            muscleGroup: ['', [Validators.required]],
            description: [''],
            videoUrl: ['', [Validators.pattern('https?://.+')]],
        });

        // Listen to muscle group changes to update image
        this.exerciseForm.get('muscleGroup')?.valueChanges.subscribe(group => {
            if (group) {
                this.updateImage(group);
            }
        });

        this.route.params.subscribe(async params => {
            if (params['id']) {
                this.isEditMode.set(true);
                this.exerciseId = params['id'];
                await this.loadExercise(this.exerciseId!);
            }
        });
    }

    updateImage(group: string) {
        const imageUrl = MUSCLE_GROUP_IMAGES[group] || getEmojiImage('🏋️', '#f3f4f6');
        this.imagePreview.set(imageUrl);
    }

    async loadExercise(id: string) {
        try {
            this.loading.set(true);
            const userId = this.authService.getCurrentUserId();
            if (!userId) return;

            // Get coach profile to determine gymId
            const coach = await this.coachService.getCoachProfile(userId);
            const gymId = coach?.gymId;

            console.log('🔄 Loading exercise for edit:', id, 'gymId:', gymId);

            // Try to find in coach exercises (passing gymId)
            const exercises = await this.exerciseService.getCoachExercises(userId, gymId);
            const exercise = exercises.find(e => e.id === id);

            if (exercise) {
                console.log('✅ Exercise found:', exercise);
                this.exerciseForm.patchValue(exercise);
                if (exercise.imageUrl) {
                    this.imagePreview.set(exercise.imageUrl);
                }
            } else {
                console.warn('❌ Exercise not found in list');
                this.toastService.error('No se pudo cargar el ejercicio');
                this.router.navigate(['/exercises']);
            }
        } catch (error) {
            console.error('Error loading exercise:', error);
            this.toastService.error('Error al cargar datos del ejercicio');
        } finally {
            this.loading.set(false);
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
            // Use the current preview image (which is set by muscle group)
            const imageUrl = this.imagePreview();

            const exerciseData: CreateExerciseData = {
                ...this.exerciseForm.value,
                imageUrl,
                coachId: userId,
                isGlobal: false
            };

            if (this.isEditMode() && this.exerciseId) {
                await this.exerciseService.updateExercise(this.exerciseId, exerciseData);
                this.toastService.success('Ejercicio actualizado correctamente');
            } else {
                await this.exerciseService.createExercise(exerciseData);
                this.toastService.success('Ejercicio creado correctamente');
            }

            this.router.navigate(['/exercises']);
        } catch (error) {
            console.error('Error saving exercise:', error);
            this.toastService.error('Error al guardar el ejercicio');
        } finally {
            this.loading.set(false);
        }
    }

    // Getters
    get name() { return this.exerciseForm.get('name'); }
    get muscleGroup() { return this.exerciseForm.get('muscleGroup'); }
    get videoUrl() { return this.exerciseForm.get('videoUrl'); }
}
