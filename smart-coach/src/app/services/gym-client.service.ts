import { Injectable, inject } from '@angular/core';
import { GymClientProfile } from '../models/gym-client.model';
import { Client } from '../models/client.model';
import { Routine, TrainingDay } from '../models/routine.model';
import { Measurement } from '../models/measurement.model';
import { Payment } from '../models/payment.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class GymClientService {
    private supabase = inject(SupabaseService).client;
    private profileCache = new Map<string, { data: GymClientProfile | null; expiresAt: number }>();
    private profileInFlight = new Map<string, Promise<GymClientProfile | null>>();
    private membershipCache = new Map<string, { membershipId: string | null; expiresAt: number }>();
    private readonly cacheTtlMs = 20_000;

    private async getIndependentPortalProfile(uid: string): Promise<GymClientProfile | null> {
        const { data, error } = await this.supabase
            .from('independent_client_portal_access')
            .select('user_id, created_at, client_id, coach_id')
            .eq('user_id', uid)
            .limit(1)
            .maybeSingle();

        if (error || !data) return null;

        let coachRel: { name?: string | null; coach_plan?: string | null } | null = null;
        if (data.coach_id) {
            const { data: coachData } = await this.supabase
                .from('coaches')
                .select('name, coach_plan')
                .eq('id', data.coach_id)
                .maybeSingle();
            coachRel = coachData || null;
        }

        return {
            uid: data.user_id,
            scope: 'independent',
            clientId: data.client_id,
            coachId: data.coach_id,
            coachName: coachRel?.name || '',
            displayName: coachRel?.name || 'Tu entrenador',
            rirEnabled: String(coachRel?.coach_plan || 'standard') === 'paid',
            createdAt: data.created_at
        };
    }

    private mapRoutineRow(row: any): Routine {
        return {
            id: row.id,
            coachId: row.coach_id,
            clientId: row.client_id,
            name: row.name,
            objective: row.objective,
            trainingDaysCount: row.training_days_count,
            durationWeeks: row.duration_weeks,
            startDate: row.start_date,
            endDate: row.end_date,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        } as Routine;
    }

    async getClientProfile(uid: string): Promise<GymClientProfile | null> {
        const now = Date.now();
        const cached = this.profileCache.get(uid);
        if (cached && cached.expiresAt > now) return cached.data;

        const inFlight = this.profileInFlight.get(uid);
        if (inFlight) return inFlight;

        const request = this.fetchClientProfile(uid);
        this.profileInFlight.set(uid, request);
        try {
            return await request;
        } finally {
            this.profileInFlight.delete(uid);
        }
    }

    private async fetchClientProfile(uid: string): Promise<GymClientProfile | null> {
        try {
            const { data, error } = await this.supabase
                .from('client_portal_access')
                .select('user_id, created_at, client_gym_memberships!inner(gym_id, client_id, gyms(name))')
                .eq('user_id', uid)
                .limit(1)
                .maybeSingle();

            if (!error && data) {
                const membership: any = Array.isArray(data.client_gym_memberships)
                    ? data.client_gym_memberships[0]
                    : data.client_gym_memberships;
                const gymRel: any = Array.isArray(membership?.gyms) ? membership.gyms[0] : membership?.gyms;

                const profile = {
                    uid: data.user_id,
                    scope: 'gym' as const,
                    gymId: membership?.gym_id,
                    clientId: membership?.client_id,
                    gymName: gymRel?.name || '',
                    displayName: gymRel?.name || 'Tu gimnasio',
                    rirEnabled: false,
                    createdAt: data.created_at
                };
                this.profileCache.set(uid, {
                    data: profile,
                    expiresAt: Date.now() + this.cacheTtlMs
                });
                return profile;
            }

            const independentProfile = await this.getIndependentPortalProfile(uid);
            this.profileCache.set(uid, {
                data: independentProfile,
                expiresAt: Date.now() + this.cacheTtlMs
            });
            return independentProfile;
        } catch {
            this.profileCache.set(uid, {
                data: null,
                expiresAt: Date.now() + this.cacheTtlMs
            });
            return null;
        }
    }

    private async getMembershipId(gymId: string, clientId: string): Promise<string | null> {
        const key = `${gymId}:${clientId}`;
        const now = Date.now();
        const cached = this.membershipCache.get(key);
        if (cached && cached.expiresAt > now) return cached.membershipId;

        const { data: membership } = await this.supabase
            .from('client_gym_memberships')
            .select('id')
            .eq('gym_id', gymId)
            .eq('client_id', clientId)
            .maybeSingle();

        const membershipId = membership?.id || null;
        this.membershipCache.set(key, {
            membershipId,
            expiresAt: Date.now() + this.cacheTtlMs
        });
        return membershipId;
    }

    async getMyClientData(gymId: string, clientId: string): Promise<Client | null> {
        try {
            const { data: membership, error: mErr } = await this.supabase
                .from('client_gym_memberships')
                .select('id, assigned_coach_id, membership_plan_id, next_payment_due_date, subscription_status, portal_status, portal_invited_at')
                .eq('gym_id', gymId)
                .eq('client_id', clientId)
                .single();
            if (mErr) return null;

            const { data: client, error: cErr } = await this.supabase
                .from('clients')
                .select('*')
                .eq('id', clientId)
                .single();
            if (cErr || !client) return null;

            return {
                id: client.id,
                coachId: membership.assigned_coach_id,
                name: client.name,
                email: client.email,
                phone: client.phone,
                birthDate: client.birth_date,
                notes: client.notes,
                age: client.age,
                weight: client.weight,
                height: client.height,
                goal: client.goal,
                nextPaymentDueDate: membership.next_payment_due_date,
                subscriptionStatus: membership.subscription_status,
                membershipPlanId: membership.membership_plan_id,
                address: client.address,
                uid: client.user_id,
                portalStatus: membership.portal_status,
                portalInvitedAt: membership.portal_invited_at,
                createdAt: client.created_at,
                updatedAt: client.updated_at
            } as Client;
        } catch (error) {
            console.error('GymClientService.getMyClientData:', error);
            return null;
        }
    }

    async getMyIndependentClientData(clientId: string): Promise<Client | null> {
        try {
            const { data: client, error } = await this.supabase
                .from('clients')
                .select('*')
                .eq('id', clientId)
                .single();
            if (error || !client) return null;

            return {
                id: client.id,
                coachId: client.primary_coach_id,
                name: client.name,
                email: client.email,
                phone: client.phone,
                birthDate: client.birth_date,
                notes: client.notes,
                age: client.age,
                weight: client.weight,
                height: client.height,
                goal: client.goal,
                address: client.address,
                uid: client.user_id,
                portalStatus: client.portal_status,
                portalInvitedAt: client.portal_invited_at,
                createdAt: client.created_at,
                updatedAt: client.updated_at
            } as Client;
        } catch (error) {
            console.error('GymClientService.getMyIndependentClientData:', error);
            return null;
        }
    }

    async updateMyClientData(gymId: string, clientId: string, data: Partial<Client>): Promise<void> {
        const clientPayload: any = {};
        const membershipPayload: any = { updated_at: new Date().toISOString() };

        if (data.name !== undefined) clientPayload.name = data.name;
        if (data.phone !== undefined) clientPayload.phone = data.phone;
        if (data.birthDate !== undefined) clientPayload.birth_date = data.birthDate;
        if (data.notes !== undefined) clientPayload.notes = data.notes;
        if (data.address !== undefined) clientPayload.address = data.address;
        if (data.weight !== undefined) clientPayload.weight = data.weight;
        if (data.height !== undefined) clientPayload.height = data.height;
        if (data.goal !== undefined) clientPayload.goal = data.goal;

        if (Object.keys(clientPayload).length > 0) {
            clientPayload.updated_at = new Date().toISOString();
            const { error } = await this.supabase.from('clients').update(clientPayload).eq('id', clientId);
            if (error) throw error;
        }

        if (data.nextPaymentDueDate !== undefined) membershipPayload.next_payment_due_date = data.nextPaymentDueDate;
        if (data.subscriptionStatus !== undefined) membershipPayload.subscription_status = data.subscriptionStatus;
        if (data.membershipPlanId !== undefined) membershipPayload.membership_plan_id = data.membershipPlanId;

        if (Object.keys(membershipPayload).length > 1) {
            const { error } = await this.supabase
                .from('client_gym_memberships')
                .update(membershipPayload)
                .eq('gym_id', gymId)
                .eq('client_id', clientId);
            if (error) throw error;
        }
    }

    async updateMyIndependentClientData(clientId: string, data: Partial<Client>): Promise<void> {
        const clientPayload: any = {};
        if (data.name !== undefined) clientPayload.name = data.name;
        if (data.phone !== undefined) clientPayload.phone = data.phone;
        if (data.birthDate !== undefined) clientPayload.birth_date = data.birthDate;
        if (data.notes !== undefined) clientPayload.notes = data.notes;
        if (data.address !== undefined) clientPayload.address = data.address;
        if (data.weight !== undefined) clientPayload.weight = data.weight;
        if (data.height !== undefined) clientPayload.height = data.height;
        if (data.goal !== undefined) clientPayload.goal = data.goal;

        if (Object.keys(clientPayload).length === 0) return;

        clientPayload.updated_at = new Date().toISOString();
        const { error } = await this.supabase.from('clients').update(clientPayload).eq('id', clientId);
        if (error) throw error;
    }

    async getMyRoutines(gymId: string, clientId: string): Promise<Array<{ id: string; routine: Routine }>> {
        try {
            const membershipId = await this.getMembershipId(gymId, clientId);

            const { data, error } = await this.supabase
                .from('routines')
                .select('*')
                .eq('client_id', clientId)
                .eq('client_gym_membership_id', membershipId)
                .order('created_at', { ascending: false });

            if (error) return [];
            return (data || []).map((r: any) => ({
                id: r.id,
                routine: this.mapRoutineRow(r)
            }));
        } catch (error) {
            console.error('GymClientService.getMyRoutines:', error);
            return [];
        }
    }

    async getMyIndependentRoutines(clientId: string): Promise<Array<{ id: string; routine: Routine }>> {
        try {
            const { data, error } = await this.supabase
                .from('routines')
                .select('*')
                .eq('client_id', clientId)
                .is('client_gym_membership_id', null)
                .order('created_at', { ascending: false });

            if (error) return [];
            return (data || []).map((r: any) => ({
                id: r.id,
                routine: this.mapRoutineRow(r)
            }));
        } catch (error) {
            console.error('GymClientService.getMyIndependentRoutines:', error);
            return [];
        }
    }

    async getMyMeasurements(gymId: string, clientId: string): Promise<Measurement[]> {
        try {
            const membershipId = await this.getMembershipId(gymId, clientId);

            const { data, error } = await this.supabase
                .from('measurements')
                .select('*')
                .eq('client_id', clientId)
                .eq('client_gym_membership_id', membershipId)
                .order('date', { ascending: false });

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                clientId: row.client_id,
                routineId: row.routine_id,
                date: row.date,
                weight: row.weight,
                height: row.height,
                bmi: row.bmi,
                bodyFatPercentage: row.body_fat_percentage,
                muscleMass: row.muscle_mass,
                visceralFat: row.visceral_fat,
                metabolicAge: row.metabolic_age,
                calories: row.calories,
                boneMass: row.bone_mass,
                waterPercentage: row.water_percentage,
                waist: row.waist,
                hips: row.hips,
                chest: row.chest,
                arms: row.arms,
                legs: row.legs,
                calf: row.calf,
                thigh: row.thigh,
                notes: row.notes,
                createdAt: row.created_at
            } as Measurement));
        } catch (error) {
            console.error('GymClientService.getMyMeasurements:', error);
            return [];
        }
    }

    async getMyIndependentMeasurements(clientId: string): Promise<Measurement[]> {
        try {
            const { data, error } = await this.supabase
                .from('measurements')
                .select('*')
                .eq('client_id', clientId)
                .is('client_gym_membership_id', null)
                .order('date', { ascending: false });

            if (error) return [];
            return (data || []).map((row: any) => ({
                id: row.id,
                clientId: row.client_id,
                routineId: row.routine_id,
                date: row.date,
                weight: row.weight,
                height: row.height,
                bmi: row.bmi,
                bodyFatPercentage: row.body_fat_percentage,
                muscleMass: row.muscle_mass,
                visceralFat: row.visceral_fat,
                metabolicAge: row.metabolic_age,
                calories: row.calories,
                boneMass: row.bone_mass,
                waterPercentage: row.water_percentage,
                waist: row.waist,
                hips: row.hips,
                chest: row.chest,
                arms: row.arms,
                legs: row.legs,
                calf: row.calf,
                thigh: row.thigh,
                notes: row.notes,
                createdAt: row.created_at
            } as Measurement));
        } catch (error) {
            console.error('GymClientService.getMyIndependentMeasurements:', error);
            return [];
        }
    }

    async getMyPayments(gymId: string, clientId: string): Promise<Payment[]> {
        try {
            const membershipId = await this.getMembershipId(gymId, clientId);
            if (!membershipId) return [];

            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('client_gym_membership_id', membershipId)
                .order('due_date', { ascending: false });

            if (error) return [];
            return (data || []).map((p: any) => ({
                id: p.id,
                clientId,
                amount: p.amount,
                currency: p.currency,
                method: p.method,
                dueDate: p.due_date,
                paidDate: p.paid_date,
                status: p.status,
                notes: p.notes,
                createdBy: p.created_by,
                createdAt: p.created_at,
                updatedAt: p.updated_at
            }));
        } catch (error) {
            console.error('GymClientService.getMyPayments:', error);
            return [];
        }
    }

    async getMyIndependentPayments(_clientId: string): Promise<Payment[]> {
        return [];
    }

    async getMyRoutineDetail(gymId: string, routineId: string): Promise<{ routine: Routine | null; days: TrainingDay[] }> {
        try {
            const { data: routineRow, error: rError } = await this.supabase
                .from('routines')
                .select('*')
                .eq('id', routineId)
                .single();

            if (rError || !routineRow) return { routine: null, days: [] };
            const routine = this.mapRoutineRow(routineRow);

            if (routineRow.client_gym_membership_id) {
                const { data: membership } = await this.supabase
                    .from('client_gym_memberships')
                    .select('gym_id')
                    .eq('id', routineRow.client_gym_membership_id)
                    .maybeSingle();
                if (membership?.gym_id !== gymId) return { routine: null, days: [] };
            }

            const { data: dayRows, error: dError } = await this.supabase
                .from('routine_days')
                .select('*')
                .eq('routine_id', routineId)
                .order('day_number', { ascending: true });

            if (dError || !dayRows || dayRows.length === 0) return { routine, days: [] };

            const dayIds = dayRows.map((d: any) => d.id);
            const { data: routineDayExercises } = await this.supabase
                .from('routine_day_exercises')
                .select('*')
                .in('routine_day_id', dayIds)
                .order('order_index', { ascending: true });

            const exerciseIds = Array.from(
                new Set((routineDayExercises || []).map((rde: any) => rde.exercise_id).filter(Boolean))
            );

            const exerciseMap = new Map<string, any>();
            if (exerciseIds.length > 0) {
                const { data: exerciseRows } = await this.supabase
                    .from('exercises')
                    .select('id,name,muscle_group,source,video_url,image_url')
                    .in('id', exerciseIds);

                for (const row of exerciseRows || []) {
                    exerciseMap.set(row.id, row);
                }
            }

            const routineDayExerciseIds = (routineDayExercises || []).map((rde: any) => rde.id);
            const weekConfigsMap = new Map<string, any[]>();
            if (routineDayExerciseIds.length > 0) {
                const { data: weekRows } = await this.supabase
                    .from('routine_week_configs')
                    .select('*')
                    .in('routine_day_exercise_id', routineDayExerciseIds)
                    .order('start_week', { ascending: true });

                for (const wc of weekRows || []) {
                    const key = wc.routine_day_exercise_id;
                    const arr = weekConfigsMap.get(key) || [];
                    arr.push(wc);
                    weekConfigsMap.set(key, arr);
                }
            }

            const byDay = new Map<string, any[]>();
            for (const rde of routineDayExercises || []) {
                const arr = byDay.get(rde.routine_day_id) || [];
                arr.push(rde);
                byDay.set(rde.routine_day_id, arr);
            }

            const mappedDays: TrainingDay[] = dayRows.map((day: any) => {
                const dayExercises = (byDay.get(day.id) || []).map((rde: any) => {
                    const exerciseRow = exerciseMap.get(rde.exercise_id);
                    const weekRows = weekConfigsMap.get(rde.id) || [];

                    return {
                        exerciseId: rde.exercise_id,
                        exerciseSource: exerciseRow?.source || 'coach',
                        exerciseName: exerciseRow?.name || '',
                        muscleGroup: exerciseRow?.muscle_group || '',
                        sets: rde.sets,
                        reps: rde.reps,
                        rest: rde.rest,
                        notes: rde.notes,
                        weekConfigs: weekRows.map((wc: any) => ({
                            startWeek: wc.start_week,
                            endWeek: wc.end_week,
                            sets: wc.sets,
                            reps: wc.reps,
                            rest: wc.rest,
                            notes: wc.notes
                        })),
                        isSuperset: rde.is_superset,
                        videoUrl: rde.video_url || exerciseRow?.video_url || '',
                        imageUrl: rde.image_url || exerciseRow?.image_url || '',
                        order: rde.order_index
                    };
                });

                return {
                    id: day.id,
                    routineId: day.routine_id,
                    dayNumber: day.day_number,
                    dayName: day.day_name,
                    muscleGroups: day.muscle_groups || [],
                    notes: day.notes,
                    exercises: dayExercises
                };
            });

            return { routine, days: mappedDays };
        } catch (error) {
            console.error('GymClientService.getMyRoutineDetail:', error);
            return { routine: null, days: [] };
        }
    }

    async getMyIndependentRoutineDetail(clientId: string, routineId: string): Promise<{ routine: Routine | null; days: TrainingDay[] }> {
        try {
            const { data: routineRow, error: rError } = await this.supabase
                .from('routines')
                .select('*')
                .eq('id', routineId)
                .is('client_gym_membership_id', null)
                .single();

            if (rError || !routineRow) return { routine: null, days: [] };
            if (routineRow.client_id !== clientId) return { routine: null, days: [] };

            return await this.getMyRoutineDetailRows(routineRow);
        } catch (error) {
            console.error('GymClientService.getMyIndependentRoutineDetail:', error);
            return { routine: null, days: [] };
        }
    }

    async getMyRoutineDetailForProfile(profile: GymClientProfile, routineId: string): Promise<{ routine: Routine | null; days: TrainingDay[] }> {
        if (profile.scope === 'gym' && profile.gymId) {
            return this.getMyRoutineDetail(profile.gymId, routineId);
        }
        return this.getMyIndependentRoutineDetail(profile.clientId, routineId);
    }

    async getMyClientDataForProfile(profile: GymClientProfile): Promise<Client | null> {
        if (profile.scope === 'gym' && profile.gymId) {
            return this.getMyClientData(profile.gymId, profile.clientId);
        }
        return this.getMyIndependentClientData(profile.clientId);
    }

    async getMyRoutinesForProfile(profile: GymClientProfile): Promise<Array<{ id: string; routine: Routine }>> {
        if (profile.scope === 'gym' && profile.gymId) {
            return this.getMyRoutines(profile.gymId, profile.clientId);
        }
        return this.getMyIndependentRoutines(profile.clientId);
    }

    async getMyMeasurementsForProfile(profile: GymClientProfile): Promise<Measurement[]> {
        if (profile.scope === 'gym' && profile.gymId) {
            return this.getMyMeasurements(profile.gymId, profile.clientId);
        }
        return this.getMyIndependentMeasurements(profile.clientId);
    }

    async getMyPaymentsForProfile(profile: GymClientProfile): Promise<Payment[]> {
        if (profile.scope === 'gym' && profile.gymId) {
            return this.getMyPayments(profile.gymId, profile.clientId);
        }
        return this.getMyIndependentPayments(profile.clientId);
    }

    async updateMyClientDataForProfile(profile: GymClientProfile, data: Partial<Client>): Promise<void> {
        if (profile.scope === 'gym' && profile.gymId) {
            return this.updateMyClientData(profile.gymId, profile.clientId, data);
        }
        return this.updateMyIndependentClientData(profile.clientId, data);
    }

    private async getMyRoutineDetailRows(routineRow: any): Promise<{ routine: Routine | null; days: TrainingDay[] }> {
        const routine = this.mapRoutineRow(routineRow);

        const { data: dayRows, error: dError } = await this.supabase
            .from('routine_days')
            .select('*')
            .eq('routine_id', routineRow.id)
            .order('day_number', { ascending: true });

        if (dError || !dayRows || dayRows.length === 0) return { routine, days: [] };

        const dayIds = dayRows.map((d: any) => d.id);
        const { data: routineDayExercises } = await this.supabase
            .from('routine_day_exercises')
            .select('*')
            .in('routine_day_id', dayIds)
            .order('order_index', { ascending: true });

        const exerciseIds = Array.from(
            new Set((routineDayExercises || []).map((rde: any) => rde.exercise_id).filter(Boolean))
        );

        const exerciseMap = new Map<string, any>();
        if (exerciseIds.length > 0) {
            const { data: exerciseRows } = await this.supabase
                .from('exercises')
                .select('id,name,muscle_group,source,video_url,image_url')
                .in('id', exerciseIds);

            for (const row of exerciseRows || []) {
                exerciseMap.set(row.id, row);
            }
        }

        const routineDayExerciseIds = (routineDayExercises || []).map((rde: any) => rde.id);
        const weekConfigsMap = new Map<string, any[]>();
        if (routineDayExerciseIds.length > 0) {
            const { data: weekRows } = await this.supabase
                .from('routine_week_configs')
                .select('*')
                .in('routine_day_exercise_id', routineDayExerciseIds)
                .order('start_week', { ascending: true });

            for (const wc of weekRows || []) {
                const key = wc.routine_day_exercise_id;
                const arr = weekConfigsMap.get(key) || [];
                arr.push(wc);
                weekConfigsMap.set(key, arr);
            }
        }

        const byDay = new Map<string, any[]>();
        for (const rde of routineDayExercises || []) {
            const arr = byDay.get(rde.routine_day_id) || [];
            arr.push(rde);
            byDay.set(rde.routine_day_id, arr);
        }

        const mappedDays: TrainingDay[] = dayRows.map((day: any) => {
            const dayExercises = (byDay.get(day.id) || []).map((rde: any) => {
                const exerciseRow = exerciseMap.get(rde.exercise_id);
                const weekRows = weekConfigsMap.get(rde.id) || [];

                return {
                    exerciseId: rde.exercise_id,
                    exerciseSource: exerciseRow?.source || 'coach',
                    exerciseName: exerciseRow?.name || '',
                    muscleGroup: exerciseRow?.muscle_group || '',
                    sets: rde.sets,
                    reps: rde.reps,
                    rest: rde.rest,
                    notes: rde.notes,
                    weekConfigs: weekRows.map((wc: any) => ({
                        startWeek: wc.start_week,
                        endWeek: wc.end_week,
                        sets: wc.sets,
                        reps: wc.reps,
                        rest: wc.rest,
                        notes: wc.notes
                    })),
                    isSuperset: rde.is_superset,
                    videoUrl: rde.video_url || exerciseRow?.video_url || '',
                    imageUrl: rde.image_url || exerciseRow?.image_url || '',
                    order: rde.order_index
                };
            });

            return {
                id: day.id,
                routineId: day.routine_id,
                dayNumber: day.day_number,
                dayName: day.day_name,
                muscleGroups: day.muscle_groups || [],
                notes: day.notes,
                exercises: dayExercises
            };
        });

        return { routine, days: mappedDays };
    }
}
