export interface Exercise {
    id: string;
    name: string;
    muscleGroup: string;
    imageUrl?: string;
    videoUrl?: string;
    description?: string;
    isGlobal: boolean;
    coachId?: string; // Only for coach-specific exercises
    createdAt: Date;
    updatedAt?: Date;
}

export interface CreateExerciseData {
    name: string;
    muscleGroup: string;
    imageUrl?: string;
    videoUrl?: string;
    description?: string;
    isGlobal?: boolean;
}

export interface UpdateExerciseData {
    name?: string;
    muscleGroup?: string;
    imageUrl?: string;
    videoUrl?: string;
    description?: string;
}

export type ExerciseSource = 'global' | 'coach';
