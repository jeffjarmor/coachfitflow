export interface CompetitorMicrocycle {
  series: string;
  reps: string;
}

export interface CompetitorExerciseBlock {
  name: string;
  note: string;
  microcycles: [CompetitorMicrocycle, CompetitorMicrocycle, CompetitorMicrocycle];
  rest: [string, string, string];
}

export interface CompetitorWorkout {
  key: string;
  title: string;
  subtitle: string;
  code: string;
  blocks: CompetitorExerciseBlock[];
}

export interface CompetitorWeekPlan {
  weekLabel: string;
  workouts: string[];
}

export interface CompetitorSheet {
  id?: string;
  coachId?: string;
  clientId: string;
  clientGymMembershipId?: string | null;
  clientName: string;
  programTitle: string;
  mesocycleTitle: string;
  macrocycleTitle: string;
  frequencyText: string;
  splitText: string;
  trainingDaysText: string;
  dayLabels: string[];
  weekPlans: CompetitorWeekPlan[];
  workouts: CompetitorWorkout[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CompetitorClientOption {
  id: string;
  name: string;
  email: string;
}

export function createExerciseBlock(name = 'Nuevo ejercicio'): CompetitorExerciseBlock {
  return {
    name,
    note: '',
    microcycles: [
      { series: '2x', reps: '8-10' },
      { series: '3x', reps: '8-10' },
      { series: '3x', reps: '6-8' }
    ],
    rest: ['60 s', '75 s', '90 s']
  };
}

export function createWorkout(index: number): CompetitorWorkout {
  const key = workoutKey(index);
  return {
    key,
    title: `Entrenamiento ${key}`,
    subtitle: 'Preparación específica',
    code: `COMP-${key}`,
    blocks: [createExerciseBlock()]
  };
}

export function createCompetitorSheet(clientId = '', clientName = ''): CompetitorSheet {
  return {
    clientId,
    clientName,
    programTitle: '',
    mesocycleTitle: '',
    macrocycleTitle: '',
    frequencyText: '',
    splitText: '',
    trainingDaysText: '',
    dayLabels: ['Lunes', 'Miércoles', 'Viernes'],
    weekPlans: [{ weekLabel: 'Semana 1', workouts: ['A', '', 'A'] }],
    workouts: [createWorkout(0)]
  };
}

export function workoutKey(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}
