import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { CoachService } from './coach.service'; // Added import
import { SupabaseService } from './supabase.service';
import { Exercise, CreateExerciseData, UpdateExerciseData } from '../models/exercise.model';

@Injectable({
    providedIn: 'root'
})
export class ExerciseService {
    private firestoreService = inject(FirestoreService);
    private storageService = inject(StorageService);
    private authService = inject(AuthService); // Moved here
    private coachService = inject(CoachService); // Moved here
    private supabase = inject(SupabaseService).client;

    globalExercises = signal<Exercise[]>([]);
    coachExercises = signal<Exercise[]>([]);
    loading = signal<boolean>(false);

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs))
        ]);
    }

    private async withTimeoutReject<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs))
        ]);
    }

    /**
     * Get the base path for exercises (gym or coach)
     */
    private getBasePath(coachId: string, gymId?: string | null): string {
        return gymId ? `gyms/${gymId}` : `coaches/${coachId}`;
    }

    /**
     * Get all global exercises
     */
    async getGlobalExercises(): Promise<Exercise[]> {
        try {
            this.loading.set(true);
            const exercises = await this.firestoreService.getDocuments<Exercise>('exercises_global');
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
     * @param coachId - The coach's ID
     * @param gymId - Optional gym ID if coach belongs to a gym
     */
    async getCoachExercises(coachId: string, gymId?: string | null): Promise<Exercise[]> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            const exercises = await this.firestoreService.getDocuments<Exercise>(`${basePath}/exercises`);
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
     * @param coachId - The coach's ID
     * @param data - Exercise data
     * @param gymId - Optional gym ID if coach belongs to a gym
     */
    async createCoachExercise(coachId: string, data: CreateExerciseData, gymId?: string | null): Promise<string> {
        try {
            this.loading.set(true);
            const payload: any = {
                name: data.name,
                muscle_group: data.muscleGroup,
                image_url: data.imageUrl || null,
                video_url: data.videoUrl || null,
                description: data.description || null,
                source: 'coach',
                coach_id: coachId,
                gym_id: gymId || null
            };

            const insertPromise = Promise.resolve(
                this.supabase
                    .from('exercises')
                    .insert(payload)
                    .select('id')
                    .single()
            ) as Promise<{ data: { id: string } | null; error: any }>;

            const insertResult = await this.withTimeoutReject<{ data: { id: string } | null; error: any }>(
                insertPromise,
                10000,
                'Timeout creating exercise'
            );

            if (insertResult.error) throw insertResult.error;
            if (!insertResult.data?.id) throw new Error('Exercise insert returned no id');
            const exerciseId = insertResult.data.id;

            // Refresh list in background; don't block create flow.
            this.getCoachExercises(coachId, gymId).catch(err => {
                console.warn('Background coach exercises refresh failed:', err);
            });

            return exerciseId;
        } catch (error) {
            // If insert timed out but actually reached DB, recover by fetching latest matching row.
            if ((error as Error)?.message?.includes('Timeout creating exercise')) {
                const { data: existing } = await this.supabase
                    .from('exercises')
                    .select('id')
                    .eq('coach_id', coachId)
                    .eq('name', data.name)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (existing?.id) {
                    return existing.id;
                }
            }
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
     * @param coachId - The coach's ID
     * @param exerciseId - The exercise ID
     * @param data - Exercise data to update
     * @param gymId - Optional gym ID if coach belongs to a gym
     */
    async updateCoachExercise(
        coachId: string,
        exerciseId: string,
        data: UpdateExerciseData,
        gymId?: string | null
    ): Promise<void> {
        try {
            this.loading.set(true);
            const payload: any = {};
            if (typeof data.name === 'string') payload.name = data.name;
            if (typeof data.muscleGroup === 'string') payload.muscle_group = data.muscleGroup;
            if (typeof data.description === 'string' || data.description === null) payload.description = data.description;
            if (typeof data.videoUrl === 'string' || data.videoUrl === null) payload.video_url = data.videoUrl;
            if (typeof data.imageUrl === 'string' || data.imageUrl === null) payload.image_url = data.imageUrl;
            if (gymId) payload.gym_id = gymId;

            const { error } = await this.supabase
                .from('exercises')
                .update(payload)
                .eq('id', exerciseId)
                .eq('coach_id', coachId)
                .eq('source', 'coach');
            if (error) throw error;

            // Refresh coach exercises
            await this.getCoachExercises(coachId, gymId);
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
     * @param coachId - The coach's ID
     * @param exerciseId - The exercise ID
     * @param gymId - Optional gym ID if coach belongs to a gym
     */
    async deleteCoachExercise(coachId: string, exerciseId: string, gymId?: string | null): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.deleteDocument(`${basePath}/exercises`, exerciseId);

            // Refresh coach exercises
            await this.getCoachExercises(coachId, gymId);
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

        await this.authService.waitForAuthReady();
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) throw new Error('No coach logged in');

        // Get coach profile to determine gymId
        const coach = await this.withTimeout(
            this.coachService.getCoachProfile(coachId),
            4000,
            null
        );
        const gymId = coach?.gymId;

        console.log('Creating exercise with gymId:', gymId);
        return this.createCoachExercise(coachId, data, gymId);
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
            await this.authService.waitForAuthReady();
            const coachId = this.authService.getCurrentUserId();
            if (!coachId) throw new Error('No coach logged in');

            // Get coach profile to determine gymId
            const coach = await this.withTimeout(
                this.coachService.getCoachProfile(coachId),
                4000,
                null
            );
            const gymId = coach?.gymId;

            console.log('Deleting exercise with gymId:', gymId);
            await this.deleteCoachExercise(coachId, exerciseId, gymId);
        }
    }

    /**
     * Update exercise (unified)
     */
    async updateExercise(exerciseId: string, data: UpdateExerciseData, isGlobal: boolean = false): Promise<void> {
        if (isGlobal) {
            await this.updateGlobalExercise(exerciseId, data);
        } else {
            await this.authService.waitForAuthReady();
            const coachId = this.authService.getCurrentUserId();
            if (!coachId) throw new Error('No coach logged in');

            // Get coach profile to determine gymId
            const coach = await this.withTimeout(
                this.coachService.getCoachProfile(coachId),
                4000,
                null
            );
            const gymId = coach?.gymId;

            console.log('Updating exercise with gymId:', gymId);
            await this.updateCoachExercise(coachId, exerciseId, data, gymId);
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
