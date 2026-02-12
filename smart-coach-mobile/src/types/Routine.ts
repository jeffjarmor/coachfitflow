// Routine models mirroring Angular app
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
    createdAt: Date;
    updatedAt?: Date;
}

export interface TrainingDay {
    id: string;
    routineId: string;
    dayNumber: number;
    dayName: string;
    muscleGroups: string[];
    exercises: DayExercise[];
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
    defaultVideoUrl?: string;
    videoUrl?: string; // Override for this routine
    imageUrl?: string;
    order: number; // Order within the day
}

export interface WeekConfig {
    startWeek: number;
    endWeek: number;
    sets: number;
    reps: string;
    rest: string;
    notes?: string;
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
}

export interface RoutineWithDays extends Routine {
    days: TrainingDay[];
}
