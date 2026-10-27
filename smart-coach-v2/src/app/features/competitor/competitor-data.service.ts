import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  CompetitorClientOption,
  CompetitorExerciseBlock,
  CompetitorSheet,
  CompetitorWeekPlan,
  CompetitorWorkout,
  createExerciseBlock,
  createWorkout,
  workoutKey
} from './competitor.models';

@Injectable({ providedIn: 'root' })
export class CompetitorDataService {
  private readonly supabase = inject(SupabaseService).client;

  async getClients(coachId: string, gymId?: string): Promise<CompetitorClientOption[]> {
    if (gymId) {
      const { data, error } = await this.supabase
        .from('client_gym_memberships')
        .select('clients(id,name,email)')
        .eq('gym_id', gymId);
      if (error) throw error;
      return (data || []).flatMap((membership: any): CompetitorClientOption[] => {
        const client = Array.isArray(membership.clients) ? membership.clients[0] : membership.clients;
        return client ? [{ id: client.id, name: client.name || 'Atleta sin nombre', email: client.email || '' }] : [];
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
      name: client.name || 'Atleta sin nombre',
      email: client.email || ''
    }));
  }

  async getSheet(sheetId: string, coachId: string, gymId?: string): Promise<CompetitorSheet> {
    let query = this.supabase
      .from('competitor_sheets')
      .select('id,coach_id,client_id,client_gym_membership_id,program_title,mesocycle_title,macrocycle_title,frequency_text,split_text,training_days_text,day_labels,week_plans,workouts,created_at,updated_at,clients(name)')
      .eq('id', sheetId);
    if (gymId) {
      const { data: memberships, error: membershipError } = await this.supabase
        .from('client_gym_memberships').select('id').eq('gym_id', gymId);
      if (membershipError) throw membershipError;
      query = query.in('client_gym_membership_id', (memberships || []).map((row) => row.id));
    } else {
      query = query.eq('coach_id', coachId).is('client_gym_membership_id', null);
    }
    const { data, error } = await query.single();
    if (error) throw error;

    const client = Array.isArray(data.clients) ? data.clients[0] : data.clients;
    const dayLabels = this.asDayLabels(data.day_labels);
    const workouts = this.asWorkouts(data.workouts);
    return {
      id: data.id,
      coachId: data.coach_id,
      clientId: data.client_id,
      clientGymMembershipId: data.client_gym_membership_id,
      clientName: client?.name || 'Atleta',
      programTitle: data.program_title || '',
      mesocycleTitle: data.mesocycle_title || '',
      macrocycleTitle: data.macrocycle_title || '',
      frequencyText: data.frequency_text || '',
      splitText: data.split_text || '',
      trainingDaysText: data.training_days_text || '',
      dayLabels,
      weekPlans: this.asWeekPlans(data.week_plans, dayLabels.length),
      workouts,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async saveSheet(sheet: CompetitorSheet, coachId: string, gymId?: string): Promise<string> {
    const payload = {
      id: sheet.id || null,
      client_id: sheet.clientId,
      program_title: sheet.programTitle.trim() || null,
      mesocycle_title: sheet.mesocycleTitle.trim(),
      macrocycle_title: sheet.macrocycleTitle.trim(),
      frequency_text: sheet.frequencyText.trim(),
      split_text: sheet.splitText.trim(),
      training_days_text: sheet.trainingDaysText.trim(),
      day_labels: sheet.dayLabels.map((day) => day.trim()),
      week_plans: sheet.weekPlans.map((week) => ({
        weekLabel: week.weekLabel.trim(),
        workouts: sheet.dayLabels.map((_day, index) => week.workouts[index] || '')
      })),
      workouts: sheet.workouts.map((workout, index) => ({
        key: workoutKey(index),
        title: workout.title.trim(),
        subtitle: workout.subtitle.trim(),
        code: workout.code.trim(),
        blocks: workout.blocks.map((block) => ({
          name: block.name.trim(),
          note: block.note.trim(),
          microcycles: block.microcycles.map((microcycle) => ({
            series: microcycle.series.trim(),
            reps: microcycle.reps.trim()
          })),
          rest: block.rest.map((rest) => rest.trim())
        }))
      }))
    };
    if (gymId) {
      const membership = await this.supabase.from('client_gym_memberships').select('id')
        .eq('gym_id', gymId).eq('client_id', sheet.clientId).single();
      if (membership.error) throw membership.error;
      const { id: _id, ...fields } = payload;
      const values = { ...fields, client_gym_membership_id: membership.data.id, updated_at: new Date().toISOString() };
      if (sheet.id) {
        const memberships = await this.supabase.from('client_gym_memberships').select('id').eq('gym_id', gymId);
        if (memberships.error) throw memberships.error;
        // Preserve the author and honor the original author/admin RLS policy.
        const saved = await this.supabase.from('competitor_sheets').update(values).eq('id', sheet.id)
          .in('client_gym_membership_id', (memberships.data || []).map((row) => row.id)).select('id');
        if (saved.error) throw saved.error;
        if (!saved.data?.length) throw new Error('No tienes permiso para editar esta hoja.');
        return saved.data[0].id;
      }
      const saved = await this.supabase.from('competitor_sheets').insert({ ...values, coach_id: coachId }).select('id').single();
      if (saved.error) throw saved.error;
      return saved.data.id;
    }
    const { data, error } = await this.supabase.rpc('save_competitor_sheet', { p_coach_id: coachId, p_sheet: payload });
    if (error) throw error;
    return String(data);
  }

  async deleteSheet(sheetId: string, coachId: string, gymId?: string): Promise<void> {
    let query = this.supabase
      .from('competitor_sheets')
      .delete()
      .eq('id', sheetId);
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
    if (!data?.length) throw new Error('No tienes permiso para eliminar esta hoja.');
  }

  private asDayLabels(value: unknown): string[] {
    return Array.isArray(value) && value.length
      ? value.map((day) => String(day || '').trim()).filter(Boolean)
      : ['Lunes', 'Miércoles', 'Viernes'];
  }

  private asWeekPlans(value: unknown, dayCount: number): CompetitorWeekPlan[] {
    if (!Array.isArray(value)) return [];
    return value.map((week: any, index) => ({
      weekLabel: String(week?.weekLabel || week?.week_label || `Semana ${index + 1}`),
      workouts: Array.from({ length: dayCount }, (_item, dayIndex) => String(week?.workouts?.[dayIndex] || ''))
    }));
  }

  private asWorkouts(value: unknown): CompetitorWorkout[] {
    if (!Array.isArray(value) || !value.length) return [createWorkout(0)];
    return value.map((workout: any, workoutIndex) => ({
      key: workoutKey(workoutIndex),
      title: String(workout?.title || `Entrenamiento ${workoutKey(workoutIndex)}`),
      subtitle: String(workout?.subtitle || ''),
      code: String(workout?.code || workoutKey(workoutIndex)),
      blocks: Array.isArray(workout?.blocks) && workout.blocks.length
        ? workout.blocks.map((block: any) => this.asBlock(block))
        : [createExerciseBlock()]
    }));
  }

  private asBlock(value: any): CompetitorExerciseBlock {
    const defaults = createExerciseBlock();
    return {
      name: String(value?.name || defaults.name),
      note: String(value?.note || ''),
      microcycles: [0, 1, 2].map((index) => ({
        series: String(value?.microcycles?.[index]?.series || defaults.microcycles[index].series),
        reps: String(value?.microcycles?.[index]?.reps || defaults.microcycles[index].reps)
      })) as CompetitorExerciseBlock['microcycles'],
      rest: [0, 1, 2].map((index) => String(value?.rest?.[index] || defaults.rest[index])) as CompetitorExerciseBlock['rest']
    };
  }
}
