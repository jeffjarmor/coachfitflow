// Fields consumed by the original PDF layout. Application permissions stay in the data services.
export { DEFAULT_BRAND_COLOR as DEFAULT_COACH_BRAND_COLOR } from '../../core/data/branding';
export const DEFAULT_COACH_LOGO_URL = '/assets/brand/coach-fitflow-icon-dark-square.svg';

export interface Coach {
  name: string;
  email?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
}

export interface Client {
  name: string;
  age?: number | null;
  weight?: number | null;
  height?: number | null;
}

export interface RoutinePdfContext { client: Client; coach: Coach; }

export interface Routine {
  name: string;
  objective: string;
  trainingDaysCount: number;
  startDate?: Date;
  endDate?: Date;
  notes?: string | null;
  warmup?: {
    enabled: boolean;
    customText?: string | null;
    cardioExercises?: { exerciseId: string; exerciseName: string }[];
  };
}

export interface RoutineWithDays extends Routine { days: TrainingDay[]; }
export interface TrainingDay {
  dayNumber: number;
  dayName: string;
  muscleGroups: string[];
  notes?: string | null;
  exercises: DayExercise[];
}

export interface DayExercise {
  exerciseId?: string;
  exerciseName: string;
  source?: string | null;
  imageUrl?: string | null;
  sets: number;
  reps: string;
  rest: string;
  notes?: string | null;
  videoUrl?: string | null;
  isSuperset?: boolean;
  blockType?: string;
  blockLabel?: string | null;
  blockPosition?: number | null;
  weekConfigs?: {
    startWeek: number; endWeek: number; sets: number; reps: string; rest: string; notes?: string | null;
  }[];
}

export function isGroupedRoutineExerciseBlockType(type?: string): boolean {
  return type === 'biserie' || type === 'triserie';
}

export function getRoutineExerciseBlockLabel(type?: string): string {
  return type === 'biserie' ? 'Biserie' : type === 'triserie' ? 'Triserie' : '';
}
