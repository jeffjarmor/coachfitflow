export type WorkoutKey = string;

export interface CompetitorMicrocycleConfig {
    series: string;
    reps: string;
}

export interface CompetitorExerciseBlock {
    name: string;
    note?: string;
    microcycles: [CompetitorMicrocycleConfig, CompetitorMicrocycleConfig, CompetitorMicrocycleConfig];
    rest: [string, string, string];
}

export interface CompetitorWorkoutSheet {
    key: WorkoutKey;
    title: string;
    subtitle: string;
    code: string;
    blocks: CompetitorExerciseBlock[];
}

export interface CompetitorWeekPlan {
    weekLabel: string;
    workouts: string[]; // Dynamic array of workout assignments
}

export interface CompetitorSheet {
    id?: string;
    coachId?: string;
    clientId: string;
    programTitle?: string;
    mesocycleTitle: string;
    macrocycleTitle: string;
    frequencyText: string;
    splitText: string;
    trainingDaysText: string;
    dayLabels: string[]; // e.g., ['Lunes', 'Martes', 'Miércoles', ...]
    weekPlans: CompetitorWeekPlan[];
    workouts: CompetitorWorkoutSheet[];
    createdAt?: any;
    updatedAt?: any;
}
