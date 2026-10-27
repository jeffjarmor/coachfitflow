import type { ClientPortalRoutineDetail } from '../client-portal/client-portal-data.service';
import type { RoutinePlan } from './routine.models';
import type { RoutineWithDays } from './routine-pdf.models';

// Date-only database values are calendar days, not UTC instants.
function pdfDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function routinePlanForPdf(plan: RoutinePlan): RoutineWithDays {
  return {
    ...plan, startDate: pdfDate(plan.startDate), endDate: pdfDate(plan.endDate),
    warmup: {
      enabled: plan.warmup.enabled, customText: plan.warmup.customText,
      cardioExercises: plan.warmup.exercises.map(exercise => ({ exerciseId: exercise.id, exerciseName: exercise.name }))
    }
  };
}

export function portalRoutineForPdf(routine: ClientPortalRoutineDetail): RoutineWithDays {
  return {
    ...routine, startDate: pdfDate(routine.startDate), endDate: pdfDate(routine.endDate),
    warmup: {
      enabled: routine.warmupEnabled, customText: routine.warmupCustomText,
      cardioExercises: routine.warmupExercises ?? []
    },
    days: routine.days.map(day => ({
      ...day, dayNumber: day.number, dayName: day.name,
      exercises: day.exercises.map(exercise => ({ ...exercise, exerciseName: exercise.name }))
    }))
  };
}
