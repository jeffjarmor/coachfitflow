import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { GymClientProfile } from '../models/gym-client.model';
import { DayExercise, Routine, TrainingDay } from '../models/routine.model';
import {
    RecentCoachRirActivity,
    TrainingHistoryItem,
    TrainingSession,
    TrainingSessionSet,
    TrainingSetEntryInput
} from '../models/training-log.model';

@Injectable({
    providedIn: 'root'
})
export class TrainingLogService {
    private supabase = inject(SupabaseService).client;

    private mapSession(row: any): TrainingSession {
        return {
            id: row.id,
            routineId: row.routine_id,
            routineDayId: row.routine_day_id,
            clientId: row.client_id,
            coachId: row.coach_id,
            clientGymMembershipId: row.client_gym_membership_id,
            portalScope: row.portal_scope,
            sessionDate: row.session_date,
            status: row.status,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            updatedAt: row.updated_at
        } as TrainingSession;
    }

    private mapSet(row: any): TrainingSessionSet {
        return {
            id: row.id,
            trainingSessionId: row.training_session_id,
            routineDayId: row.routine_day_id,
            exerciseId: row.exercise_id,
            exerciseName: row.exercise_name,
            exerciseOrder: row.exercise_order,
            setNumber: row.set_number,
            plannedReps: row.planned_reps,
            actualReps: row.actual_reps,
            rir: row.rir,
            load: row.load,
            loadUnit: row.load_unit || 'kg',
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        } as TrainingSessionSet;
    }

    private todayIsoDate(): string {
        return new Date().toISOString().slice(0, 10);
    }

    async getOrCreateSession(
        profile: GymClientProfile,
        routine: Routine,
        day: TrainingDay
    ): Promise<TrainingSession> {
        const sessionDate = this.todayIsoDate();
        let membershipId: string | null = null;

        if (profile.scope === 'gym' && profile.gymId) {
            const { data: membership } = await this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('gym_id', profile.gymId)
                .eq('client_id', profile.clientId)
                .maybeSingle();
            membershipId = membership?.id || null;
        }

        let query: any = this.supabase
            .from('training_sessions')
            .select('*')
            .eq('routine_id', routine.id)
            .eq('routine_day_id', day.id)
            .eq('client_id', profile.clientId)
            .eq('session_date', sessionDate)
            .limit(1);

        if (membershipId) {
            query = query.eq('client_gym_membership_id', membershipId);
        } else {
            query = query.is('client_gym_membership_id', null);
        }

        const { data: existing, error: existingError } = await query.maybeSingle();
        if (existingError) throw existingError;
        if (existing) return this.mapSession(existing);

        const payload: any = {
            routine_id: routine.id,
            routine_day_id: day.id,
            client_id: profile.clientId,
            coach_id: routine.coachId,
            client_gym_membership_id: membershipId,
            portal_scope: profile.scope,
            session_date: sessionDate,
            status: 'in_progress'
        };

        const { data, error } = await this.supabase
            .from('training_sessions')
            .insert(payload)
            .select('*')
            .single();

        if (error) throw error;
        return this.mapSession(data);
    }

    async getSessionSets(sessionId: string): Promise<TrainingSessionSet[]> {
        const { data, error } = await this.supabase
            .from('training_session_sets')
            .select('*')
            .eq('training_session_id', sessionId)
            .order('exercise_order', { ascending: true })
            .order('set_number', { ascending: true });

        if (error) throw error;
        return (data || []).map((row: any) => this.mapSet(row));
    }

