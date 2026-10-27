import { ExerciseItem } from '../../core/data/coach-data.service';

export type RoutineBlockType = 'single' | 'biserie' | 'triserie';

export interface RoutineWeekConfig {
  id?: string;
  startWeek: number;
  endWeek: number;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
}

export interface RoutineDayExercise {
  id?: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  source: 'global' | 'coach';
  imageUrl?: string | null;
  videoUrl?: string | null;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
  order: number;
  blockType: RoutineBlockType;
  blockId: string | null;
  blockLabel: string | null;
  blockPosition: number | null;
  blockRest: string | null;
  isSuperset?: boolean;
  weekConfigs: RoutineWeekConfig[];
}

export interface RoutineDay {
  id?: string;
  dayNumber: number;
  dayName: string;
  muscleGroups: string[];
  notes: string;
  exercises: RoutineDayExercise[];
}

export interface RoutineWarmup {
  enabled: boolean;
  customText: string;
  exercises: ExerciseItem[];
}

export interface RoutinePlan {
  id?: string;
  coachId?: string;
  clientId: string;
  clientGymMembershipId?: string | null;
  clientName: string;
  name: string;
  objective: string;
  trainingDaysCount: number;
  durationWeeks: number | null;
  startDate: string;
  endDate: string;
  notes: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  warmup: RoutineWarmup;
  /** Builder defaults; effective ranges are saved on each exercise, as in V1. */
  generalWeekConfigs?: RoutineWeekConfig[];
  days: RoutineDay[];
}

export interface RoutineClientOption {
  id: string;
  name: string;
  email: string;
}

export const MUSCLE_GROUPS = [
  'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Antebrazos',
  'Piernas', 'Cuádriceps', 'Isquiotibiales', 'Glúteos', 'Aductores',
  'Abductores', 'Pantorrillas', 'Core', 'Abdominales', 'Cardio',
  'Potencia', 'Rehabilitación', 'Full Body'
] as const;

export function emptyRoutinePlan(clientId = '', clientName = ''): RoutinePlan {
  const startDate = new Date().toISOString().slice(0, 10);
  return {
    clientId,
    clientName,
    name: '',
    objective: '',
    trainingDaysCount: 3,
    durationWeeks: 4,
    startDate,
    endDate: calculateRoutineEndDate(startDate, 4),
    notes: '',
    warmup: { enabled: false, customText: '', exercises: [] },
    generalWeekConfigs: [],
    days: createRoutineDays(3)
  };
}

export function createRoutineDays(count: number, current: RoutineDay[] = []): RoutineDay[] {
  return Array.from({ length: count }, (_, index) => current[index] || {
    dayNumber: index + 1,
    dayName: `Día ${index + 1}`,
    muscleGroups: [],
    notes: '',
    exercises: []
  }).map((day, index) => ({ ...day, dayNumber: index + 1 }));
}

export function calculateRoutineEndDate(startDate: string, weeks: number | null): string {
  if (!startDate || weeks == null || !Number.isInteger(weeks) || weeks < 1 || weeks > 52) return '';
  const date = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

export function createRoutineExercise(exercise: ExerciseItem, order: number): RoutineDayExercise {
  return {
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    muscleGroup: exercise.muscleGroup,
    source: exercise.source,
    imageUrl: exercise.imageUrl,
    videoUrl: exercise.videoUrl,
    sets: 3,
    reps: '10-12',
    rest: '60 s',
    notes: '',
    order,
    blockType: 'single',
    blockId: null,
    blockLabel: null,
    blockPosition: null,
    blockRest: null,
    weekConfigs: []
  };
}
