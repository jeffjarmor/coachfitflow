export interface GlobalExerciseSeed {
  name: string;
  muscleGroup: string;
  description?: string | null;
  videoUrl?: string | null;
  imageUrl?: string | null;
  isGlobal?: boolean;
}

export interface GlobalExerciseRecord extends GlobalExerciseSeed {
  id: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SeedResult {
  added: number;
  skipped: number;
  total: number;
}
