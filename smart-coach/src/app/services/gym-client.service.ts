import { Injectable, inject } from '@angular/core';
import { GymClientProfile } from '../models/gym-client.model';
import { Client } from '../models/client.model';
import { Routine } from '../models/routine.model';
import { Measurement } from '../models/measurement.model';
import { Payment } from '../models/payment.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class GymClientService {
    private supabase = inject(SupabaseService).client;

    async getClientProfile(uid: string): Promise<GymClientProfile | null> {
        try {
            const { data, error } = await this.supabase
                .from('client_portal_access')
                .select('user_id, created_at, client_gym_memberships!inner(gym_id, client_id, gyms(name))')
                .eq('user_id', uid)
                .limit(1)
                .maybeSingle();

            if (error || !data) return null;

            const membership: any = Array.isArray(data.client_gym_memberships)
                ? data.client_gym_memberships[0]
                : data.client_gym_memberships;
            const gymRel: any = Array.isArray(membership?.gyms) ? membership.gyms[0] : membership?.gyms;

            return {
                uid: data.user_id,
                gymId: membership?.gym_id,
                clientId: membership?.client_id,
                gymName: gymRel?.name || '',
                createdAt: data.created_at
            };
        } catch {
            return null;
        }
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

    async getMyRoutines(gymId: string, clientId: string): Promise<Array<{ id: string; routine: Routine }>> {
        try {
            const { data: membership } = await this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('gym_id', gymId)
                .eq('client_id', clientId)
                .maybeSingle();

            const { data, error } = await this.supabase
                .from('routines')
                .select('*')
                .eq('client_id', clientId)
                .eq('client_gym_membership_id', membership?.id || null)
                .order('created_at', { ascending: false });

            if (error) return [];
            return (data || []).map((r: any) => ({ id: r.id, routine: r }));
        } catch (error) {
            console.error('GymClientService.getMyRoutines:', error);
            return [];
        }
    }

    async getMyMeasurements(gymId: string, clientId: string): Promise<Measurement[]> {
        try {
            const { data: membership } = await this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('gym_id', gymId)
                .eq('client_id', clientId)
                .maybeSingle();

            const { data, error } = await this.supabase
                .from('measurements')
                .select('*')
                .eq('client_id', clientId)
                .eq('client_gym_membership_id', membership?.id || null)
                .order('date', { ascending: false });

            if (error) return [];
            return data || [];
        } catch (error) {
            console.error('GymClientService.getMyMeasurements:', error);
            return [];
        }
    }

    async getMyPayments(gymId: string, clientId: string): Promise<Payment[]> {
        try {
            const { data: membership } = await this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('gym_id', gymId)
                .eq('client_id', clientId)
                .single();
            if (!membership) return [];

            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('client_gym_membership_id', membership.id)
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

    async getMyRoutineDetail(gymId: string, routineId: string): Promise<{ routine: Routine | null; days: any[] }> {
        try {
            const { data: routine, error: rError } = await this.supabase
                .from('routines')
                .select('*')
                .eq('id', routineId)
                .single();

            if (rError || !routine) return { routine: null, days: [] };

            if (routine.client_gym_membership_id) {
                const { data: membership } = await this.supabase
                    .from('client_gym_memberships')
                    .select('gym_id')
                    .eq('id', routine.client_gym_membership_id)
                    .maybeSingle();
                if (membership?.gym_id !== gymId) return { routine: null, days: [] };
            }

            const { data: days, error: dError } = await this.supabase
                .from('routine_days')
                .select('*')
                .eq('routine_id', routineId)
                .order('day_number', { ascending: true });

            if (dError) return { routine: routine as Routine, days: [] };

            return { routine: routine as Routine, days: days || [] };
        } catch (error) {
            console.error('GymClientService.getMyRoutineDetail:', error);
            return { routine: null, days: [] };
        }
    }
}
