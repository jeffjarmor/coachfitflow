import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs/operators';
import { ExerciseService } from '../../../services/exercise.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';
import { Exercise } from '../../../models/exercise.model';
import { MUSCLE_GROUPS } from '../../../utils/muscle-groups';

@Component({
    selector: 'app-exercise-library',
    standalone: true,
    imports: [CommonModule, RouterLink, ReactiveFormsModule, ButtonComponent, PageHeaderComponent, TutorialButtonComponent],
    templateUrl: './exercise-library.component.html',
    styleUrls: ['./exercise-library.component.scss']
})
export class ExerciseLibraryComponent {
    private exerciseService = inject(ExerciseService);
    private authService = inject(AuthService);
    private toastService = inject(ToastService);
    private confirmService = inject(ConfirmService);
    private tutorialService = inject(TutorialService);

    // Constants
    muscleGroups = MUSCLE_GROUPS;

    // State
    activeTab = signal<'global' | 'my-exercises'>('global');
    loading = signal<boolean>(false);

    // Search & Filter
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
    globalExercises = this.exerciseService.globalExercises;
    coachExercises = this.exerciseService.coachExercises;

    // Computed filtered exercises based on active tab
    filteredExercises = computed(() => {
        const query = this.searchQuery()?.toLowerCase() || '';
        const muscleGroup = this.selectedMuscleGroup();
        const tab = this.activeTab();

        const exercises = tab === 'global' ? this.globalExercises() : this.coachExercises();

        return exercises.filter(ex => {
            const matchesSearch = ex.name.toLowerCase().includes(query) ||
                (ex.description && ex.description.toLowerCase().includes(query));
            const matchesMuscle = !muscleGroup || ex.muscleGroup === muscleGroup;

            return matchesSearch && matchesMuscle;
        });
    });

    constructor() {
        this.loadData();

        // Auto-start tutorial on first visit
        setTimeout(() => {
            if (!this.tutorialService.isTutorialCompleted('exercise-library')) {
                this.tutorialService.startTutorial('exercise-library');
            }
        }, 500);
    }

    async loadData() {
        try {
            this.loading.set(true);
            const userId = this.authService.getCurrentUserId();

            // Load both lists
            await Promise.all([
                this.exerciseService.getGlobalExercises(),
                userId ? this.exerciseService.getCoachExercises(userId) : Promise.resolve([])
            ]);
        } catch (error) {
            console.error('Error loading exercises:', error);
        } finally {
            this.loading.set(false);
        }
    }

    setActiveTab(tab: 'global' | 'my-exercises') {
        this.activeTab.set(tab);
        // Reset filters when switching tabs? Optional.
        // this.searchControl.setValue('');
        // this.muscleGroupControl.setValue('');
    }

    async deleteExercise(exerciseId: string, event: Event) {
        event.preventDefault();
        event.stopPropagation();

        const confirmed = await this.confirmService.confirm({
            title: '¿Eliminar ejercicio?',
            message: '¿Estás seguro de que quieres eliminar este ejercicio?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            type: 'danger'
        });

        if (!confirmed) return;

        try {
            await this.exerciseService.deleteExercise(exerciseId);
            this.toastService.success('Ejercicio eliminado correctamente');
        } catch (error) {
            console.error('Error deleting exercise:', error);
            this.toastService.error('Error al eliminar el ejercicio');
        }
    }

    startTutorial() {
        this.tutorialService.startTutorial('exercise-library');
    }
}
