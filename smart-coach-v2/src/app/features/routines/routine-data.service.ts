import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { ExerciseItem } from '../../core/data/coach-data.service';
import { isGlobalExerciseImageUrl, isLegacyExerciseSvgPlaceholder } from '../../shared/global-exercise-media';
import {
  RoutineClientOption,
  RoutineDay,
  RoutineDayExercise,
  RoutinePlan,
  RoutineWeekConfig
} from './routine.models';

@Injectable({ providedIn: 'root' })
export class RoutineDataService {
  private readonly supabase = inject(SupabaseService).client;

  async getClients(coachId: string, gymId?: string): Promise<RoutineClientOption[]> {
    if (gymId) {
      const { data, error } = await this.supabase
        .from('client_gym_memberships')
        .select('id,clients(id,name,email)')
        .eq('gym_id', gymId);
      if (error) throw error;
      return (data || []).flatMap((membership: any): RoutineClientOption[] => {
        const client = Array.isArray(membership.clients) ? membership.clients[0] : membership.clients;
        return client ? [{ id: client.id, name: client.name || 'Cliente sin nombre', email: client.email || '' }] : [];
      }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }
    const { data, error } = await this.supabase
      .from('clients')
      .select('id,name,email')
      .eq('primary_coach_id', coachId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map((client) => ({
      id: client.id,
      name: client.name || 'Cliente sin nombre',
      email: client.email || ''
    }));
  }

  async getExercises(coachId: string, gymId?: string): Promise<ExerciseItem[]> {
    const { data, error } = await this.supabase
      .from('exercises')
      .select('id,name,muscle_group,source,image_url,video_url,description,created_at')
      .or(gymId ? `source.eq.global,and(source.eq.coach,gym_id.eq.${gymId})` : `source.eq.global,and(source.eq.coach,coach_id.eq.${coachId},gym_id.is.null)`)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []).map((exercise) => this.mapExercise(exercise));
  }

  async getRoutine(routineId: string, coachId: string, gymId?: string): Promise<RoutinePlan> {
    let routineQuery = this.supabase
      .from('routines')
      .select('id,coach_id,client_id,client_gym_membership_id,name,objective,training_days_count,duration_weeks,start_date,end_date,notes,warmup_enabled,warmup_custom_text,created_at,updated_at,clients(name)')
      .eq('id', routineId);
    if (gymId) {
      const { data: memberships, error: membershipError } = await this.supabase
        .from('client_gym_memberships').select('id').eq('gym_id', gymId);
      if (membershipError) throw membershipError;
      routineQuery = routineQuery.in('client_gym_membership_id', (memberships || []).map((row) => row.id));
    } else {
      routineQuery = routineQuery.eq('coach_id', coachId).is('client_gym_membership_id', null);
    }
    const { data: routine, error: routineError } = await routineQuery.single();
    if (routineError) throw routineError;

    const { data: days, error: daysError } = await this.supabase
      .from('routine_days')
      .select('id,routine_id,day_number,day_name,muscle_groups,notes')
      .eq('routine_id', routineId)
      .order('day_number', { ascending: true });
    if (daysError) throw daysError;

    const dayIds = (days || []).map((day) => day.id);
    const [exerciseResult, warmupResult] = await Promise.all([
      dayIds.length
        ? this.supabase
            .from('routine_day_exercises')
            .select('id,routine_day_id,exercise_id,sets,reps,rest,notes,is_superset,video_url,image_url,order_index,block_type,block_id,block_label,block_position,block_rest,exercises(id,name,muscle_group,source,image_url,video_url)')
            .in('routine_day_id', dayIds)
            .order('order_index', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      this.supabase
        .from('routine_warmup_exercises')
        .select('exercise_id,order_index,exercises(id,name,muscle_group,source,image_url,video_url,description,created_at)')
        .eq('routine_id', routineId)
        .order('order_index', { ascending: true })
    ]);
    if (exerciseResult.error) throw exerciseResult.error;
    if (warmupResult.error) throw warmupResult.error;

    const dayExercises = (exerciseResult.data || []) as any[];
    const dayExerciseIds = dayExercises.map((exercise) => exercise.id);
    const weekConfigs = dayExerciseIds.length
      ? await this.loadWeekConfigs(dayExerciseIds)
      : [];

    const mappedDays: RoutineDay[] = (days || []).map((day) => ({
      id: day.id,
      dayNumber: day.day_number,
      dayName: day.day_name,
      muscleGroups: day.muscle_groups || [],
      notes: day.notes || '',
      exercises: dayExercises
        .filter((exercise) => exercise.routine_day_id === day.id)
        .map((exercise) => this.mapDayExercise(exercise, weekConfigs))
    }));

    return {
      id: routine.id,
      coachId: routine.coach_id,
      clientId: routine.client_id,
      clientGymMembershipId: routine.client_gym_membership_id,
      clientName: this.relatedName(routine.clients),
      name: routine.name,
      objective: routine.objective,
      trainingDaysCount: routine.training_days_count,
      durationWeeks: routine.duration_weeks,
      startDate: routine.start_date || '',
      endDate: routine.end_date || '',
      notes: routine.notes || '',
      createdAt: routine.created_at,
      updatedAt: routine.updated_at,
      warmup: {
        enabled: !!routine.warmup_enabled,
        customText: routine.warmup_custom_text || '',
        exercises: (warmupResult.data || []).flatMap((row: any) => row.exercises ? [this.mapExercise(row.exercises)] : [])
      },
      days: mappedDays
    };
  }

  async saveRoutine(plan: RoutinePlan, coachId: string, gymId?: string): Promise<string> {
    const payload = {
      id: plan.id || null,
      coach_id: coachId,
      client_id: plan.clientId,
      name: plan.name.trim(),
      objective: plan.objective.trim(),
      training_days_count: plan.days.length,
      duration_weeks: plan.durationWeeks,
      start_date: plan.startDate || null,
      end_date: plan.endDate || null,
      notes: plan.notes.trim() || null,
      warmup: {
        enabled: plan.warmup.enabled,
        custom_text: plan.warmup.customText.trim() || null,
        exercise_ids: plan.warmup.exercises.map((exercise) => exercise.id)
      },
      days: plan.days.map((day, dayIndex) => ({
        day_number: dayIndex + 1,
        day_name: day.dayName.trim() || `Día ${dayIndex + 1}`,
        muscle_groups: day.muscleGroups,
        notes: day.notes.trim() || null,
        exercises: day.exercises.map((exercise, exerciseIndex) => ({
          exercise_id: exercise.exerciseId,
          sets: Number(exercise.sets),
          reps: exercise.reps.trim(),
          rest: exercise.rest.trim(),
          notes: exercise.notes.trim() || null,
          video_url: exercise.videoUrl || null,
          image_url: exercise.imageUrl || null,
          order_index: exerciseIndex,
          block_type: exercise.blockType,
          block_id: exercise.blockId,
          block_label: exercise.blockLabel,
          block_position: exercise.blockPosition,
          block_rest: exercise.blockRest,
          week_configs: exercise.weekConfigs.map((config) => ({
            start_week: Number(config.startWeek),
            end_week: Number(config.endWeek),
            sets: Number(config.sets),
            reps: config.reps.trim(),
            rest: config.rest.trim(),
            notes: config.notes.trim() || null
          }))
        }))
      }))
    };

    if (gymId) return this.saveGymRoutine(plan, payload, coachId, gymId);
    const { data, error } = await this.supabase.rpc('save_routine_plan', { p_coach_id: coachId, p_plan: payload });
    if (error) throw error;
    return String(data);
  }

  private async saveGymRoutine(plan: RoutinePlan, payload: any, coachId: string, gymId: string): Promise<string> {
    const membership = await this.supabase.from('client_gym_memberships').select('id')
      .eq('gym_id', gymId).eq('client_id', plan.clientId).single();
    if (membership.error) throw membership.error;
    const permission = await this.supabase.rpc('can_create_routines', { p_gym_id: gymId });
    if (permission.error) throw permission.error;
    if (!permission.data) throw new Error('No tienes permiso para guardar rutinas en este gimnasio.');
    const { id: _id, coach_id: _coachId, warmup, days, ...fields } = payload;
    const routineId = plan.id || crypto.randomUUID();
    const oldDaysResult = plan.id
      ? await this.supabase.from('routine_days').select('id,day_number').eq('routine_id', routineId)
      : { data: [], error: null };
    if (oldDaysResult.error) throw oldDaysResult.error;
    const oldDays = oldDaysResult.data || [];
    const explicitDayIds = new Set(plan.days.flatMap((day) => day.id && oldDays.some((row) => row.id === day.id) ? [day.id] : []));
    const retainedDays = new Set<string>();
    const plannedDays = days.map((day: any, index: number) => {
      const old = oldDays.find((row) => row.id === plan.days[index].id && !retainedDays.has(row.id))
        || oldDays.find((row) => row.day_number === day.day_number && !retainedDays.has(row.id) && !explicitDayIds.has(row.id));
      if (old) retainedDays.add(old.id);
      return { id: old?.id || crypto.randomUUID(), old, day, model: plan.days[index] };
    });
    const removedDays = oldDays.filter((day) => !retainedDays.has(day.id));
    if (removedDays.length) {
      // The deployed independent save RPC has the same guard. Reject before any write:
      // deleting a routine day cascades to the client's training history.
      const history = await this.supabase.from('training_sessions').select('id')
        .in('routine_day_id', removedDays.map((day) => day.id)).limit(1);
      if (history.error) throw history.error;
      if (history.data?.length) throw new Error('No puedes eliminar un día que ya tiene entrenamientos registrados.');
      const [identity, author] = await Promise.all([
        this.supabase.auth.getUser(), this.supabase.from('routines').select('coach_id').eq('id', routineId).single()
      ]);
      if (identity.error) throw identity.error;
      if (author.error) throw author.error;
      // Original RLS may hide another author's sessions even from an administrator.
      if (identity.data.user?.id !== author.data.coach_id) {
        throw new Error('Solo el autor puede retirar días después de comprobar su historial de entrenamientos.');
      }
    }
    const oldExerciseResult = oldDays.length
      ? await this.supabase.from('routine_day_exercises').select('id,routine_day_id,order_index').in('routine_day_id', oldDays.map((day) => day.id))
      : { data: [], error: null };
    if (oldExerciseResult.error) throw oldExerciseResult.error;
    const oldExercises = oldExerciseResult.data || [];
    const explicitExerciseIds = new Set(plan.days.flatMap((day) => day.exercises.flatMap((exercise) =>
      exercise.id && oldExercises.some((row) => row.id === exercise.id) ? [exercise.id] : [])));
    const retainedExercises = new Set<string>();
    const plannedExercises: any[] = [];
    for (const plannedDay of plannedDays) {
      plannedDay.day.exercises.forEach((exercise: any, index: number) => {
        const old = oldExercises.find((row) => row.id === plannedDay.model.exercises[index].id && !retainedExercises.has(row.id))
          || oldExercises.find((row) => row.routine_day_id === plannedDay.id && row.order_index === index
            && !retainedExercises.has(row.id) && !explicitExerciseIds.has(row.id));
        if (old) retainedExercises.add(old.id);
        plannedExercises.push({ id: old?.id || crypto.randomUUID(), old, exercise, dayId: plannedDay.id, model: plannedDay.model.exercises[index] });
      });
    }
    const header = {
      ...fields, client_gym_membership_id: membership.data.id,
      warmup_enabled: warmup.enabled, warmup_custom_text: warmup.custom_text,
      updated_at: new Date().toISOString()
    };
    if (plan.id) {
      const memberships = await this.supabase.from('client_gym_memberships').select('id').eq('gym_id', gymId);
      if (memberships.error) throw memberships.error;
      // Preserve the author. The deployed RLS permits an author/admin to edit, not every gym trainer.
      const saved = await this.supabase.from('routines').update(header).eq('id', routineId)
        .in('client_gym_membership_id', (memberships.data || []).map((row) => row.id)).select('id');
      if (saved.error) throw saved.error;
      if (!saved.data?.length) throw new Error('No tienes permiso para editar esta rutina.');
    } else {
      const saved = await this.supabase.from('routines').insert({ ...header, id: routineId, coach_id: coachId }).select('id').single();
      if (saved.error) throw saved.error;
      // Retain the created header on the draft so a failed detail write can be retried without duplication.
      plan.id = routineId;
    }
    // Sync the original tables without recreating days or exercise rows. Stable day IDs
    // preserve training_sessions and RIR sets when a routine is edited.
    const temporaryDayNumber = Math.max(days.length, ...oldDays.map((day) => day.day_number), 0) + 1;
    for (const [index, old] of oldDays.entries()) {
      const planned = plannedDays.find((day: any) => day.id === old.id);
      if (!planned || planned.day.day_number !== old.day_number) {
        this.confirmDetailWrite(await this.supabase.from('routine_days').update({ day_number: temporaryDayNumber + index })
          .eq('id', old.id).eq('routine_id', routineId).select('id'));
      }
    }
    for (const planned of plannedDays) {
      const { exercises: _exercises, ...dayFields } = planned.day;
      const values = { ...dayFields, routine_id: routineId };
      this.confirmDetailWrite(planned.old
        ? await this.supabase.from('routine_days').update(values).eq('id', planned.id).eq('routine_id', routineId).select('id')
        : await this.supabase.from('routine_days').insert({ ...values, id: planned.id }).select('id'));
      planned.model.id = planned.id;
    }
    const removedExercises = oldExercises.filter((exercise) => !retainedExercises.has(exercise.id));
    if (removedExercises.length) {
      this.confirmDetailWrite(await this.supabase.from('routine_day_exercises').delete()
        .in('id', removedExercises.map((exercise) => exercise.id)).select('id'), removedExercises.length);
    }
    const temporaryOrder = Math.max(...oldExercises.map((exercise) => exercise.order_index), plannedExercises.length, 0) + 1;
    for (const [index, planned] of plannedExercises.entries()) {
      if (planned.old && (planned.old.order_index !== planned.exercise.order_index || planned.old.routine_day_id !== planned.dayId)) {
        this.confirmDetailWrite(await this.supabase.from('routine_day_exercises').update({ order_index: temporaryOrder + index })
          .eq('id', planned.id).select('id'));
      }
    }
    for (const planned of plannedExercises) {
      const { week_configs: weekConfigs, ...exerciseFields } = planned.exercise;
      const values = { ...exerciseFields, routine_day_id: planned.dayId,
        is_superset: planned.exercise.block_type === 'biserie' || planned.exercise.block_type === 'triserie' };
      this.confirmDetailWrite(planned.old
        ? await this.supabase.from('routine_day_exercises').update(values).eq('id', planned.id).select('id')
        : await this.supabase.from('routine_day_exercises').insert({ ...values, id: planned.id }).select('id'));
      planned.model.id = planned.id;
      const clearedConfigs = await this.supabase.from('routine_week_configs').delete().eq('routine_day_exercise_id', planned.id);
      if (clearedConfigs.error) throw clearedConfigs.error;
      if (weekConfigs.length) {
        const savedConfigs = await this.supabase.from('routine_week_configs').insert(
          weekConfigs.map((config: any) => ({ ...config, routine_day_exercise_id: planned.id }))
        );
        if (savedConfigs.error) throw savedConfigs.error;
      }
    }
    if (removedDays.length) {
      this.confirmDetailWrite(await this.supabase.from('routine_days').delete().eq('routine_id', routineId)
        .in('id', removedDays.map((day) => day.id)).select('id'), removedDays.length);
    }
    const clearedWarmup = await this.supabase.from('routine_warmup_exercises').delete().eq('routine_id', routineId);
    if (clearedWarmup.error) throw clearedWarmup.error;
    if (warmup.exercise_ids.length) {
      const savedWarmup = await this.supabase.from('routine_warmup_exercises').insert(
        warmup.exercise_ids.map((exerciseId: string, index: number) => ({ routine_id: routineId, exercise_id: exerciseId, order_index: index }))
      );
      if (savedWarmup.error) throw savedWarmup.error;
    }
    return routineId;
  }

  private confirmDetailWrite(result: { data: any[] | null; error: any }, expected = 1): void {
    if (result.error) throw result.error;
    if (result.data?.length !== expected) throw new Error('No pudimos guardar todos los detalles de la rutina. Comprueba tus permisos.');
  }

  async deleteRoutine(routineId: string, coachId: string, gymId?: string): Promise<void> {
    let query = this.supabase
      .from('routines')
      .delete()
      .eq('id', routineId);
    if (gymId) {
      const { data: memberships, error: membershipError } = await this.supabase
        .from('client_gym_memberships').select('id').eq('gym_id', gymId);
      if (membershipError) throw membershipError;
      query = query.in('client_gym_membership_id', (memberships || []).map((row) => row.id));
    } else {
      query = query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    }
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para eliminar esta rutina.');
  }

  private async loadWeekConfigs(exerciseIds: string[]): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('routine_week_configs')
      .select('id,routine_day_exercise_id,start_week,end_week,sets,reps,rest,notes')
      .in('routine_day_exercise_id', exerciseIds)
      .order('start_week', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  private mapDayExercise(row: any, configs: any[]): RoutineDayExercise {
    const exercise = Array.isArray(row.exercises) ? row.exercises[0] : row.exercises;
    const useCurrentGlobalImage = exercise?.source === 'global'
      && isGlobalExerciseImageUrl(exercise.image_url)
      && (!row.image_url?.trim() || isLegacyExerciseSvgPlaceholder(row.image_url));
    return {
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: exercise?.name || 'Ejercicio',
      muscleGroup: exercise?.muscle_group || 'Full Body',
      source: exercise?.source === 'coach' ? 'coach' : 'global',
      imageUrl: useCurrentGlobalImage ? exercise.image_url : row.image_url || exercise?.image_url || null,
      videoUrl: row.video_url || exercise?.video_url || null,
      sets: row.sets,
      reps: row.reps,
      rest: row.rest,
      notes: row.notes || '',
      order: row.order_index + 1,
      blockType: row.block_type === 'biserie' || row.block_type === 'triserie' ? row.block_type : 'single',
      blockId: row.block_id,
      blockLabel: row.block_label,
      blockPosition: row.block_position,
      blockRest: row.block_rest,
      isSuperset: !!row.is_superset,
      weekConfigs: configs
        .filter((config) => config.routine_day_exercise_id === row.id)
        .map((config): RoutineWeekConfig => ({
          id: config.id,
          startWeek: config.start_week,
          endWeek: config.end_week,
          sets: config.sets,
          reps: config.reps,
          rest: config.rest,
          notes: config.notes || ''
        }))
    };
  }

  private mapExercise(row: any): ExerciseItem {
    return {
      id: row.id,
      name: row.name || 'Ejercicio sin nombre',
      muscleGroup: row.muscle_group || 'Full Body',
      source: row.source === 'coach' ? 'coach' : 'global',
      imageUrl: row.image_url,
      videoUrl: row.video_url,
      description: row.description,
      createdAt: row.created_at
    };
  }

  private relatedName(value: any): string {
    const related = Array.isArray(value) ? value[0] : value;
    return related?.name || 'Cliente';
  }
}
