import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { isGroupedRoutineExerciseBlockType, isRoutineExerciseBlockType } from '../models/routine.model';

@Injectable({
    providedIn: 'root'
})
export class FirestoreService {
    private supabase = inject(SupabaseService).client;

    private async currentUserId(): Promise<string | null> {
        const { data } = await this.supabase.auth.getUser();
        return data.user?.id || null;
    }

    private toSnake(key: string): string {
        return key
            .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
            .replace(/\./g, '_')
            .toLowerCase();
    }

    private toCamelKey(key: string): string {
        return key.replace(/_([a-z])/g, (_, g1) => g1.toUpperCase());
    }

    private toDb(data: Record<string, any>): Record<string, any> {
        const out: Record<string, any> = {};
        Object.entries(data || {}).forEach(([k, v]) => {
            out[this.toSnake(k)] = v;
        });
        return out;
    }

    private pickRoutineColumns(dbData: Record<string, any>): Record<string, any> {
        const allowed = [
            'client_id',
            'name',
            'objective',
            'training_days_count',
            'duration_weeks',
            'start_date',
            'end_date',
            'notes'
        ];
        const out: Record<string, any> = {};
        for (const key of allowed) {
            if (Object.prototype.hasOwnProperty.call(dbData, key)) {
                out[key] = dbData[key];
            }
        }
        return out;
    }

