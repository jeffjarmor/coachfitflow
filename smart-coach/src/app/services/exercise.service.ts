import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { Exercise, CreateExerciseData, UpdateExerciseData } from '../models/exercise.model';
import { orderBy } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class ExerciseService {
    private firestoreService = inject(FirestoreService);
    private storageService = inject(StorageService);

    globalExercises = signal<Exercise[]>([]);
    coachExercises = signal<Exercise[]>([]);
    loading = signal<boolean>(false);

    /**
     * Get all global exercises
     */
    async getGlobalExercises(): Promise<Exercise[]> {
        try {
            this.loading.set(true);
            const exercises = await this.firestoreService.getDocuments<Exercise>(
                'exercises_global',
                orderBy('name', 'asc')
            );
            this.globalExercises.set(exercises);
            return exercises;
        } catch (error) {
            console.error('Error getting global exercises:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Get coach-specific exercises
     */
    async getCoachExercises(coachId: string): Promise<Exercise[]> {
        try {
            this.loading.set(true);
            const exercises = await this.firestoreService.getDocuments<Exercise>(
                `coaches/${coachId}/exercises`,
                orderBy('name', 'asc')
            );
            this.coachExercises.set(exercises);
            return exercises;
        } catch (error) {
            console.error('Error getting coach exercises:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Get all exercises (global + coach-specific)
     */
    async getAllExercises(coachId: string): Promise<Exercise[]> {
        const [global, coach] = await Promise.all([
            this.getGlobalExercises(),
            this.getCoachExercises(coachId)
        ]);
        return [...global, ...coach];
    }

    /**
     * Create a global exercise
     */
    async createGlobalExercise(data: CreateExerciseData): Promise<string> {
        try {
            this.loading.set(true);
            const exerciseData = {
                ...data,
                isGlobal: true
            };
            const exerciseId = await this.firestoreService.addDocument(
                'exercises_global',
                exerciseData
            );

            // Refresh global exercises
            await this.getGlobalExercises();

            return exerciseId;
        } catch (error) {
            console.error('Error creating global exercise:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Create a coach-specific exercise
     */
    async createCoachExercise(coachId: string, data: CreateExerciseData): Promise<string> {
        try {
            this.loading.set(true);
            const exerciseData = {
                ...data,
                isGlobal: false,
                coachId
            };
            const exerciseId = await this.firestoreService.addDocument(
                `coaches/${coachId}/exercises`,
                exerciseData
            );

            // Refresh coach exercises
            await this.getCoachExercises(coachId);

            return exerciseId;
        } catch (error) {
            console.error('Error creating coach exercise:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update a global exercise
     */
    async updateGlobalExercise(exerciseId: string, data: UpdateExerciseData): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument(
                'exercises_global',
                exerciseId,
                data
            );

            // Refresh global exercises
            await this.getGlobalExercises();
        } catch (error) {
            console.error('Error updating global exercise:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update a coach exercise
     */
    async updateCoachExercise(
        coachId: string,
        exerciseId: string,
        data: UpdateExerciseData
    ): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument(
                `coaches/${coachId}/exercises`,
                exerciseId,
                data
            );

            // Refresh coach exercises
            await this.getCoachExercises(coachId);
        } catch (error) {
            console.error('Error updating coach exercise:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete a global exercise
     */
    async deleteGlobalExercise(exerciseId: string): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.deleteDocument('exercises_global', exerciseId);

            // Refresh global exercises
            await this.getGlobalExercises();
        } catch (error) {
            console.error('Error deleting global exercise:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete ALL global exercises
     * WARNING: This is a destructive operation
     */
    async deleteAllGlobalExercises(): Promise<void> {
        try {
            this.loading.set(true);
            const exercises = await this.getGlobalExercises();

            // Delete in parallel batches
            const deletePromises = exercises.map(ex =>
                this.firestoreService.deleteDocument('exercises_global', ex.id!)
            );

            await Promise.all(deletePromises);

            // Clear local state
            this.globalExercises.set([]);
        } catch (error) {
            console.error('Error deleting all global exercises:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete a coach exercise
     */
    async deleteCoachExercise(coachId: string, exerciseId: string): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.deleteDocument(
                `coaches/${coachId}/exercises`,
                exerciseId
            );

            // Refresh coach exercises
            await this.getCoachExercises(coachId);
        } catch (error) {
            console.error('Error deleting coach exercise:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Create exercise (unified)
     */
    async createExercise(data: CreateExerciseData): Promise<string> {
        if (data.isGlobal) {
            return this.createGlobalExercise(data);
        }

        const coachId = inject(AuthService).getCurrentUserId();
        if (!coachId) throw new Error('No coach logged in');
        return this.createCoachExercise(coachId, data);
    }

    /**
     * Delete exercise (unified)
     */
    async deleteExercise(exerciseId: string, isGlobal: boolean = false): Promise<void> {
        if (isGlobal) {
            // Check if admin? For now assume only coach exercises are deleted via this method
            // or handle global deletion if needed
            await this.deleteGlobalExercise(exerciseId);
        } else {
            const coachId = inject(AuthService).getCurrentUserId();
            if (!coachId) throw new Error('No coach logged in');
            await this.deleteCoachExercise(coachId, exerciseId);
        }
    }

    /**
     * Update exercise (unified)
     */
    async updateExercise(exerciseId: string, data: UpdateExerciseData, isGlobal: boolean = false): Promise<void> {
        if (isGlobal) {
            await this.updateGlobalExercise(exerciseId, data);
        } else {
            const coachId = inject(AuthService).getCurrentUserId();
            if (!coachId) throw new Error('No coach logged in');
            await this.updateCoachExercise(coachId, exerciseId, data);
        }
    }

    /**
     * Upload exercise image
     */
    async uploadExerciseImage(
        coachId: string | null,
        file: File,
        isGlobal: boolean = false
    ): Promise<string> {
        try {
            return await this.storageService.uploadExerciseImage(coachId, file, isGlobal);
        } catch (error) {
            console.error('Error uploading exercise image:', error);
            throw error;
        }
    }

    /**
     * Filter exercises by muscle group
     */
    filterByMuscleGroup(exercises: Exercise[], muscleGroup: string): Exercise[] {
        if (!muscleGroup) {
            return exercises;
        }
        return exercises.filter(ex => ex.muscleGroup === muscleGroup);
    }

    /**
     * Search exercises by name
     */
    searchExercises(exercises: Exercise[], searchTerm: string): Exercise[] {
        if (!searchTerm.trim()) {
            return exercises;
        }

        const term = searchTerm.toLowerCase();
        return exercises.filter(ex =>
            ex.name.toLowerCase().includes(term) ||
            ex.muscleGroup.toLowerCase().includes(term)
        );
    }
}
