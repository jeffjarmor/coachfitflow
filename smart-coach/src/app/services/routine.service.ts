import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { CoachService } from './coach.service';
import { FirestoreService } from './firestore.service';
import { SupabaseService } from './supabase.service';
import {
    Routine,
    TrainingDay,
    CreateRoutineData,
    RoutineWithDays,
    RoutineWizardState,
    WizardDayExercise,
    RoutineWarmupCardioExercise,
    isGroupedRoutineExerciseBlockType
} from '../models/routine.model';

@Injectable({
    providedIn: 'root'
})
export class RoutineService {
    private firestoreService = inject(FirestoreService);
    private authService = inject(AuthService);
    private coachService = inject(CoachService);
    private supabase = inject(SupabaseService).client;

    routines = signal<Routine[]>([]);
    loading = signal<boolean>(false);
    private allRoutinesCache = new Map<string, { data: Routine[]; expiresAt: number }>();
    private allRoutinesInFlight = new Map<string, Promise<Routine[]>>();
    private readonly allRoutinesCacheTtlMs = 15_000;
    private readonly wizardDraftVersion = 1;
    private activeWizardDraftKey = signal<string | null>(null);

    // Wizard state
    wizardState = signal<RoutineWizardState>(this.getInitialWizardState());

    constructor() {
        effect(() => {
            const key = this.activeWizardDraftKey();
            const state = this.wizardState();

            if (!key || !this.canUseLocalStorage()) return;

            try {
                if (!this.hasWizardProgress(state)) {
                    localStorage.removeItem(key);
                    return;
                }

                localStorage.setItem(key, JSON.stringify({
                    version: this.wizardDraftVersion,
                    savedAt: new Date().toISOString(),
                    state: this.serializeWizardState(state)
                }));
            } catch (error) {
                console.warn('No se pudo guardar el borrador de la rutina:', error);
            }
        });
    }

    private getInitialWizardState(): RoutineWizardState {
        return {
        step: 1,
        days: [],
        selectedExercises: [],
        warmup: {
            enabled: false,
                cardioExercises: [],
                customText: ''
            }
        };
    }

    getWizardDraftKey(scope: string): string {
        return `coachfitflow:routine-wizard:v${this.wizardDraftVersion}:${scope}`;
    }

    setWizardDraftKey(key: string | null): void {
        this.activeWizardDraftKey.set(key);
    }

    restoreWizardDraft(key: string, options?: { expectedClientId?: string | null }): boolean {
        if (!this.canUseLocalStorage()) return false;

        try {
            const rawDraft = localStorage.getItem(key);
            if (!rawDraft) return false;

            const draft = JSON.parse(rawDraft);
            if (draft?.version !== this.wizardDraftVersion || !draft?.state) {
                localStorage.removeItem(key);
                return false;
            }

            const restoredState = this.deserializeWizardState(draft.state);
            const expectedClientId = options?.expectedClientId || null;

            if (expectedClientId && restoredState.clientId && restoredState.clientId !== expectedClientId) {
                localStorage.removeItem(key);
                return false;
            }

            this.wizardState.set({
                ...restoredState,
                ...(expectedClientId ? { clientId: expectedClientId } : {})
            });
            return true;
        } catch (error) {
            console.warn('No se pudo restaurar el borrador de la rutina:', error);
            localStorage.removeItem(key);
            return false;
        }
    }