    private fromDb<T>(row: any): T {
        if (!row || typeof row !== 'object') return row as T;
        const out: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
            out[this.toCamelKey(k)] = v;
        });
        return out as T;
    }

    private normalizeExerciseRecord<T>(table: string, row: any, converted: T): T {
        if (table !== 'exercises' || !converted || typeof converted !== 'object') {
            return converted;
        }

        const normalized = converted as Record<string, any>;
        normalized['isGlobal'] = row?.source === 'global';
        normalized['coachId'] = row?.coach_id || null;
        return normalized as T;
    }

    private mapExerciseBlockFromDb(rde: any): Record<string, any> {
        const blockType = isRoutineExerciseBlockType(rde.block_type) ? rde.block_type : 'single';
        return {
            isSuperset: isGroupedRoutineExerciseBlockType(blockType) || !!rde.is_superset,
            blockType,
            blockId: rde.block_id || null,
            blockLabel: rde.block_label || null,
            blockPosition: rde.block_position || null,
            blockRest: rde.block_rest || null
        };
    }

    private mapExerciseBlockToDb(ex: any): Record<string, any> {
        const blockType = ex.block_type || ex.blockType;
        const blockId = ex.block_id || ex.blockId || null;
        const isGroupedBlock = isGroupedRoutineExerciseBlockType(blockType) && !!blockId;

        if (!isGroupedBlock) {
            return {
                is_superset: false,
                block_type: 'single',
                block_id: null,
                block_label: null,
                block_position: null,
                block_rest: null
            };
        }

        return {
            is_superset: true,
            block_type: blockType,
            block_id: blockId,
            block_label: ex.block_label || ex.blockLabel || null,
            block_position: Number(ex.block_position ?? ex.blockPosition ?? 1),
            block_rest: ex.block_rest || ex.blockRest || null
        };
    }

    private split(path: string): string[] {
        return path.split('/').filter(Boolean);
    }

    private async resolveRead(path: string, docId?: string): Promise<{ table: string; filters: any; mode: string }> {
        const p = this.split(path);

        if (p.length === 1) {
            if (p[0] === 'coaches') return { table: 'coaches', filters: docId ? { id: docId } : {}, mode: 'table' };
            if (p[0] === 'gyms') return { table: 'gyms', filters: docId ? { id: docId } : {}, mode: 'table' };
            if (p[0] === 'exercises_global') return { table: 'exercises', filters: { source: 'global', ...(docId ? { id: docId } : {}) }, mode: 'table' };
            if (p[0] === 'activity_logins') return { table: 'activity_logins', filters: docId ? { id: docId } : {}, mode: 'table' };
        }

        if (p[0] === 'coaches' && p[2] === 'clients' && p.length === 3) {
            const coachId = p[1];
            return { table: 'clients', filters: { primary_coach_id: coachId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'coaches' && p[2] === 'routines' && p.length === 3) {
            const coachId = p[1];
            return { table: 'routines', filters: { coach_id: coachId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'coaches' && p[2] === 'exercises') {
            const coachId = p[1];
            return { table: 'exercises', filters: { source: 'coach', coach_id: coachId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'coaches' && p[2] === 'competitor_sheets') {
            const coachId = p[1];
            return { table: 'competitor_sheets', filters: { coach_id: coachId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'coaches' && p[2] === 'clients' && p[4] === 'measurements') {
            const clientId = p[3];
            return { table: 'measurements', filters: { client_id: clientId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'gyms' && p[2] === 'clients' && p.length === 3) {
            const gymId = p[1];
            return { table: 'client_gym_memberships', filters: { gym_id: gymId, ...(docId ? { id: docId } : {}) }, mode: 'gym_clients' };
        }

        if (p[0] === 'gyms' && p[2] === 'routines' && p.length === 3) {
            const gymId = p[1];
            return { table: 'routines', filters: { gym_id: gymId, ...(docId ? { id: docId } : {}) }, mode: 'gym_routines' };
        }

        if (p[0] === 'gyms' && p[2] === 'exercises') {
            const gymId = p[1];
            return { table: 'exercises', filters: { source: 'coach', gym_id: gymId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'gyms' && p[2] === 'payments') {
            const gymId = p[1];
            return { table: 'payments', filters: { gym_id: gymId, ...(docId ? { id: docId } : {}) }, mode: 'gym_payments' };
        }

        if (p[0] === 'gyms' && p[2] === 'membershipPlans') {
            const gymId = p[1];
            return { table: 'membership_plans', filters: { gym_id: gymId, ...(docId ? { id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'gyms' && p[2] === 'coaches') {
            const gymId = p[1];
            return { table: 'gym_staff', filters: { gym_id: gymId, ...(docId ? { coach_id: docId } : {}) }, mode: 'table' };
        }

        if (p[0] === 'gyms' && p[2] === 'competitor_sheets') {
            const gymId = p[1];
            return { table: 'competitor_sheets', filters: { gym_id: gymId, ...(docId ? { id: docId } : {}) }, mode: 'gym_competitor_sheets' };
        }

        if (p[0] === 'gyms' && p[2] === 'clients' && p[4] === 'measurements') {
            const gymId = p[1];
            const clientId = p[3];
            return { table: 'measurements', filters: { gym_id: gymId, client_id: clientId, ...(docId ? { id: docId } : {}) }, mode: 'gym_measurements' };
        }

        if (p[0] === 'coaches' && p[2] === 'routines' && p[4] === 'days') {
            const routineId = p[3];
            return { table: 'routine_days', filters: { routine_id: routineId, ...(docId ? { id: docId } : {}) }, mode: 'routine_days_with_exercises' };
        }

        if (p[0] === 'gyms' && p[2] === 'routines' && p[4] === 'days') {
            const routineId = p[3];
            return { table: 'routine_days', filters: { routine_id: routineId, ...(docId ? { id: docId } : {}) }, mode: 'routine_days_with_exercises' };
        }

        throw new Error(`Unsupported path in Supabase adapter: ${path}`);
    }

    async getDocument<T>(collectionPath: string, docId: string): Promise<T | null> {
        const res: any = await this.resolveRead(collectionPath, docId);

        if (res.mode === 'table') {
            let query: any = this.supabase.from(res.table).select('*').limit(1);
            Object.entries(res.filters).forEach(([k, v]) => {
                query = query.eq(k, v);
            });
            const { data, error } = await query.maybeSingle();
            if (error) throw error;
            if (!data) return null;

            const converted: any = this.normalizeExerciseRecord(res.table, data, this.fromDb<T>(data));
            if (res.table === 'clients') {
                converted.coachId = data.primary_coach_id || null;
            }
            return converted as T;
        }

        if (res.mode === 'gym_clients') {
            const gymId = res.filters.gym_id;
            let query: any = this.supabase
                .from('client_gym_memberships')
                .select('id, client_id, gym_id, assigned_coach_id, membership_plan_id, next_payment_due_date, subscription_status, portal_status, portal_invited_at, clients(*), membership_plans(name,price,currency)')
                .eq('gym_id', gymId)
                .eq('client_id', docId)
                .limit(1)
                .maybeSingle();

            const { data, error } = await query;
            if (error) throw error;
            if (!data) return null;

            const plan: any = Array.isArray(data.membership_plans)
                ? data.membership_plans[0]
                : data.membership_plans;

            const flat = {
                ...data.clients,
                id: data.client_id || data.clients?.id,
                gymId: data.gym_id,
                coachId: data.assigned_coach_id,
                membershipPlanId: data.membership_plan_id,
                membershipPlanName: plan?.name || '',
                membershipPrice: plan?.price ?? 0,
                membershipCurrency: plan?.currency || 'CRC',
                nextPaymentDueDate: data.next_payment_due_date,
                subscriptionStatus: data.subscription_status,
                portalStatus: data.portal_status,
                portalInvitedAt: data.portal_invited_at
            };
            return this.fromDb<T>(flat);
        }

        if (res.mode === 'gym_routines') {
            const gymId = res.filters.gym_id;
            const { data, error } = await this.supabase
                .from('routines')
                .select('*, client_gym_memberships!inner(gym_id)')
                .eq('client_gym_memberships.gym_id', gymId)
                .eq('id', docId)
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data ? this.fromDb<T>(data) : null;
        }

        // Fallback for complex read modes where a direct maybeSingle is not trivial.
        const list = await this.getDocuments<T>(collectionPath);
        return (list.find((d: any) => d.id === docId) as T) || null;
    }

    async getCollection<T>(collectionPath: string): Promise<T[]> {
        return this.getDocuments<T>(collectionPath);
    }

    async getDocuments<T>(collectionPath: string, ..._queryConstraints: any[]): Promise<T[]> {
        const res: any = await this.resolveRead(collectionPath);

        if (res.mode === 'table') {
            let query: any = this.supabase.from(res.table).select('*');
            Object.entries(res.filters).forEach(([k, v]) => {
                query = query.eq(k, v);
            });
            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map((r: any) => {
                const converted: any = this.normalizeExerciseRecord(res.table, r, this.fromDb<T>(r));
                if (res.table === 'clients') {
                    converted.coachId = r.primary_coach_id || null;
                }
                return converted;
            });
        }

        if (res.mode === 'gym_clients') {
            const gymId = res.filters.gym_id;
            const { data, error } = await this.supabase
                .from('client_gym_memberships')
                .select('id, client_id, gym_id, assigned_coach_id, membership_plan_id, next_payment_due_date, subscription_status, portal_status, portal_invited_at, clients(*), membership_plans(name,price,currency)')
                .eq('gym_id', gymId);
            if (error) throw error;
            const rows = (data || []).map((m: any) => {
                const plan = Array.isArray(m.membership_plans) ? m.membership_plans[0] : m.membership_plans;
                return {
                    ...m.clients,
                    id: m.client_id || m.clients?.id,
                    gymId: m.gym_id,
                    coachId: m.assigned_coach_id,
                    membershipPlanId: m.membership_plan_id,
                    membershipPlanName: plan?.name || '',
                    membershipPrice: plan?.price ?? 0,
                    membershipCurrency: plan?.currency || 'CRC',
                    nextPaymentDueDate: m.next_payment_due_date,
                    subscriptionStatus: m.subscription_status,
                    portalStatus: m.portal_status,
                    portalInvitedAt: m.portal_invited_at
                };
            });
            return rows.map((r: any) => this.fromDb<T>(r));
        }

        if (res.mode === 'gym_routines') {
            const gymId = res.filters.gym_id;
            const { data, error } = await this.supabase
                .from('routines')
                .select('*, client_gym_memberships!inner(gym_id)')
                .eq('client_gym_memberships.gym_id', gymId);
            if (error) throw error;
            return (data || []).map((r: any) => this.fromDb<T>(r));
        }

        if (res.mode === 'gym_payments') {
            const gymId = res.filters.gym_id;
            const { data, error } = await this.supabase
                .from('payments')
                .select('*, client_gym_memberships!inner(gym_id, client_id, membership_plan_id)')
                .eq('client_gym_memberships.gym_id', gymId);
            if (error) throw error;
            return (data || []).map((r: any) => {
                const flat = {
                    ...r,
                    clientId: r.client_gym_memberships?.client_id,
                    membershipPlanId: r.client_gym_memberships?.membership_plan_id
                };
                return this.fromDb<T>(flat);
            });
        }

        if (res.mode === 'gym_measurements') {
            const gymId = res.filters.gym_id;
            const clientId = res.filters.client_id;
            const { data, error } = await this.supabase
                .from('measurements')
                .select('*, client_gym_memberships!inner(gym_id)')
                .eq('client_id', clientId)
                .eq('client_gym_memberships.gym_id', gymId);
            if (error) throw error;
            return (data || []).map((r: any) => this.fromDb<T>(r));
        }

        if (res.mode === 'gym_competitor_sheets') {
            const gymId = res.filters.gym_id;
            let q: any = this.supabase
                .from('competitor_sheets')
                .select('*, client_gym_memberships!inner(gym_id)')
                .eq('client_gym_memberships.gym_id', gymId);

            if (res.filters.id) q = q.eq('id', res.filters.id);

            const { data, error } = await q;
            if (error) throw error;
            return (data || []).map((r: any) => this.fromDb<T>(r));
        }

        if (res.mode === 'routine_days_with_exercises') {
            let q: any = this.supabase
                .from('routine_days')
                .select('*')
                .eq('routine_id', res.filters.routine_id)
                .order('day_number', { ascending: true });
            if (res.filters.id) q = q.eq('id', res.filters.id);
            const { data: days, error: dErr } = await q;
            if (dErr) throw dErr;

            const dayIds = (days || []).map((d: any) => d.id);
            if (dayIds.length === 0) return [];

            const { data: rdes, error: rdeErr } = await this.supabase
                .from('routine_day_exercises')
                .select('*')
                .in('routine_day_id', dayIds)
                .order('order_index', { ascending: true });
            if (rdeErr) throw rdeErr;

            const exerciseIds = Array.from(
                new Set((rdes || []).map((rde: any) => rde.exercise_id).filter(Boolean))
            );
            const exerciseMap = new Map<string, any>();
            if (exerciseIds.length > 0) {
                const { data: exerciseRows, error: exErr } = await this.supabase
                    .from('exercises')
                    .select('id,name,muscle_group,source,video_url,image_url')
                    .in('id', exerciseIds);
                if (exErr) throw exErr;
                for (const row of exerciseRows || []) {
                    exerciseMap.set(row.id, row);
                }
            }

            const routineDayExerciseIds = (rdes || []).map((rde: any) => rde.id);
            const weekConfigsByRdeId = new Map<string, any[]>();
            if (routineDayExerciseIds.length > 0) {
                const { data: weekRows, error: weekErr } = await this.supabase
                    .from('routine_week_configs')
                    .select('*')
                    .in('routine_day_exercise_id', routineDayExerciseIds)
                    .order('start_week', { ascending: true });
                if (weekErr) throw weekErr;

                for (const wc of weekRows || []) {
                    const key = wc.routine_day_exercise_id;
                    const list = weekConfigsByRdeId.get(key) || [];
                    list.push(wc);
                    weekConfigsByRdeId.set(key, list);
                }
            }

            const rdesByDayId = new Map<string, any[]>();
            for (const rde of rdes || []) {
                const key = rde.routine_day_id;
                const list = rdesByDayId.get(key) || [];
                list.push(rde);
                rdesByDayId.set(key, list);
            }

            const out: any[] = [];
            for (const day of days || []) {
                const dayRdes = rdesByDayId.get(day.id) || [];
                const exercises = dayRdes.map((rde: any) => {
                    const wcs = weekConfigsByRdeId.get(rde.id) || [];
                    const exerciseRow = exerciseMap.get(rde.exercise_id);
                    return {
                        exerciseId: rde.exercise_id,
                        exerciseSource: exerciseRow?.source || 'coach',
                        exerciseName: exerciseRow?.name || '',
                        muscleGroup: exerciseRow?.muscle_group || '',
                        sets: rde.sets,
                        reps: rde.reps,
                        rest: rde.rest,
                        notes: rde.notes,
                        weekConfigs: wcs.map((wc: any) => ({
                            startWeek: wc.start_week,
                            endWeek: wc.end_week,
                            sets: wc.sets,
                            reps: wc.reps,
                            rest: wc.rest,
                            notes: wc.notes
                        })),
                        ...this.mapExerciseBlockFromDb(rde),
                        videoUrl: rde.video_url || exerciseRow?.video_url || '',
                        imageUrl: rde.image_url || exerciseRow?.image_url || '',
                        order: rde.order_index
                    };
                });

                out.push({
                    id: day.id,
                    routineId: day.routine_id,
                    dayNumber: day.day_number,
                    dayName: day.day_name,
                    muscleGroups: day.muscle_groups || [],
                    notes: day.notes,
                    exercises
                });
            }
            return out as T[];
        }

        return [];
    }

    async addDocument<T>(collectionPath: string, data: Partial<T>): Promise<string> {
        const p = this.split(collectionPath);
        const dbData: any = this.toDb(data as any);

        if (collectionPath === 'coaches') {
            const id = (dbData.id as string) || (await this.currentUserId()) || crypto.randomUUID();
            const payload = { ...dbData, id };
            const { error } = await this.supabase.from('coaches').upsert(payload).select('id').single();
            if (error) throw error;
            return id;
        }

        if (collectionPath === 'gyms') {
            const { data: row, error } = await this.supabase.from('gyms').insert(dbData).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (collectionPath === 'exercises_global') {
            const payload = { ...dbData, source: 'global', coach_id: null };
            const { data: row, error } = await this.supabase.from('exercises').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (collectionPath === 'activity_logins') {
            const { data: row, error } = await this.supabase.from('activity_logins').insert(dbData).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'coaches' && p[2] === 'clients' && p.length === 3) {
            const coachId = p[1];
            const clientId = crypto.randomUUID();
            const weight = typeof dbData.weight === 'number' && dbData.weight > 0 ? dbData.weight : null;
            const height = typeof dbData.height === 'number' && dbData.height > 0 ? dbData.height : null;
            const payload: any = {
                id: clientId,
                name: dbData.name,
                email: dbData.email,
                phone: dbData.phone,
                birth_date: dbData.birth_date,
                age: dbData.age ?? 0,
                weight,
                height,
                goal: dbData.goal ?? '',
                notes: dbData.notes,
                address: dbData.address,
                user_id: dbData.user_id || null,
                primary_coach_id: coachId
            };
            const { error } = await this.supabase.from('clients').insert(payload);
            if (error) throw error;
            return clientId;
        }

        if (p[0] === 'gyms' && p[2] === 'clients' && p.length === 3) {
            const gymId = p[1];
            const assignedCoachId = await this.currentUserId();
            const clientId = crypto.randomUUID();
            const weight = typeof dbData.weight === 'number' && dbData.weight > 0 ? dbData.weight : null;
            const height = typeof dbData.height === 'number' && dbData.height > 0 ? dbData.height : null;
            const clientPayload: any = {
                id: clientId,
                name: dbData.name,
                email: dbData.email,
                phone: dbData.phone,
                birth_date: dbData.birth_date,
                age: dbData.age ?? 0,
                weight,
                height,
                goal: dbData.goal ?? '',
                notes: dbData.notes,
                address: dbData.address,
                primary_coach_id: assignedCoachId
            };
            const { error: clientErr } = await this.supabase.from('clients').insert(clientPayload);
            if (clientErr) throw clientErr;

            const membershipPayload: any = {
                client_id: clientId,
                gym_id: gymId,
                assigned_coach_id: assignedCoachId,
                membership_plan_id: dbData.membership_plan_id || null,
                next_payment_due_date: dbData.next_payment_due_date || null,
                subscription_status: dbData.subscription_status || 'pending',
                portal_status: dbData.portal_status || 'pending',
                portal_invited_at: dbData.portal_invited_at || null
            };
            const { error: memberErr } = await this.supabase.from('client_gym_memberships').insert(membershipPayload);
            if (memberErr) throw memberErr;
            return clientId;
        }

        if (p[0] === 'coaches' && p[2] === 'routines' && p.length === 3) {
            const coachId = p[1];
            const warmup = dbData.warmup || null;
            const rawClientId = dbData.client_id ?? (data as any)?.clientId ?? (data as any)?.client_id ?? null;
            const payload = {
                ...this.pickRoutineColumns(dbData),
                client_id: rawClientId,
                coach_id: coachId,
                warmup_enabled: !!(warmup?.enabled),
                warmup_custom_text: warmup?.custom_text || warmup?.customText || null
            };
            delete (payload as any).warmup;
            if (!payload.client_id) {
                throw new Error(`Rutina sin client_id (path: ${collectionPath})`);
            }
            const { data: row, error } = await this.supabase.from('routines').insert(payload).select('id').single();
            if (error) throw error;

            // Persist optional warmup exercises
            const cardio = warmup?.cardio_exercises || warmup?.cardioExercises || [];
            for (let i = 0; i < cardio.length; i++) {
                const ex = cardio[i];
                if (!ex?.exercise_id && !ex?.exerciseId) continue;
                await this.supabase.from('routine_warmup_exercises').insert({
                    routine_id: row.id,
                    exercise_id: ex.exercise_id || ex.exerciseId,
                    order_index: i
                });
            }
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'routines' && p.length === 3) {
            const coachId = await this.currentUserId();
            const gymId = p[1];
            const warmup = dbData.warmup || null;
            const rawClientId = dbData.client_id ?? (data as any)?.clientId ?? (data as any)?.client_id ?? null;
            let membershipId: string | null = null;
            if (rawClientId) {
                const { data: membership } = await this.supabase
                    .from('client_gym_memberships')
                    .select('id')
                    .eq('gym_id', gymId)
                    .eq('client_id', rawClientId)
                    .maybeSingle();
                membershipId = membership?.id || null;
            }
            const payload = {
                ...this.pickRoutineColumns(dbData),
                client_id: rawClientId,
                coach_id: coachId,
                client_gym_membership_id: membershipId,
                warmup_enabled: !!(warmup?.enabled),
                warmup_custom_text: warmup?.custom_text || warmup?.customText || null
            };
            delete (payload as any).warmup;
            if (!payload.client_id) {
                throw new Error(`Rutina de gimnasio sin client_id (path: ${collectionPath})`);
            }
            const { data: row, error } = await this.supabase.from('routines').insert(payload).select('id').single();
            if (error) throw error;

            const cardio = warmup?.cardio_exercises || warmup?.cardioExercises || [];
            for (let i = 0; i < cardio.length; i++) {
                const ex = cardio[i];
                if (!ex?.exercise_id && !ex?.exerciseId) continue;
                await this.supabase.from('routine_warmup_exercises').insert({
                    routine_id: row.id,
                    exercise_id: ex.exercise_id || ex.exerciseId,
                    order_index: i
                });
            }
            return row.id;
        }

        if (p[0] === 'coaches' && p[2] === 'exercises') {
            const coachId = p[1];
            const payload = { ...dbData, source: 'coach', coach_id: coachId };
            const { data: row, error } = await this.supabase.from('exercises').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'exercises') {
            const coachId = await this.currentUserId();
            const payload = { ...dbData, source: 'coach', coach_id: coachId, gym_id: p[1] };
            const { data: row, error } = await this.supabase.from('exercises').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'membershipPlans') {
            const payload = { ...dbData, gym_id: p[1] };
            const { data: row, error } = await this.supabase.from('membership_plans').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'payments') {
            const gymId = p[1];
            let membershipId = dbData.client_gym_membership_id as string | undefined;
            if (!membershipId && dbData.client_id) {
                const { data: m } = await this.supabase
                    .from('client_gym_memberships')
                    .select('id')
                    .eq('gym_id', gymId)
                    .eq('client_id', dbData.client_id)
                    .maybeSingle();
                membershipId = m?.id;
            }
            const payload = {
                ...dbData,
                client_gym_membership_id: membershipId,
                created_by: dbData.created_by || (await this.currentUserId())
            };
            const { data: row, error } = await this.supabase.from('payments').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'coaches' && p[2] === 'clients' && p[4] === 'measurements') {
            const clientId = p[3];
            const payload = { ...dbData, client_id: clientId };
            const { data: row, error } = await this.supabase.from('measurements').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'clients' && p[4] === 'measurements') {
            const gymId = p[1];
            const clientId = p[3];
            const { data: membership } = await this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('gym_id', gymId)
                .eq('client_id', clientId)
                .maybeSingle();
            const payload = { ...dbData, client_id: clientId, client_gym_membership_id: membership?.id || null };
            const { data: row, error } = await this.supabase.from('measurements').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'coaches' && p[2] === 'competitor_sheets') {
            const payload = { ...dbData, coach_id: p[1] };
            const { data: row, error } = await this.supabase.from('competitor_sheets').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'competitor_sheets') {
            const coachId = await this.currentUserId();
            const gymId = p[1];
            let membershipId: string | null = null;
            if (dbData.client_id) {
                const { data: membership } = await this.supabase
                    .from('client_gym_memberships')
                    .select('id')
                    .eq('gym_id', gymId)
                    .eq('client_id', dbData.client_id)
                    .maybeSingle();
                membershipId = membership?.id || null;
            }
            const payload = { ...dbData, coach_id: coachId, client_gym_membership_id: membershipId };
            const { data: row, error } = await this.supabase.from('competitor_sheets').insert(payload).select('id').single();
            if (error) throw error;
            return row.id;
        }

        if (p[0] === 'coaches' && p[2] === 'routines' && p[4] === 'days') {
            const exercises = Array.isArray(dbData.exercises) ? dbData.exercises : [];
            const payload = { ...dbData, routine_id: p[3] };
            delete (payload as any).exercises;
            const { data: row, error } = await this.supabase.from('routine_days').insert(payload).select('id').single();
            if (error) throw error;

            for (let i = 0; i < exercises.length; i++) {
                const ex = exercises[i];
                const blockPayload = this.mapExerciseBlockToDb(ex);
                const { data: rde, error: rdeErr } = await this.supabase
                    .from('routine_day_exercises')
                    .insert({
                        routine_day_id: row.id,
                        exercise_id: ex.exercise_id || ex.exerciseId,
                        sets: ex.sets || 3,
                        reps: ex.reps || '',
                        rest: ex.rest || '',
                        notes: ex.notes || null,
                        ...blockPayload,
                        video_url: ex.video_url || ex.videoUrl || null,
                        image_url: ex.image_url || ex.imageUrl || null,
                        order_index: ex.order ?? i
                    })
                    .select('id')
                    .single();
                if (rdeErr) throw rdeErr;

                for (const wc of ex.week_configs || ex.weekConfigs || []) {
                    await this.supabase.from('routine_week_configs').insert({
                        routine_day_exercise_id: rde.id,
                        start_week: wc.start_week || wc.startWeek,
                        end_week: wc.end_week || wc.endWeek,
                        sets: wc.sets,
                        reps: wc.reps,
                        rest: wc.rest,
                        notes: wc.notes || null
                    });
                }
            }
            return row.id;
        }

        if (p[0] === 'gyms' && p[2] === 'routines' && p[4] === 'days') {
            const exercises = Array.isArray(dbData.exercises) ? dbData.exercises : [];
            const payload = { ...dbData, routine_id: p[3] };
            delete (payload as any).exercises;
            const { data: row, error } = await this.supabase.from('routine_days').insert(payload).select('id').single();
            if (error) throw error;

            for (let i = 0; i < exercises.length; i++) {
                const ex = exercises[i];
                const blockPayload = this.mapExerciseBlockToDb(ex);
                const { data: rde, error: rdeErr } = await this.supabase
                    .from('routine_day_exercises')
                    .insert({
                        routine_day_id: row.id,
                        exercise_id: ex.exercise_id || ex.exerciseId,
                        sets: ex.sets || 3,
                        reps: ex.reps || '',
                        rest: ex.rest || '',
                        notes: ex.notes || null,
                        ...blockPayload,
                        video_url: ex.video_url || ex.videoUrl || null,
                        image_url: ex.image_url || ex.imageUrl || null,
                        order_index: ex.order ?? i
                    })
                    .select('id')
                    .single();
                if (rdeErr) throw rdeErr;

                for (const wc of ex.week_configs || ex.weekConfigs || []) {
                    await this.supabase.from('routine_week_configs').insert({
                        routine_day_exercise_id: rde.id,
                        start_week: wc.start_week || wc.startWeek,
                        end_week: wc.end_week || wc.endWeek,
                        sets: wc.sets,
                        reps: wc.reps,
                        rest: wc.rest,
                        notes: wc.notes || null
                    });
                }
            }
            return row.id;
        }

        throw new Error(`Unsupported add path in Supabase adapter: ${collectionPath}`);
    }

    async setDocument<T>(collectionPath: string, docId: string, data: Partial<T>): Promise<void> {
        await this.updateDocument(collectionPath, docId, data);
    }

    async updateDocument<T>(collectionPath: string, docId: string, data: Partial<T>): Promise<void> {
        const p = this.split(collectionPath);
        const dbData: any = this.toDb(data as any);

        const apply = async (table: string, idColumn = 'id') => {
            const { error } = await this.supabase.from(table).update(dbData).eq(idColumn, docId);
            if (error) throw error;
        };

        if (collectionPath === 'coaches') return apply('coaches');
        if (collectionPath === 'gyms') return apply('gyms');
        if (collectionPath === 'exercises_global') return apply('exercises');
        if (collectionPath === 'activity_logins') return apply('activity_logins');
        if (p[0] === 'coaches' && p[2] === 'clients' && p.length === 3) return apply('clients');
        if (p[0] === 'coaches' && p[2] === 'routines' && p.length === 3) {
            const payload: any = this.pickRoutineColumns(dbData);
            if (payload.warmup) {
                payload.warmup_enabled = !!payload.warmup.enabled;
                payload.warmup_custom_text = payload.warmup.custom_text || payload.warmup.customText || null;
                delete payload.warmup;
            }
            if (dbData.warmup) {
                payload.warmup_enabled = !!dbData.warmup.enabled;
                payload.warmup_custom_text = dbData.warmup.custom_text || dbData.warmup.customText || null;
            }
            const { error } = await this.supabase.from('routines').update(payload).eq('id', docId);
            if (error) throw error;
            return;
        }
        if (p[0] === 'coaches' && p[2] === 'exercises') return apply('exercises');
        if (p[0] === 'coaches' && p[2] === 'competitor_sheets') return apply('competitor_sheets');
        if (p[0] === 'coaches' && p[2] === 'clients' && p[4] === 'measurements') return apply('measurements');
        if (p[0] === 'coaches' && p[2] === 'routines' && p[4] === 'days') {
            const payload: any = { ...dbData };
            const exercises = Array.isArray(payload.exercises) ? payload.exercises : null;
            delete payload.exercises;

            if (Object.keys(payload).length > 0) {
                const { error } = await this.supabase.from('routine_days').update(payload).eq('id', docId);
                if (error) throw error;
            }

            if (exercises) {
                const normalizedExercises = exercises.map((ex: any, i: number) => {
                    const exerciseId = ex.exercise_id || ex.exerciseId;
                    if (!exerciseId) {
                        throw new Error(`No se pudo guardar un ejercicio del día porque no tiene exerciseId (dayId=${docId}, index=${i})`);
                    }
                    const blockPayload = this.mapExerciseBlockToDb(ex);
                    return {
                        exercise_id: exerciseId,
                        sets: ex.sets || 3,
                        reps: ex.reps || '',
                        rest: ex.rest || '',
                        notes: ex.notes || null,
                        ...blockPayload,
                        video_url: ex.video_url || ex.videoUrl || null,
                        image_url: ex.image_url || ex.imageUrl || null,
                        order_index: typeof ex.order === 'number' ? ex.order : i,
                        week_configs: ex.week_configs || ex.weekConfigs || []
                    };
                });

                const { data: existing } = await this.supabase.from('routine_day_exercises').select('id').eq('routine_day_id', docId);
                for (const rde of existing || []) {
                    await this.supabase.from('routine_week_configs').delete().eq('routine_day_exercise_id', rde.id);
                }
                await this.supabase.from('routine_day_exercises').delete().eq('routine_day_id', docId);

                for (const ex of normalizedExercises) {
                    const { data: rde, error: rdeErr } = await this.supabase
                        .from('routine_day_exercises')
                        .insert({
                            routine_day_id: docId,
                            exercise_id: ex.exercise_id,
                            sets: ex.sets,
                            reps: ex.reps,
                            rest: ex.rest,
                            notes: ex.notes,
                            is_superset: ex.is_superset,
                            block_type: ex.block_type,
                            block_id: ex.block_id,
                            block_label: ex.block_label,
                            block_position: ex.block_position,
                            block_rest: ex.block_rest,
                            video_url: ex.video_url,
                            image_url: ex.image_url,
                            order_index: ex.order_index
                        })
                        .select('id')
                        .single();
                    if (rdeErr) throw rdeErr;

                    for (const wc of ex.week_configs) {
                        await this.supabase.from('routine_week_configs').insert({
                            routine_day_exercise_id: rde.id,
                            start_week: wc.start_week || wc.startWeek,
                            end_week: wc.end_week || wc.endWeek,
                            sets: wc.sets,
                            reps: wc.reps,
                            rest: wc.rest,
                            notes: wc.notes || null
                        });
                    }
                }
            }
            return;
        }
        if (p[0] === 'gyms' && p[2] === 'routines' && p.length === 3) {
            const payload: any = this.pickRoutineColumns(dbData);
            if (payload.warmup) {
                payload.warmup_enabled = !!payload.warmup.enabled;
                payload.warmup_custom_text = payload.warmup.custom_text || payload.warmup.customText || null;
                delete payload.warmup;
            }
            if (dbData.warmup) {
                payload.warmup_enabled = !!dbData.warmup.enabled;
                payload.warmup_custom_text = dbData.warmup.custom_text || dbData.warmup.customText || null;
            }
            const { error } = await this.supabase.from('routines').update(payload).eq('id', docId);
            if (error) throw error;
            return;
        }
        if (p[0] === 'gyms' && p[2] === 'exercises') return apply('exercises');
        if (p[0] === 'gyms' && p[2] === 'payments') return apply('payments');
        if (p[0] === 'gyms' && p[2] === 'membershipPlans') return apply('membership_plans');
        if (p[0] === 'gyms' && p[2] === 'coaches') return apply('gym_staff', 'coach_id');
        if (p[0] === 'gyms' && p[2] === 'competitor_sheets') return apply('competitor_sheets');
        if (p[0] === 'gyms' && p[2] === 'routines' && p[4] === 'days') {
            const payload: any = { ...dbData };
            const exercises = Array.isArray(payload.exercises) ? payload.exercises : null;
            delete payload.exercises;

            if (Object.keys(payload).length > 0) {
                const { error } = await this.supabase.from('routine_days').update(payload).eq('id', docId);
                if (error) throw error;
            }

            if (exercises) {
                const normalizedExercises = exercises.map((ex: any, i: number) => {
                    const exerciseId = ex.exercise_id || ex.exerciseId;
                    if (!exerciseId) {
                        throw new Error(`No se pudo guardar un ejercicio del día porque no tiene exerciseId (dayId=${docId}, index=${i})`);
                    }
                    const blockPayload = this.mapExerciseBlockToDb(ex);
                    return {
                        exercise_id: exerciseId,
                        sets: ex.sets || 3,
                        reps: ex.reps || '',
                        rest: ex.rest || '',
                        notes: ex.notes || null,
                        ...blockPayload,
                        video_url: ex.video_url || ex.videoUrl || null,
                        image_url: ex.image_url || ex.imageUrl || null,
                        order_index: typeof ex.order === 'number' ? ex.order : i,
                        week_configs: ex.week_configs || ex.weekConfigs || []
                    };
                });

                const { data: existing } = await this.supabase.from('routine_day_exercises').select('id').eq('routine_day_id', docId);
                for (const rde of existing || []) {
                    await this.supabase.from('routine_week_configs').delete().eq('routine_day_exercise_id', rde.id);
                }
                await this.supabase.from('routine_day_exercises').delete().eq('routine_day_id', docId);

                for (const ex of normalizedExercises) {
                    const { data: rde, error: rdeErr } = await this.supabase
                        .from('routine_day_exercises')
                        .insert({
                            routine_day_id: docId,
                            exercise_id: ex.exercise_id,
                            sets: ex.sets,
                            reps: ex.reps,
                            rest: ex.rest,
                            notes: ex.notes,
                            is_superset: ex.is_superset,
                            block_type: ex.block_type,
                            block_id: ex.block_id,
                            block_label: ex.block_label,
                            block_position: ex.block_position,
                            block_rest: ex.block_rest,
                            video_url: ex.video_url,
                            image_url: ex.image_url,
                            order_index: ex.order_index
                        })
                        .select('id')
                        .single();
                    if (rdeErr) throw rdeErr;

                    for (const wc of ex.week_configs) {
                        await this.supabase.from('routine_week_configs').insert({
                            routine_day_exercise_id: rde.id,
                            start_week: wc.start_week || wc.startWeek,
                            end_week: wc.end_week || wc.endWeek,
                            sets: wc.sets,
                            reps: wc.reps,
                            rest: wc.rest,
                            notes: wc.notes || null
                        });
                    }
                }
            }
            return;
        }
        if (p[0] === 'gyms' && p[2] === 'clients') {
            const gymId = p[1];
            const clientPayload: any = {};
            const membershipPayload: any = {};
            const clientCols = new Set([
                'name', 'email', 'phone', 'birth_date', 'age', 'weight', 'height', 'goal', 'notes', 'address',
                'updated_at'
            ]);
            const membershipCols = new Set([
                'assigned_coach_id', 'membership_plan_id', 'next_payment_due_date',
                'subscription_status', 'portal_status', 'portal_invited_at', 'updated_at'
            ]);

            Object.entries(dbData).forEach(([k, v]) => {
                if (clientCols.has(k)) clientPayload[k] = v;
                else if (membershipCols.has(k)) membershipPayload[k] = v;
            });

            if (Object.keys(clientPayload).length > 0) {
                const { error: cErr } = await this.supabase
                    .from('clients')
                    .update(clientPayload)
                    .eq('id', docId);
                if (cErr) throw cErr;
            }

            if (Object.keys(membershipPayload).length > 0) {
                const { error } = await this.supabase
                    .from('client_gym_memberships')
                    .update(membershipPayload)
                    .eq('gym_id', gymId)
                    .eq('client_id', docId);
                if (error) throw error;
            }
            return;
        }
        if (p[0] === 'gyms' && p[2] === 'clients' && p[4] === 'measurements') return apply('measurements');

        throw new Error(`Unsupported update path in Supabase adapter: ${collectionPath}`);
    }

    async deleteDocument(collectionPath: string, docId: string): Promise<void> {
        const p = this.split(collectionPath);

        const del = async (table: string, idColumn = 'id') => {
            const { error } = await this.supabase.from(table).delete().eq(idColumn, docId);
            if (error) throw error;
        };

        if (collectionPath === 'coaches') return del('coaches');
        if (collectionPath === 'gyms') return del('gyms');
        if (collectionPath === 'exercises_global') return del('exercises');
        if (collectionPath === 'activity_logins') return del('activity_logins');
        if (p[0] === 'coaches' && p[2] === 'clients' && p.length === 3) return del('clients');
        if (p[0] === 'coaches' && p[2] === 'routines' && p[4] === 'days') return del('routine_days');
        if (p[0] === 'coaches' && p[2] === 'routines' && p.length === 3) return del('routines');
        if (p[0] === 'coaches' && p[2] === 'exercises') return del('exercises');
        if (p[0] === 'coaches' && p[2] === 'competitor_sheets') return del('competitor_sheets');
        if (p[0] === 'coaches' && p[2] === 'clients' && p[4] === 'measurements') return del('measurements');
        if (p[0] === 'gyms' && p[2] === 'routines' && p.length === 3) return del('routines');
        if (p[0] === 'gyms' && p[2] === 'exercises') return del('exercises');
        if (p[0] === 'gyms' && p[2] === 'payments') return del('payments');
        if (p[0] === 'gyms' && p[2] === 'membershipPlans') return del('membership_plans');
        if (p[0] === 'gyms' && p[2] === 'coaches') return del('gym_staff', 'coach_id');
        if (p[0] === 'gyms' && p[2] === 'competitor_sheets') return del('competitor_sheets');
        if (p[0] === 'gyms' && p[2] === 'routines' && p[4] === 'days') return del('routine_days');
        if (p[0] === 'gyms' && p[2] === 'clients' && p.length === 3) {
            const gymId = p[1];
            const { error } = await this.supabase
                .from('client_gym_memberships')
                .delete()
                .eq('gym_id', gymId)
                .eq('client_id', docId);
            if (error) throw error;

            // If the client no longer belongs to any gym, delete the base client row too.
            const { count, error: countErr } = await this.supabase
                .from('client_gym_memberships')
                .select('id', { head: true, count: 'exact' })
                .eq('client_id', docId);
            if (countErr) throw countErr;

            if ((count || 0) === 0) {
                const { error: clientErr } = await this.supabase
                    .from('clients')
                    .delete()
                    .eq('id', docId);
                if (clientErr) throw clientErr;
            }
            return;
        }
        if (p[0] === 'gyms' && p[2] === 'clients' && p[4] === 'measurements') return del('measurements');

        throw new Error(`Unsupported delete path in Supabase adapter: ${collectionPath}`);
    }

    async documentExists(collectionPath: string, docId: string): Promise<boolean> {
        const item = await this.getDocument(collectionPath, docId);
        return !!item;
    }
}
