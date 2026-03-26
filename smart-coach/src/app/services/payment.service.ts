import { Injectable, inject } from '@angular/core';
import {
    Payment,
    CreatePaymentData,
    UpdatePaymentData,
    PaymentStats
} from '../models/payment.model';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class PaymentService {
    private supabase = inject(SupabaseService).client;

    private async resolveMembershipId(gymId: string, clientId: string): Promise<string> {
        const { data, error } = await this.supabase
            .from('client_gym_memberships')
            .select('id')
            .eq('gym_id', gymId)
            .eq('client_id', clientId)
            .single();
        if (error) throw error;
        return data.id;
    }

    private async mapPaymentsForGym(gymId: string): Promise<Payment[]> {
        const { data, error } = await this.supabase
            .from('payments')
            .select('*, client_gym_memberships!inner(gym_id, client_id, membership_plan_id)')
            .eq('client_gym_memberships.gym_id', gymId)
            .order('due_date', { ascending: false });

        if (error) throw error;

        return (data || []).map((row: any) => ({
            id: row.id,
            clientId: row.client_gym_memberships?.client_id,
            membershipPlanId: row.client_gym_memberships?.membership_plan_id,
            amount: row.amount,
            currency: row.currency,
            method: row.method,
            dueDate: row.due_date,
            paidDate: row.paid_date,
            status: row.status,
            notes: row.notes,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));
    }

    async createPayment(gymId: string, data: CreatePaymentData): Promise<Payment> {
        const membershipId = await this.resolveMembershipId(gymId, data.clientId);
        const payload = {
            client_gym_membership_id: membershipId,
            amount: data.amount,
            currency: data.currency || 'USD',
            method: data.method || null,
            due_date: data.dueDate,
            status: 'pending',
            notes: data.notes || null,
            created_by: data.createdBy || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data: row, error } = await this.supabase
            .from('payments')
            .insert(payload)
            .select('*')
            .single();

        if (error) throw error;

        return {
            id: row.id,
            clientId: data.clientId,
            membershipPlanId: data.membershipPlanId,
            amount: row.amount,
            currency: row.currency,
            method: row.method,
            dueDate: row.due_date,
            paidDate: row.paid_date,
            status: row.status,
            notes: row.notes,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    async getClientPayments(gymId: string, clientId: string): Promise<Payment[]> {
        const all = await this.mapPaymentsForGym(gymId);
        return all.filter(p => p.clientId === clientId);
    }

    async getAllPayments(gymId: string): Promise<Payment[]> {
        return this.mapPaymentsForGym(gymId);
    }

    async getOverduePayments(gymId: string): Promise<Payment[]> {
        const all = await this.mapPaymentsForGym(gymId);
        return all.filter(p => p.status === 'overdue');
    }

    async markPaymentAsPaid(gymId: string, paymentId: string): Promise<void> {
        const all = await this.mapPaymentsForGym(gymId);
        const payment = all.find(p => p.id === paymentId);
        if (!payment) throw new Error('Pago no encontrado');

        const { error } = await this.supabase
            .from('payments')
            .update({
                status: 'paid',
                paid_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', paymentId);

        if (error) throw error;
    }

    async updatePayment(gymId: string, paymentId: string, data: UpdatePaymentData): Promise<void> {
        const all = await this.mapPaymentsForGym(gymId);
        const payment = all.find(p => p.id === paymentId);
        if (!payment) throw new Error('Pago no encontrado');

        const payload: any = {
            updated_at: new Date().toISOString()
        };

        if (data.amount !== undefined) payload.amount = data.amount;
        if (data.dueDate !== undefined) payload.due_date = data.dueDate;
        if (data.paidDate !== undefined) payload.paid_date = data.paidDate;
        if (data.status !== undefined) payload.status = data.status;
        if (data.notes !== undefined) payload.notes = data.notes;

        const { error } = await this.supabase.from('payments').update(payload).eq('id', paymentId);
        if (error) throw error;
    }

    async deletePayment(gymId: string, paymentId: string): Promise<void> {
        const all = await this.mapPaymentsForGym(gymId);
        const payment = all.find(p => p.id === paymentId);
        if (!payment) throw new Error('Pago no encontrado');

        const { error } = await this.supabase.from('payments').delete().eq('id', paymentId);
        if (error) throw error;
    }

    async getPaymentStats(gymId: string): Promise<PaymentStats> {
        const payments = await this.getAllPayments(gymId);

        const stats: PaymentStats = {
            totalPending: 0,
            totalPaid: 0,
            totalOverdue: 0,
            pendingAmount: 0,
            paidAmount: 0,
            overdueAmount: 0
        };

        payments.forEach(payment => {
            switch (payment.status) {
                case 'pending':
                    stats.totalPending++;
                    stats.pendingAmount += payment.amount;
                    break;
                case 'paid':
                    stats.totalPaid++;
                    stats.paidAmount += payment.amount;
                    break;
                case 'overdue':
                    stats.totalOverdue++;
                    stats.overdueAmount += payment.amount;
                    break;
            }
        });

        return stats;
    }

    async updateOverduePayments(gymId: string): Promise<void> {
        const payments = await this.getAllPayments(gymId);
        const now = new Date();

        const overdue = payments.filter(p => p.status === 'pending' && new Date(p.dueDate) < now);
        for (const payment of overdue) {
            await this.supabase
                .from('payments')
                .update({ status: 'overdue', updated_at: new Date().toISOString() })
                .eq('id', payment.id);
        }
    }

    async registerPayment(gymId: string, data: CreatePaymentData): Promise<Payment> {
        const payment = await this.createPayment(gymId, data);

        await this.supabase
            .from('payments')
            .update({
                status: 'paid',
                paid_date: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', payment.id);

        const membershipId = await this.resolveMembershipId(gymId, data.clientId);
        const { data: current } = await this.supabase
            .from('client_gym_memberships')
            .select('next_payment_due_date')
            .eq('id', membershipId)
            .single();

        let nextDate = current?.next_payment_due_date ? new Date(current.next_payment_due_date) : new Date();
        if (nextDate < new Date()) nextDate = new Date();
        nextDate.setMonth(nextDate.getMonth() + 1);

        await this.supabase
            .from('client_gym_memberships')
            .update({
                next_payment_due_date: nextDate.toISOString(),
                subscription_status: 'active',
                updated_at: new Date().toISOString()
            })
            .eq('id', membershipId);

        return {
            ...payment,
            status: 'paid',
            paidDate: new Date()
        };
    }
}