    clearWizardDraft(key: string | null = this.activeWizardDraftKey()): void {
        if (!key || !this.canUseLocalStorage()) return;

        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('No se pudo limpiar el borrador de la rutina:', error);
        }
    }

    private canUseLocalStorage(): boolean {
        return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
    }

    private hasWizardProgress(state: RoutineWizardState): boolean {
        return state.step > 1 ||
            !!state.clientId ||
            !!state.routineName ||
            !!state.objective ||
            !!state.daysCount ||
            !!state.durationWeeks ||
            !!state.notes ||
            (state.days?.length || 0) > 0 ||
            (state.selectedExercises?.length || 0) > 0 ||
            !!state.warmup?.enabled ||
            !!state.warmup?.customText?.trim() ||
            (state.warmup?.cardioExercises?.length || 0) > 0;
    }

    private serializeWizardState(state: RoutineWizardState): RoutineWizardState {
        return JSON.parse(JSON.stringify(state));
    }

    private deserializeWizardState(state: RoutineWizardState): RoutineWizardState {
        return {
            ...this.getInitialWizardState(),
            ...state,
            startDate: state.startDate ? new Date(state.startDate) : undefined,
            endDate: state.endDate ? new Date(state.endDate) : undefined,
            warmup: {
                enabled: !!state.warmup?.enabled,
                cardioExercises: state.warmup?.cardioExercises || [],
                customText: state.warmup?.customText || ''
            },
            days: (state.days || []).map((day) => ({
                muscleGroups: day.muscleGroups || [],
                exercises: (day.exercises || []).map((dayExercise) => ({
                    ...dayExercise,
                    exercise: {
                        ...dayExercise.exercise,
                        createdAt: dayExercise.exercise?.createdAt ? new Date(dayExercise.exercise.createdAt) : new Date(),
                        updatedAt: dayExercise.exercise?.updatedAt ? new Date(dayExercise.exercise.updatedAt) : undefined
                    }
                }))
            })),
            selectedExercises: (state.selectedExercises || []).map((exercise) => ({
                ...exercise,
                createdAt: exercise.createdAt ? new Date(exercise.createdAt) : new Date(),
                updatedAt: exercise.updatedAt ? new Date(exercise.updatedAt) : undefined
            }))
        };
    }

    /**
     * Determines the base Firestore path based on whether the coach belongs to a gym
     * @param coachId - The coach's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     * @returns The base path for Firestore operations
     */
    private getBasePath(coachId: string, gymId?: string | null): string {
        // If coach belongs to a gym, use gym path (shared data)
        if (gymId) {
            return `gyms/${gymId}`;
        }
        // Otherwise, use individual coach path (isolated data)
        return `coaches/${coachId}`;
    }


    /**
     * Get all routines for a coach or gym (no client filter)
     * @param coachId - The coach's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async getAllRoutines(coachId: string, gymId?: string | null): Promise<Routine[]> {
        const cacheKey = `${coachId}:${gymId || 'personal'}`;
        const now = Date.now();
        const cached = this.allRoutinesCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.data;
        }

        const inFlight = this.allRoutinesInFlight.get(cacheKey);
        if (inFlight) return inFlight;

        const request = this.fetchAllRoutines(coachId, gymId, cacheKey);
        this.allRoutinesInFlight.set(cacheKey, request);
        try {
            return await request;
        } finally {
            this.allRoutinesInFlight.delete(cacheKey);
        }
    }

    private async fetchAllRoutines(coachId: string, gymId?: string | null, cacheKey?: string): Promise<Routine[]> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            const routines = await this.firestoreService.getDocuments<Routine>(`${basePath}/routines`);
            if (cacheKey) {
                this.allRoutinesCache.set(cacheKey, {
                    data: routines,
                    expiresAt: Date.now() + this.allRoutinesCacheTtlMs
                });
            }
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
     * @param coachId - The coach's ID
     * @param clientId - The client's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async getClientRoutines(coachId: string, clientId: string, gymId?: string | null): Promise<Routine[]> {
        try {
            this.loading.set(true);
            let query = this.supabase
                .from('routines')
                .select('*')
                .eq('coach_id', coachId)
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (gymId) {
                const { data: membership } = await this.supabase
                    .from('client_gym_memberships')
                    .select('id')
                    .eq('gym_id', gymId)
                    .eq('client_id', clientId)
                    .maybeSingle();
                query = query.eq('client_gym_membership_id', membership?.id || null);
            } else {
                query = query.is('client_gym_membership_id', null);
            }

            const { data, error } = await query;
            if (error) throw error;

            const clientRoutines = (data || []).map((r: any) => ({
                id: r.id,
                coachId: r.coach_id,
                clientId: r.client_id,
                name: r.name,
                objective: r.objective,
                trainingDaysCount: r.training_days_count,
                durationWeeks: r.duration_weeks,
                startDate: r.start_date,
                endDate: r.end_date,
                notes: r.notes,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            } as Routine));
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
     * @param coachId - The coach's ID
     * @param routineId - The routine's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async getRoutineWithDays(coachId: string, routineId: string, gymId?: string | null): Promise<RoutineWithDays | null> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);

            // Get routine
            const routine = await this.firestoreService.getDocument<Routine>(
                `${basePath}/routines`,
                routineId
            );

            if (!routine) {
                return null;
            }

            // Get all days for this routine
            const days = await this.firestoreService.getDocuments<TrainingDay>(
                `${basePath}/routines/${routineId}/days`
            );

            // Rebuild warmup object from flattened routine fields + warmup exercises table.
            const routineAny = routine as any;
            const cardioExercises = await this.getWarmupCardioExercises(routineId);
            const warmupEnabledFromDb = !!(routineAny.warmupEnabled ?? routineAny.warmup_enabled ?? false);
            const warmupCustomText = (routineAny.warmupCustomText ?? routineAny.warmup_custom_text ?? '').toString();
            const hasWarmupData = warmupEnabledFromDb || !!warmupCustomText.trim() || cardioExercises.length > 0;
            const warmup = hasWarmupData ? {
                enabled: warmupEnabledFromDb || cardioExercises.length > 0 || !!warmupCustomText.trim(),
                cardioExercises,
                customText: warmupCustomText
            } : undefined;

            return {
                ...routine,
                ...(warmup ? { warmup } : {}),
                days
            };
        } catch (error) {
            console.error('Error getting routine with days:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    private async getWarmupCardioExercises(routineId: string): Promise<RoutineWarmupCardioExercise[]> {
        const { data, error } = await this.supabase
            .from('routine_warmup_exercises')
            .select('exercise_id, order_index, exercises(name)')
            .eq('routine_id', routineId)
            .order('order_index', { ascending: true });

        if (error) {
            console.error('Error getting warmup cardio exercises:', error);
            return [];
        }

        return (data || [])
            .filter((row: any) => !!row.exercise_id)
            .map((row: any) => ({
                exerciseId: row.exercise_id,
                exerciseName: row.exercises?.name || 'Ejercicio'
            }));
    }

    /**
     * Create a new routine with training days
     * @param coachId - The coach's ID
     * @param routineData - The routine data
     * @param days - The training days data
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async createRoutine(
        coachId: string,
        routineData: CreateRoutineData,
        days: Omit<TrainingDay, 'id' | 'routineId'>[],
        gymId?: string | null
    ): Promise<string> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);

            // Create routine
            if (!routineData.clientId) {
                throw new Error('No se recibió clientId para crear la rutina.');
            }
            const routine = {
                ...routineData,
                coachId
            };
            const routineId = await this.firestoreService.addDocument(
                `${basePath}/routines`,
                routine
            );
            this.allRoutinesCache.delete(`${coachId}:${gymId || 'personal'}`);

            // Create training days
            for (const day of days) {
                const dayData = {
                    ...day,
                    routineId
                };
                await this.firestoreService.addDocument(
                    `${basePath}/routines/${routineId}/days`,
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
     * @param coachId - The coach's ID
     * @param routineId - The routine's ID  
     * @param data - Partial routine data to update
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async updateRoutine(
        coachId: string,
        routineId: string,
        data: Partial<Routine>,
        gymId?: string | null
    ): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.updateDocument(
                `${basePath}/routines`,
                routineId,
                data
            );
            this.allRoutinesCache.delete(`${coachId}:${gymId || 'personal'}`);
        } catch (error) {
            console.error('Error updating routine:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update a training day
     * @param coachId - The coach's ID
     * @param routineId - The routine's ID
     * @param dayId - The day's ID
     * @param data - Partial training day data to update
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async updateTrainingDay(
        coachId: string,
        routineId: string,
        dayId: string,
        data: Partial<TrainingDay>,
        gymId?: string | null
    ): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.updateDocument(
                `${basePath}/routines/${routineId}/days`,
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
     * @param coachId - The coach's ID
     * @param routineId - The routine's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async deleteRoutine(coachId: string, routineId: string, gymId?: string | null): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);

            // Delete all training days first
            const days = await this.firestoreService.getDocuments<TrainingDay>(
                `${basePath}/routines/${routineId}/days`
            );

            for (const day of days) {
                await this.firestoreService.deleteDocument(
                    `${basePath}/routines/${routineId}/days`,
                    day.id
                );
            }

            // Delete routine
            await this.firestoreService.deleteDocument(
                `${basePath}/routines`,
                routineId
            );
            this.allRoutinesCache.delete(`${coachId}:${gymId || 'personal'}`);
        } catch (error) {
            console.error('Error deleting routine:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete all routines for a client
     * @param coachId - The coach's ID
     * @param clientId - The client's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async deleteRoutinesByClient(coachId: string, clientId: string, gymId?: string | null): Promise<void> {
        try {
            this.loading.set(true);
            const routines = await this.getClientRoutines(coachId, clientId, gymId);

            for (const routine of routines) {
                if (routine.id) {
                    await this.deleteRoutine(coachId, routine.id, gymId);
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
    resetWizardState(clearDraft: boolean = true): void {
        if (clearDraft) {
            this.clearWizardDraft();
        }
        this.setWizardDraftKey(null);
        this.wizardState.set(this.getInitialWizardState());
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
                    blockType: existing?.blockType ?? 'single',
                    blockId: existing?.blockId ?? null,
                    blockLabel: existing?.blockLabel ?? null,
                    blockPosition: existing?.blockPosition ?? null,
                    blockRest: existing?.blockRest ?? null,
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
     * @param targetCoachId Optional coach ID for admin mode (saves under this coach instead of current user)
     */
    async saveRoutineFromWizard(targetCoachId: string | null = null): Promise<string> {
        const state = this.wizardState();
        // Use targetCoachId if provided (admin mode), otherwise use current user
        const coachId = targetCoachId || this.authService.getCurrentUserId();
        const clientId = String(state.clientId || '').trim();

        if (!coachId) throw new Error('No coach logged in');
        if (!clientId) throw new Error('No client selected');
        if (!state.routineName) throw new Error('Routine name is required');

        const startDate = state.startDate ? new Date(state.startDate) : new Date();
        const durationWeeks = state.durationWeeks || 4;
        const endDate = state.endDate
            ? new Date(state.endDate)
            : (() => {
                const calculated = new Date(startDate);
                calculated.setDate(calculated.getDate() + (durationWeeks * 7));
                return calculated;
            })();

        const hasWarmup = state.warmup?.enabled || (state.warmup?.customText || '').trim().length > 0 || (state.warmup?.cardioExercises?.length || 0) > 0;

        const routineData: CreateRoutineData = {
            clientId,
            name: state.routineName,
            objective: state.objective || '',
            trainingDaysCount: state.daysCount || 0,
            durationWeeks: durationWeeks,
            startDate: startDate,
            endDate: endDate,
            notes: state.notes,
            ...(hasWarmup ? {
                warmup: {
                    enabled: !!state.warmup?.enabled,
                    cardioExercises: state.warmup?.cardioExercises || [],
                    customText: state.warmup?.customText || ''
                }
            } : {})
        };

        // Map wizard days to TrainingDay objects
        const days = state.days.map((day, index) => ({
            dayNumber: index + 1,
            dayName: `Día ${index + 1}`,
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
                isSuperset: isGroupedRoutineExerciseBlockType(ex.blockType) || !!ex.isSuperset,
                blockType: ex.blockType || 'single',
                blockId: ex.blockId || null,
                blockLabel: ex.blockLabel || null,
                blockPosition: ex.blockPosition || null,
                blockRest: ex.blockRest || null,
                ...(ex.weekConfigs && ex.weekConfigs.length > 0 ? { weekConfigs: ex.weekConfigs } : {}),
                order: exIndex
            })),
            notes: ''
        }));

        // Get coach profile to determine gymId for hybrid storage
        const coach = await this.coachService.getCoachProfile(coachId);
        const gymId = coach?.gymId;

        const routineId = await this.createRoutine(coachId, routineData, days, gymId);
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

    // ====================
    // LEGACY GYM METHODS (Deprecated - use main methods with gymId parameter)
    // ====================

    /** @deprecated Use getAllRoutines(coachId, gymId) instead */
    async getAllGymRoutines(gymId: string): Promise<Routine[]> {
        return this.getAllRoutines(gymId, gymId);
    }

    /** @deprecated Use getClientRoutines(coachId, clientId, gymId) instead */
    async getGymClientRoutines(gymId: string, clientId: string): Promise<Routine[]> {
        return this.getClientRoutines(gymId, clientId, gymId);
    }

    /** @deprecated Use deleteRoutinesByClient(coachId, clientId, gymId) instead */
    async deleteGymRoutinesByClient(gymId: string, clientId: string): Promise<void> {
        return this.deleteRoutinesByClient(gymId, clientId, gymId);
    }

    /** @deprecated Use deleteRoutine(coachId, routineId, gymId) instead */
    async deleteGymRoutine(gymId: string, routineId: string): Promise<void> {
        return this.deleteRoutine(gymId, routineId, gymId);
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