    async saveSetEntry(
        sessionId: string,
        day: TrainingDay,
        exercise: DayExercise,
        setNumber: number,
        input: TrainingSetEntryInput
    ): Promise<TrainingSessionSet> {
        const payload = {
            training_session_id: sessionId,
            routine_day_id: day.id,
            exercise_id: exercise.exerciseId,
            exercise_name: exercise.exerciseName,
            exercise_order: exercise.order,
            set_number: setNumber,
            planned_reps: exercise.reps,
            actual_reps: input.actualReps ?? null,
            rir: input.rir ?? null,
            load: input.load ?? null,
            load_unit: input.loadUnit || 'kg',
            notes: input.notes || null,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await this.supabase
            .from('training_session_sets')
            .upsert(payload, {
                onConflict: 'training_session_id,routine_day_id,exercise_order,set_number'
            })
            .select('*')
            .single();

        if (error) throw error;

        await this.supabase
            .from('training_sessions')
            .update({
                updated_at: new Date().toISOString(),
                status: 'in_progress'
            })
            .eq('id', sessionId);

        return this.mapSet(data);
    }

    async getClientTrainingHistory(
        coachId: string,
        clientId: string,
        options?: { gymId?: string | null; limit?: number }
    ): Promise<TrainingHistoryItem[]> {
        let query = this.supabase
            .from('training_sessions')
            .select('*')
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
            .order('started_at', { ascending: false })
            .limit(options?.limit || 20);

        if (options?.gymId) {
            const { data: membership } = await this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('gym_id', options.gymId)
                .eq('client_id', clientId)
                .maybeSingle();
            query = query.eq('client_gym_membership_id', membership?.id || null);
        } else {
            query = query.is('client_gym_membership_id', null);
        }

        const { data: sessionRows, error: sessionsError } = await query;
        if (sessionsError) throw sessionsError;

        const sessions = (sessionRows || []).map((row: any) => this.mapSession(row));
        if (sessions.length === 0) return [];

        const sessionIds = sessions.map((session) => session.id);
        const { data: setRows, error: setsError } = await this.supabase
            .from('training_session_sets')
            .select('*')
            .in('training_session_id', sessionIds)
            .order('exercise_order', { ascending: true })
            .order('set_number', { ascending: true });

        if (setsError) throw setsError;

        const setsBySessionId = new Map<string, TrainingSessionSet[]>();
        for (const row of setRows || []) {
            const set = this.mapSet(row);
            const list = setsBySessionId.get(set.trainingSessionId) || [];
            list.push(set);
            setsBySessionId.set(set.trainingSessionId, list);
        }

        return sessions.map((session) => ({
            session,
            sets: setsBySessionId.get(session.id) || []
        }));
    }

    async getRecentCoachRirActivity(
        coachId: string,
        options?: { portalScope?: 'gym' | 'independent'; limit?: number }
    ): Promise<RecentCoachRirActivity[]> {
        let query = this.supabase
            .from('training_sessions')
            .select('id, client_id, routine_day_id, session_date, updated_at, portal_scope, client_gym_membership_id')
            .eq('coach_id', coachId)
            .order('updated_at', { ascending: false })
            .limit(options?.limit || 8);

        if (options?.portalScope) {
            query = query.eq('portal_scope', options.portalScope);
        }

        if (options?.portalScope === 'independent') {
            query = query.is('client_gym_membership_id', null);
        }

        const { data: sessionRows, error: sessionsError } = await query;
        if (sessionsError) throw sessionsError;

        const sessions = sessionRows || [];
        if (sessions.length === 0) return [];

        const sessionIds = sessions.map((session: any) => session.id);
        const clientIds = [...new Set(sessions.map((session: any) => session.client_id).filter(Boolean))];
        const routineDayIds = [...new Set(sessions.map((session: any) => session.routine_day_id).filter(Boolean))];

        const [{ data: setRows, error: setsError }, { data: clientRows, error: clientsError }, { data: dayRows, error: daysError }] = await Promise.all([
            this.supabase
                .from('training_session_sets')
                .select('training_session_id, exercise_name, rir')
                .in('training_session_id', sessionIds)
                .not('rir', 'is', null),
            this.supabase
                .from('clients')
                .select('id, name')
                .in('id', clientIds),
            this.supabase
                .from('routine_days')
                .select('id, day_name, day_number')
                .in('id', routineDayIds)
        ]);

        if (setsError) throw setsError;
        if (clientsError) throw clientsError;
        if (daysError) throw daysError;

        const clientNameById = new Map<string, string>((clientRows || []).map((row: any) => [row.id, row.name]));
        const dayById = new Map<string, { dayName: string; dayNumber?: number }>(
            (dayRows || []).map((row: any) => [row.id, { dayName: row.day_name, dayNumber: row.day_number }])
        );
        const setsBySessionId = new Map<string, { rirEntriesCount: number; exerciseNames: string[] }>();

        for (const row of setRows || []) {
            const current = setsBySessionId.get(row.training_session_id) || { rirEntriesCount: 0, exerciseNames: [] };
            current.rirEntriesCount += 1;
            if (row.exercise_name && !current.exerciseNames.includes(row.exercise_name)) {
                current.exerciseNames.push(row.exercise_name);
            }
            setsBySessionId.set(row.training_session_id, current);
        }

        return sessions
            .map((session: any) => {
                const setSummary = setsBySessionId.get(session.id);
                if (!setSummary || setSummary.rirEntriesCount === 0) return null;

                const day = dayById.get(session.routine_day_id);
                return {
                    sessionId: session.id,
                    clientId: session.client_id,
                    clientName: clientNameById.get(session.client_id) || 'Cliente',
                    routineDayId: session.routine_day_id,
                    dayName: day?.dayName || `Día ${day?.dayNumber || ''}`.trim(),
                    sessionDate: session.session_date,
                    updatedAt: session.updated_at,
                    rirEntriesCount: setSummary.rirEntriesCount,
                    exerciseNames: setSummary.exerciseNames.slice(0, 3)
                } as RecentCoachRirActivity;
            })
            .filter((item): item is RecentCoachRirActivity => !!item);
    }
}
