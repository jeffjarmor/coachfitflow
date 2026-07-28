// Routine models
export type RoutineExerciseBlockType = 'single' | 'biserie' | 'triserie';

export function isRoutineExerciseBlockType(value: unknown): value is RoutineExerciseBlockType {
    return value === 'single' || value === 'biserie' || value === 'triserie';
}

export function isGroupedRoutineExerciseBlockType(value: unknown): value is Exclude<RoutineExerciseBlockType, 'single'> {
    return value === 'biserie' || value === 'triserie';
}

export function getRoutineExerciseBlockSize(type: RoutineExerciseBlockType | null | undefined): number {
    if (type === 'triserie') return 3;
    if (type === 'biserie') return 2;
    return 1;
}

export function getRoutineExerciseBlockLabel(type: RoutineExerciseBlockType | null | undefined): string {
    if (type === 'triserie') return 'Triserie';
    if (type === 'biserie') return 'Biserie';
    return '';
}

export interface Routine {
    id: string;
    coachId: string;
    clientId: string;
    name: string;
    objective: string;
    trainingDaysCount: number;
    durationWeeks: number;
    startDate?: Date;
    endDate?: Date;
    notes?: string;
    warmup?: RoutineWarmup;
    createdAt: Date;
    updatedAt?: Date;
}

import { Exercise } from './exercise.model';

export interface TrainingDay {
    id: string;
    routineId: string;
    dayNumber: number;
    dayName: string;
    muscleGroups: string[];
    exercises: DayExercise[];
    notes?: string;
}

export interface WeekConfig {
    startWeek: number;
    endWeek: number;
    sets: number;
    reps: string;
    rest: string;
    notes?: string;
}

export interface DayExercise {
    exerciseId: string;
    exerciseSource: 'global' | 'coach';
    exerciseName: string;
    muscleGroup: string;
    sets: number;
    reps: string; // e.g., "12", "8-10", "15-20"
    rest: string; // e.g., "60s", "90s", "2min"
    notes?: string;
    weekConfigs?: WeekConfig[]; // Progressive overload configurations
    isSuperset: boolean;
    blockType?: RoutineExerciseBlockType;
    blockId?: string | null;
    blockLabel?: string | null;
    blockPosition?: number | null;
    blockRest?: string | null;
    defaultVideoUrl?: string;
    videoUrl?: string; // Override for this routine
    imageUrl?: string;
    order: number; // Order within the day
}

export interface CreateRoutineData {
    clientId: string;
    name: string;
    objective: string;
    trainingDaysCount: number;
    durationWeeks: number;
    startDate?: Date;
    endDate?: Date;
    notes?: string;
    warmup?: RoutineWarmup;
}

export interface RoutineWithDays extends Routine {
    days: TrainingDay[];
}

export interface RoutineWarmupCardioExercise {
    exerciseId: string;
    exerciseName: string;
}

export interface RoutineWarmup {
    enabled: boolean;
    cardioExercises?: RoutineWarmupCardioExercise[];
    customText?: string;
}

// Wizard specific types
export interface WizardDayExercise extends Omit<DayExercise, 'exerciseId' | 'exerciseSource' | 'exerciseName' | 'muscleGroup' | 'videoUrl' | 'imageUrl'> {
    exercise: Exercise;
}

// Wizard state interface
export interface RoutineWizardState {
    step: number;
    clientId?: string;
    clientName?: string;
    routineName?: string;
    objective?: string;
    daysCount?: number;
    durationWeeks?: number;
    startDate?: Date;
    endDate?: Date;
    notes?: string;
    warmup?: RoutineWarmup;
    days: {
        muscleGroups: string[];
        exercises: WizardDayExercise[];
    }[];
    selectedExercises: Exercise[];
}
