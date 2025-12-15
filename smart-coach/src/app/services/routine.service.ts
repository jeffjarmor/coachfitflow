import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { FirestoreService } from './firestore.service';
import {
    Routine,
    TrainingDay,
    CreateRoutineData,
    RoutineWithDays,
    RoutineWizardState,
    WizardDayExercise
} from '../models/routine.model';
import { orderBy } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class RoutineService {
    private firestoreService = inject(FirestoreService);
    private authService = inject(AuthService);

    routines = signal<Routine[]>([]);
    loading = signal<boolean>(false);

    // Wizard state
    wizardState = signal<RoutineWizardState>({
        step: 1,
        days: [],
        selectedExercises: []
    });


    /**
     * Get all routines for a coach (no client filter)
     */
    async getAllRoutines(coachId: string): Promise<Routine[]> {
        try {
            this.loading.set(true);
            const routines = await this.firestoreService.getDocuments<Routine>(
                `coaches/${coachId}/routines`,
                orderBy('createdAt', 'desc')
            );
            return routines;
        } catch (error) {
            console.error('Error getting all routines:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Get all routines for a client
     */
    async getClientRoutines(coachId: string, clientId: string): Promise<Routine[]> {
        try {
            this.loading.set(true);
            const routines = await this.getAllRoutines(coachId);

            // Filter by clientId
            const clientRoutines = routines.filter(r => r.clientId === clientId);
            this.routines.set(clientRoutines);
            return clientRoutines;
        } catch (error) {
            console.error('Error getting client routines:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Get a single routine with all its days
     */
    async getRoutineWithDays(coachId: string, routineId: string): Promise<RoutineWithDays | null> {
        try {
            this.loading.set(true);

            // Get routine
            const routine = await this.firestoreService.getDocument<Routine>(
                `coaches/${coachId}/routines`,
                routineId
            );

            if (!routine) {
                return null;
            }

            // Get all days for this routine
            const days = await this.firestoreService.getDocuments<TrainingDay>(
                `coaches/${coachId}/routines/${routineId}/days`,
                orderBy('dayNumber', 'asc')
            );

            return {
                ...routine,
                days
            };
        } catch (error) {
            console.error('Error getting routine with days:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Create a new routine with training days
     */
    async createRoutine(
        coachId: string,
        routineData: CreateRoutineData,
        days: Omit<TrainingDay, 'id' | 'routineId'>[]
    ): Promise<string> {
        try {
            this.loading.set(true);

            // Create routine
            const routine = {
                ...routineData,
                coachId
            };
            const routineId = await this.firestoreService.addDocument(
                `coaches/${coachId}/routines`,
                routine
            );

            // Create training days
            for (const day of days) {
                const dayData = {
                    ...day,
                    routineId
                };
                await this.firestoreService.addDocument(
                    `coaches/${coachId}/routines/${routineId}/days`,
                    dayData
                );
            }

            return routineId;
        } catch (error) {
            console.error('Error creating routine:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update a routine
     */
    async updateRoutine(
        coachId: string,
        routineId: string,
        data: Partial<Routine>
    ): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument(
                `coaches/${coachId}/routines`,
                routineId,
                data
            );
        } catch (error) {
            console.error('Error updating routine:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update a training day
     */
    async updateTrainingDay(
        coachId: string,
        routineId: string,
        dayId: string,
        data: Partial<TrainingDay>
    ): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument(
                `coaches/${coachId}/routines/${routineId}/days`,
                dayId,
                data
            );
        } catch (error) {
            console.error('Error updating training day:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete a routine
     */
    async deleteRoutine(coachId: string, routineId: string): Promise<void> {
        try {
            this.loading.set(true);

            // Delete all training days first
            const days = await this.firestoreService.getDocuments<TrainingDay>(
                `coaches/${coachId}/routines/${routineId}/days`
            );

            for (const day of days) {
                await this.firestoreService.deleteDocument(
                    `coaches/${coachId}/routines/${routineId}/days`,
                    day.id
                );
            }

            // Delete routine
            await this.firestoreService.deleteDocument(
                `coaches/${coachId}/routines`,
                routineId
            );
        } catch (error) {
            console.error('Error deleting routine:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete all routines for a client
     */
    async deleteRoutinesByClient(coachId: string, clientId: string): Promise<void> {
        try {
            this.loading.set(true);
            const routines = await this.getClientRoutines(coachId, clientId);

            for (const routine of routines) {
                if (routine.id) {
                    await this.deleteRoutine(coachId, routine.id);
                }
            }
        } catch (error) {
            console.error('Error deleting client routines:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update wizard state
     */
    updateWizardState(state: Partial<RoutineWizardState>): void {
        this.wizardState.update(current => ({ ...current, ...state }));
    }

    /**
     * Reset wizard state
     */
    resetWizardState(): void {
        this.wizardState.set({
            step: 1,
            days: [],
            selectedExercises: []
        });
    }

    /**
     * Auto-assign exercises to days based on muscle groups
     */
    autoAssignExercises(): void {
        const state = this.wizardState();
        console.log('Auto-assigning exercises. Selected:', state.selectedExercises.length);

        // 1. Create a lookup of existing exercises to preserve their details
        const existingExercisesMap = new Map<string, WizardDayExercise>();
        state.days.forEach(day => {
            day.exercises.forEach(ex => {
                if (ex.exercise && ex.exercise.id) {
                    existingExercisesMap.set(ex.exercise.id, ex);
                }
            });
        });

        // 2. Deep clone days to avoid mutation issues, but keep muscle groups
        const days = state.days.map(day => ({
            ...day,
            exercises: [] as WizardDayExercise[] // Reset exercises list for re-assignment
        }));
        const selectedExercises = state.selectedExercises;

        // 3. Assign each exercise
        selectedExercises.forEach(exercise => {
            // Find first day that matches exercise muscle group
            const matchingDayIndex = days.findIndex(day =>
                day.muscleGroups.some(mg => mg.toLowerCase() === exercise.muscleGroup.toLowerCase())
            );

            if (matchingDayIndex !== -1) {
                // Check if we have existing details for this exercise
                const existing = existingExercisesMap.get(exercise.id!);

                // Create WizardDayExercise using existing details or defaults
                const wizardExercise: WizardDayExercise = {
                    exercise: exercise,
                    sets: existing?.sets ?? 3,
                    reps: existing?.reps ?? '10-12',
                    rest: existing?.rest ?? '60s',
                    notes: existing?.notes ?? '',
                    isSuperset: existing?.isSuperset ?? false,
                    order: days[matchingDayIndex].exercises.length + 1
                };
                days[matchingDayIndex].exercises.push(wizardExercise);
            } else {
                console.warn(`Could not assign exercise ${exercise.name} to any day`);
            }
        });

        console.log('Assigned days with preserved details:', days);
        this.updateWizardState({ days });
    }

    /**
     * Save routine from wizard state
     */
    async saveRoutineFromWizard(): Promise<string> {
        const state = this.wizardState();
        const coachId = this.authService.getCurrentUserId(); // We need to inject AuthService or pass it

        if (!coachId) throw new Error('No coach logged in');
        if (!state.clientId) throw new Error('No client selected');
        if (!state.routineName) throw new Error('Routine name is required');

        const startDate = new Date();
        const durationWeeks = state.durationWeeks || 4;
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + (durationWeeks * 7));

        const routineData: CreateRoutineData = {
            clientId: state.clientId,
            name: state.routineName,
            objective: state.objective || '',
            trainingDaysCount: state.daysCount || 0,
            durationWeeks: durationWeeks,
            startDate: startDate,
            endDate: endDate,
            notes: state.notes
        };

        // Map wizard days to TrainingDay objects
        const days = state.days.map((day, index) => ({
            dayNumber: index + 1,
            dayName: `Day ${index + 1}`,
            muscleGroups: day.muscleGroups || [],
            exercises: day.exercises.map((ex, exIndex) => ({
                exerciseId: ex.exercise.id || '',
                exerciseSource: (ex.exercise.isGlobal ? 'global' : 'coach') as 'global' | 'coach',
                exerciseName: ex.exercise.name || '',
                muscleGroup: ex.exercise.muscleGroup || '',
                sets: parseInt(String(ex.sets)) || 0,
                reps: ex.reps || '',
                rest: ex.rest || '',
                notes: ex.notes || '',
                videoUrl: ex.exercise.videoUrl || '',
                imageUrl: ex.exercise.imageUrl || '',
                isSuperset: false,
                order: exIndex
            })),
            notes: ''
        }));

        const routineId = await this.createRoutine(coachId, routineData, days);
        // Do not reset state here, let the component handle it after PDF generation
        return routineId;
    }

    /**
     * Go to next wizard step
     */
    nextStep(): void {
        this.wizardState.update(state => ({ ...state, step: state.step + 1 }));
    }

    /**
     * Go to specific wizard step
     */
    goToStep(step: number): void {
        this.wizardState.update(state => ({ ...state, step }));
    }

    /**
     * Reset wizard state (alias)
     */
    resetWizard(): void {
        this.resetWizardState();
    }

    /**
     * Add exercise to a specific day in wizard
     */
    addExerciseToDay(dayIndex: number, exercise: WizardDayExercise, index?: number): void {
        this.wizardState.update(state => {
            const days = [...state.days];
            const day = { ...days[dayIndex] };
            const exercises = [...day.exercises];

            if (typeof index === 'number') {
                exercises.splice(index, 0, exercise);
            } else {
                exercises.push(exercise);
            }

            day.exercises = exercises;
            days[dayIndex] = day;

            return { ...state, days };
        });
    }

    /**
     * Remove exercise from a specific day in wizard
     */
    removeExerciseFromDay(dayIndex: number, exerciseIndex: number): void {
        this.wizardState.update(state => {
            const days = [...state.days];
            const day = { ...days[dayIndex] };
            const exercises = [...day.exercises];

            exercises.splice(exerciseIndex, 1);

            day.exercises = exercises;
            days[dayIndex] = day;

            return { ...state, days };
        });
    }

    /**
     * Move exercise between days in wizard
     */
    moveExerciseBetweenDays(
        sourceDayIndex: number,
        sourceIndex: number,
        targetDayIndex: number,
        targetIndex: number
    ): void {
        this.wizardState.update(state => {
            const days = [...state.days];

            // Source day
            const sourceDay = { ...days[sourceDayIndex] };
            const sourceExercises = [...sourceDay.exercises];
            const [exercise] = sourceExercises.splice(sourceIndex, 1);
            sourceDay.exercises = sourceExercises;
            days[sourceDayIndex] = sourceDay;

            // Target day
            const targetDay = { ...days[targetDayIndex] };
            const targetExercises = [...targetDay.exercises];
            targetExercises.splice(targetIndex, 0, exercise);
            targetDay.exercises = targetExercises;
            days[targetDayIndex] = targetDay;

            return { ...state, days };
        });
    }

    /**
     * Go to previous wizard step
     */
    previousStep(): void {
        this.wizardState.update(state => ({ ...state, step: Math.max(1, state.step - 1) }));
    }
}
