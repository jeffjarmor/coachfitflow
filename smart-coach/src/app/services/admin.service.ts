import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Client } from '../models/client.model';
import { Coach, CoachPlan, getCoachAccountType, getCoachPlan } from '../models/coach.model';
import { Routine } from '../models/routine.model';
import { SupabaseService } from './supabase.service';

export interface ClientWithCoach {
    client: Client;
    clientId: string;
    coach: Coach;
    coachId: string;
    routinesCount: number;
}

export interface CoachGymAffiliation {
    coachId: string;
    gymId: string;
    role: string;
}

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private supabase = inject(SupabaseService).client;
    private authService = inject(AuthService);

    private mapCoach(row: any): Coach {
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            phone: row.phone,
            logoUrl: row.logo_url,
            brandColor: row.brand_color,
            role: row.role,
            gymId: row.gym_id ?? null,
            accountType: getCoachAccountType({ accountType: row.account_type }),
            coachPlan: getCoachPlan({ coachPlan: row.coach_plan }),
            nextPlanPaymentDate: row.next_plan_payment_date ?? null,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        } as Coach;
    }

    private mapClient(row: any, coachId: string): Client {
        return {
            id: row.id,
            coachId,
            name: row.name,
            email: row.email,
            phone: row.phone,
            birthDate: row.birth_date,
            notes: row.notes,
            age: row.age,
            weight: row.weight,
            height: row.height,
            goal: row.goal,
            address: row.address,
            uid: row.user_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        } as Client;
    }

    async getAllClients(): Promise<ClientWithCoach[]> {
        const [coachesRes, clientsRes, membershipsRes, routinesRes] = await Promise.all([
            this.supabase.from('coaches').select('*'),
            this.supabase.from('clients').select('*'),
            this.supabase.from('client_gym_memberships').select('client_id, assigned_coach_id'),
            this.supabase.from('routines').select('id, client_id, coach_id')
        ]);

        if (coachesRes.error) throw coachesRes.error;
        if (clientsRes.error) throw clientsRes.error;
        if (membershipsRes.error) throw membershipsRes.error;
        if (routinesRes.error) throw routinesRes.error;

        const coachesMap = new Map<string, Coach>();
        (coachesRes.data || []).forEach((c: any) => {
            coachesMap.set(c.id, this.mapCoach(c));
        });

        const coachByClient = new Map<string, string>();
        for (const m of membershipsRes.data || []) {
            if (m.assigned_coach_id && !coachByClient.has(m.client_id)) {
                coachByClient.set(m.client_id, m.assigned_coach_id);
            }
        }

        const routineCounts = new Map<string, number>();
        for (const r of routinesRes.data || []) {
            if (!r.client_id) continue;
            routineCounts.set(r.client_id, (routineCounts.get(r.client_id) || 0) + 1);
        }

        const out: ClientWithCoach[] = [];
        for (const row of clientsRes.data || []) {
            const coachId = coachByClient.get(row.id) || row.primary_coach_id;
            if (!coachId) continue;
            const coach = coachesMap.get(coachId);
            if (!coach) continue;

            out.push({
                client: this.mapClient(row, coachId),
                clientId: row.id,
                coach,
                coachId,
                routinesCount: routineCounts.get(row.id) || 0
            });
        }

        return out.sort((a, b) => a.client.name.localeCompare(b.client.name));
    }

    async getAllCoaches(): Promise<Array<{ id: string; coach: Coach }>> {
        const { data, error } = await this.supabase.from('coaches').select('*');
        if (error) throw error;
        return (data || []).map((row: any) => ({ id: row.id, coach: this.mapCoach(row) }));
    }

    async getCoachGymAffiliations(): Promise<CoachGymAffiliation[]> {
        const { data, error } = await this.supabase
            .from('gym_staff')
            .select('coach_id, gym_id, role');
        if (error) throw error;

        return (data || []).map((row: any) => ({
            coachId: row.coach_id,
            gymId: row.gym_id,
            role: row.role
        }));
    }

    async updateCoachPlan(
        coachId: string,
        coachPlan: CoachPlan,
        options?: { nextPlanPaymentDate?: string | null }
    ): Promise<void> {
        const payload: any = {
            coach_plan: coachPlan,
            updated_at: new Date().toISOString()
        };

        if (options && Object.prototype.hasOwnProperty.call(options, 'nextPlanPaymentDate')) {
            payload.next_plan_payment_date = options.nextPlanPaymentDate;
        } else if (coachPlan === 'paid') {
            const nextDate = new Date();
            nextDate.setMonth(nextDate.getMonth() + 1);
            payload.next_plan_payment_date = nextDate.toISOString().slice(0, 10);
        } else {
            payload.next_plan_payment_date = null;
        }

        const { error } = await this.supabase
            .from('coaches')
            .update(payload)
            .eq('id', coachId);

        if (error) throw error;
    }

    async updateCoachPlanPaymentDate(coachId: string, nextPlanPaymentDate: string | null): Promise<void> {
        const { error } = await this.supabase
            .from('coaches')
            .update({
                next_plan_payment_date: nextPlanPaymentDate,
                updated_at: new Date().toISOString()
            })
            .eq('id', coachId);

        if (error) throw error;
    }

    async getClientWithCoach(coachId: string, clientId: string): Promise<ClientWithCoach | null> {
        const [clientRes, coachRes, routinesRes, membershipRes] = await Promise.all([
            this.supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
            this.supabase.from('coaches').select('*').eq('id', coachId).maybeSingle(),
            this.supabase.from('routines').select('id').eq('coach_id', coachId).eq('client_id', clientId),
            this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('client_id', clientId)
                .eq('assigned_coach_id', coachId)
                .limit(1)
        ]);

        if (clientRes.error) throw clientRes.error;
        if (coachRes.error) throw coachRes.error;
        if (routinesRes.error) throw routinesRes.error;
        if (membershipRes.error) throw membershipRes.error;

        const client = clientRes.data;
        const coach = coachRes.data;
        if (!client || !coach) return null;

        const ownsClient = client.primary_coach_id === coachId || (membershipRes.data || []).length > 0;
        if (!ownsClient) return null;

        return {
            client: this.mapClient(client, coachId),
            clientId,
            coach: this.mapCoach(coach),
            coachId,
            routinesCount: (routinesRes.data || []).length
        };
    }

    async getClientRoutines(coachId: string, clientId: string): Promise<Array<{ id: string; routine: Routine }>> {
        const { data, error } = await this.supabase
            .from('routines')
            .select('*')
            .eq('coach_id', coachId)
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });
        if (error) throw error;

        return (data || []).map((r: any) => ({
            id: r.id,
            routine: {
                id: r.id,
                coachId: r.coach_id,
                clientId: r.client_id,
                name: r.name,
                objective: r.objective,
                trainingDaysCount: r.training_days_count,
                durationWeeks: r.duration_weeks,
                startDate: r.start_date,
                endDate: r.end_date,
                notes: r.notes,
                createdAt: r.created_at,
                updatedAt: r.updated_at
            } as Routine
        }));
    }

    async updateClientData(coachId: string, clientId: string, data: Partial<Client>): Promise<void> {
        const clientPayload: any = {};
        if (data.name !== undefined) clientPayload.name = data.name;
        if (data.email !== undefined) clientPayload.email = data.email;
        if (data.phone !== undefined) clientPayload.phone = data.phone;
        if (data.birthDate !== undefined) clientPayload.birth_date = data.birthDate;
        if (data.notes !== undefined) clientPayload.notes = data.notes;
        if (data.age !== undefined) clientPayload.age = data.age;
        if (data.weight !== undefined) clientPayload.weight = data.weight;
        if (data.height !== undefined) clientPayload.height = data.height;
        if (data.goal !== undefined) clientPayload.goal = data.goal;
        if (data.address !== undefined) clientPayload.address = data.address;

        if (Object.keys(clientPayload).length > 0) {
            clientPayload.updated_at = new Date().toISOString();
            const { error } = await this.supabase
                .from('clients')
                .update(clientPayload)
                .eq('id', clientId)
                .eq('primary_coach_id', coachId);
            if (error) throw error;
        }
    }

    async cloneClient(sourceCoachId: string, clientId: string, targetCoachId: string): Promise<void> {
        const sourceClient = await this.getClientWithCoach(sourceCoachId, clientId);
        if (!sourceClient) throw new Error('Client not found');

        const original = sourceClient.client;
        const nowIso = new Date().toISOString();

        const { data: insertedClient, error: clientErr } = await this.supabase
            .from('clients')
            .insert({
                primary_coach_id: targetCoachId,
                name: original.name,
                email: original.email,
                phone: original.phone || null,
                birth_date: original.birthDate || null,
                notes: original.notes || null,
                age: original.age || 0,
                weight: original.weight && original.weight > 0 ? original.weight : null,
                height: original.height && original.height > 0 ? original.height : null,
                goal: original.goal || '',
                address: original.address || null,
                created_at: nowIso,
                updated_at: nowIso
            })
            .select('id')
            .single();
        if (clientErr) throw clientErr;

        const newClientId = insertedClient.id;

        const { data: measurements, error: measErr } = await this.supabase
            .from('measurements')
            .select('*')
            .eq('client_id', clientId)
            .is('client_gym_membership_id', null);
        if (measErr) throw measErr;

        for (const m of measurements || []) {
            const payload = { ...m, id: undefined, client_id: newClientId, created_at: nowIso, updated_at: nowIso };
            delete payload.id;
            const { error } = await this.supabase.from('measurements').insert(payload);
            if (error) throw error;
        }

        const { data: routines, error: routineErr } = await this.supabase
            .from('routines')
            .select('*')
            .eq('coach_id', sourceCoachId)
            .eq('client_id', clientId)
            .is('client_gym_membership_id', null);
        if (routineErr) throw routineErr;

        for (const r of routines || []) {
            const { data: insertedRoutine, error: insRoutineErr } = await this.supabase
                .from('routines')
                .insert({
                    coach_id: targetCoachId,
                    client_id: newClientId,
                    name: r.name,
                    objective: r.objective,
                    training_days_count: r.training_days_count,
                    duration_weeks: r.duration_weeks,
                    start_date: r.start_date,
                    end_date: r.end_date,
                    notes: r.notes,
                    warmup_enabled: r.warmup_enabled,
                    warmup_custom_text: r.warmup_custom_text,
                    created_at: nowIso,
                    updated_at: nowIso
                })
                .select('id')
                .single();
            if (insRoutineErr) throw insRoutineErr;

            const { data: days, error: daysErr } = await this.supabase
                .from('routine_days')
                .select('*')
                .eq('routine_id', r.id)
                .order('day_number', { ascending: true });
            if (daysErr) throw daysErr;

            for (const day of days || []) {
                const { data: newDay, error: newDayErr } = await this.supabase
                    .from('routine_days')
                    .insert({
                        routine_id: insertedRoutine.id,
                        day_number: day.day_number,
                        day_name: day.day_name,
                        notes: day.notes,
                        muscle_groups: day.muscle_groups
                    })
                    .select('id')
                    .single();
                if (newDayErr) throw newDayErr;

                const { data: exercises, error: exErr } = await this.supabase
                    .from('routine_day_exercises')
                    .select('*')
                    .eq('routine_day_id', day.id)
                    .order('order_index', { ascending: true });
                if (exErr) throw exErr;

                for (const ex of exercises || []) {
                    const { data: newEx, error: newExErr } = await this.supabase
                        .from('routine_day_exercises')
                        .insert({
                            routine_day_id: newDay.id,
                            exercise_id: ex.exercise_id,
                            sets: ex.sets,
                            reps: ex.reps,
                            rest: ex.rest,
                            notes: ex.notes,
                            is_superset: ex.is_superset,
                            video_url: ex.video_url,
                            image_url: ex.image_url,
                            order_index: ex.order_index
                        })
                        .select('id')
                        .single();
                    if (newExErr) throw newExErr;

                    const { data: weekConfigs, error: wcErr } = await this.supabase
                        .from('routine_week_configs')
                        .select('*')
                        .eq('routine_day_exercise_id', ex.id)
                        .order('start_week', { ascending: true });
                    if (wcErr) throw wcErr;

                    for (const wc of weekConfigs || []) {
                        const { error } = await this.supabase.from('routine_week_configs').insert({
                            routine_day_exercise_id: newEx.id,
                            start_week: wc.start_week,
                            end_week: wc.end_week,
                            sets: wc.sets,
                            reps: wc.reps,
                            rest: wc.rest,
                            notes: wc.notes
                        });
                        if (error) throw error;
                    }
                }
            }
        }
    }

    async deleteClient(coachId: string, clientId: string): Promise<void> {
        const { data: client, error: clientErr } = await this.supabase
            .from('clients')
            .select('id, primary_coach_id')
            .eq('id', clientId)
            .maybeSingle();
        if (clientErr) throw clientErr;

        if (!client) return;

        if (client.primary_coach_id === coachId) {
            const { error } = await this.supabase.rpc('admin_delete_client_fully', {
                p_client_id: clientId
            });
            if (error) throw error;
            return;
        }

        // Shared/gym client not owned by this coach: just unlink assignment.
        const { error: unlinkErr } = await this.supabase
            .from('client_gym_memberships')
            .delete()
            .eq('client_id', clientId)
            .eq('assigned_coach_id', coachId);
        if (unlinkErr) throw unlinkErr;
    }

    async deleteGymFully(gymId: string): Promise<void> {
        const { data: memberships, error: memErr } = await this.supabase
            .from('client_gym_memberships')
            .select('id')
            .eq('gym_id', gymId);
        if (memErr) throw memErr;

        const membershipIds = (memberships || []).map((m: any) => m.id);

        if (membershipIds.length > 0) {
            const { error: routineErr } = await this.supabase
                .from('routines')
                .delete()
                .in('client_gym_membership_id', membershipIds);
            if (routineErr) throw routineErr;

            const { error: compErr } = await this.supabase
                .from('competitor_sheets')
                .delete()
                .in('client_gym_membership_id', membershipIds);
            if (compErr) throw compErr;

            const { error: measErr } = await this.supabase
                .from('measurements')
                .delete()
                .in('client_gym_membership_id', membershipIds);
            if (measErr) throw measErr;

            const { error: payErr } = await this.supabase
                .from('payments')
                .delete()
                .in('client_gym_membership_id', membershipIds);
            if (payErr) throw payErr;
        }

        const { error: staffErr } = await this.supabase.from('gym_staff').delete().eq('gym_id', gymId);
        if (staffErr) throw staffErr;

        const { error: exErr } = await this.supabase.from('exercises').delete().eq('gym_id', gymId);
        if (exErr) throw exErr;

        const { error: planErr } = await this.supabase.from('membership_plans').delete().eq('gym_id', gymId);
        if (planErr) throw planErr;

        const { error: memDelErr } = await this.supabase.from('client_gym_memberships').delete().eq('gym_id', gymId);
        if (memDelErr) throw memDelErr;

        const { error: gymErr } = await this.supabase.from('gyms').delete().eq('id', gymId);
        if (gymErr) throw gymErr;
    }

    async deleteCoachFully(coachId: string): Promise<void> {
        // Delete personal clients fully (including auth users) before deleting the coach.
        const { data: personalClients, error: personalClientsErr } = await this.supabase
            .from('clients')
            .select('id')
            .eq('primary_coach_id', coachId);
        if (personalClientsErr) throw personalClientsErr;

        for (const client of personalClients || []) {
            const { error } = await this.supabase.rpc('admin_delete_client_fully', {
                p_client_id: client.id
            });
            if (error) throw error;
        }

        const { data: ownedGyms, error: ownedErr } = await this.supabase
            .from('gyms')
            .select('id')
            .eq('owner_id', coachId);
        if (ownedErr) throw ownedErr;

        for (const gym of ownedGyms || []) {
            await this.deleteGymFully(gym.id);
        }

        const { error: staffErr } = await this.supabase.from('gym_staff').delete().eq('coach_id', coachId);
        if (staffErr) throw staffErr;

        const { error: routineErr } = await this.supabase.from('routines').delete().eq('coach_id', coachId);
        if (routineErr) throw routineErr;

        const { error: exErr } = await this.supabase.from('exercises').delete().eq('coach_id', coachId);
        if (exErr) throw exErr;

        const { error: compErr } = await this.supabase.from('competitor_sheets').delete().eq('coach_id', coachId);
        if (compErr) throw compErr;

        const { error: clientRefErr } = await this.supabase
            .from('clients')
            .update({ primary_coach_id: null })
            .eq('primary_coach_id', coachId);
        if (clientRefErr) throw clientRefErr;

        const { error: membershipErr } = await this.supabase
            .from('client_gym_memberships')
            .update({ assigned_coach_id: null })
            .eq('assigned_coach_id', coachId);
        if (membershipErr) throw membershipErr;

        const { error: coachErr } = await this.supabase.from('coaches').delete().eq('id', coachId);
        if (coachErr) throw coachErr;

        await this.deleteUserFromAuth(coachId);
    }

    private async deleteUserFromAuth(uid: string): Promise<void> {
        try {
            await this.authService.deleteUserFromAuthViaFunction(uid);
        } catch (error) {
            console.warn('No se pudo eliminar usuario en Auth automáticamente:', error);
        }
    }
}
