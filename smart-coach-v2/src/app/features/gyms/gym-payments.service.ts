import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  GymBillingMembership,
  GymMembershipPlan,
  GymPaymentInput,
  GymPaymentRecord,
  GymPaymentsData,
  GymPlanInput,
  GymSubscriptionStatus
} from './gym-payments.models';

@Injectable({ providedIn: 'root' })
export class GymPaymentsService {
  private readonly supabase = inject(SupabaseService).client;

  async load(gymId: string): Promise<GymPaymentsData> {
    const [plansResult, membershipsResult] = await Promise.all([
      this.supabase
        .from('membership_plans')
        .select('id,gym_id,name,price,currency,active,description')
        .eq('gym_id', gymId)
        .order('active', { ascending: false })
        .order('name', { ascending: true }),
      this.supabase
        .from('client_gym_memberships')
        .select('id,client_id,membership_plan_id,next_payment_due_date,subscription_status,clients(id,name,email)')
        .eq('gym_id', gymId)
        .order('next_payment_due_date', { ascending: true, nullsFirst: true })
    ]);
    if (plansResult.error) throw plansResult.error;
    if (membershipsResult.error) throw membershipsResult.error;

    const plans = (plansResult.data || []).map((row): GymMembershipPlan => ({
      id: row.id,
      gymId: row.gym_id,
      name: row.name,
      price: Number(row.price || 0),
      currency: row.currency || 'CRC',
      active: !!row.active,
      description: row.description
    }));
    const plansById = new Map(plans.map((plan) => [plan.id, plan]));
    const memberships = (membershipsResult.data || []).flatMap((row: any): GymBillingMembership[] => {
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      if (!client) return [];
      const plan = row.membership_plan_id ? plansById.get(row.membership_plan_id) : undefined;
      return [{
        id: row.id,
        clientId: row.client_id,
        clientName: client.name || 'Cliente sin nombre',
        clientEmail: client.email || '',
        planId: row.membership_plan_id,
        planName: plan?.name || null,
        planPrice: plan?.price ?? null,
        currency: plan?.currency || 'CRC',
        nextDueDate: row.next_payment_due_date,
        subscriptionStatus: row.subscription_status as GymSubscriptionStatus
      }];
    });

    let payments: GymPaymentRecord[] = [];
    if (memberships.length) {
      const paymentRows: any[] = [];
      for (let offset = 0; ; offset += 1000) {
      const paymentResult = await this.supabase
        .from('payments')
        .select('id,client_gym_membership_id,amount,currency,method,due_date,paid_date,status,notes,created_at')
        .in('client_gym_membership_id', memberships.map((membership) => membership.id))
        .order('paid_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(offset, offset + 999);
      if (paymentResult.error) throw paymentResult.error;
      paymentRows.push(...(paymentResult.data || []));
      if ((paymentResult.data || []).length < 1000) break;
      }
      const membershipById = new Map(memberships.map((membership) => [membership.id, membership]));
      payments = paymentRows.flatMap((row): GymPaymentRecord[] => {
        const membership = membershipById.get(row.client_gym_membership_id);
        if (!membership) return [];
        return [{
          id: row.id,
          membershipId: row.client_gym_membership_id,
          planId: membership.planId,
          clientId: membership.clientId,
          clientName: membership.clientName,
          amount: Number(row.amount || 0),
          currency: row.currency || 'CRC',
          method: row.method,
          dueDate: row.due_date,
          paidDate: row.paid_date,
          status: row.status,
          notes: row.notes,
          createdAt: row.created_at
        }];
      });
    }

    return { memberships, plans, payments };
  }

  async registerPayment(gymId: string, membershipId: string, input: GymPaymentInput): Promise<string> {
    const permission = await this.supabase.rpc('can_manage_clients', { p_gym_id: gymId });
    if (permission.error) throw permission.error;
    if (!permission.data) {
      throw Object.assign(new Error('Tu acceso permite consultar pagos, pero no actualizar el vencimiento de la membresía. Solicita el registro a quien gestione clientes.'), {
        code: 'PAYMENT_MEMBERSHIP_PERMISSION_REQUIRED'
      });
    }
    const membership = await this.supabase.from('client_gym_memberships')
      .select('id,next_payment_due_date').eq('id', membershipId).eq('gym_id', gymId).single();
    if (membership.error) throw membership.error;
    const identity = await this.supabase.auth.getUser();
    if (identity.error) throw identity.error;
    if (!identity.data.user) throw new Error('No hay una sesión activa.');
    const now = new Date();
    const { data, error } = await this.supabase.from('payments').insert({
      client_gym_membership_id: membershipId,
      amount: input.amount,
      currency: input.currency,
      method: input.method || null,
      due_date: membership.data.next_payment_due_date || now.toISOString(),
      status: 'paid', paid_date: `${input.paidDate}T12:00:00`,
      notes: input.notes || null, created_by: identity.data.user.id
    }).select('id').single();
    if (error) throw error;
    const due = membership.data.next_payment_due_date ? new Date(membership.data.next_payment_due_date) : now;
    const nextDate = due > now ? due : new Date(now);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const updated = await this.supabase.from('client_gym_memberships').update({
      next_payment_due_date: nextDate.toISOString(), subscription_status: 'active', updated_at: now.toISOString()
    }).eq('id', membershipId).eq('gym_id', gymId).select('id');
    if (updated.error || !updated.data?.length) {
      throw Object.assign(new Error('El pago ya quedó registrado, pero no pudimos actualizar el vencimiento. Ajusta la membresía sin registrar otro pago.'), {
        code: 'PAYMENT_RECORDED_MEMBERSHIP_PENDING', paymentId: data.id
      });
    }
    return data.id;
  }

  async configureMembership(
    gymId: string,
    membershipId: string,
    input: { planId: string | null; dueDate: string | null; status: GymSubscriptionStatus },
    managePlan = false
  ): Promise<void> {
    if (managePlan) {
      const permission = await this.supabase.rpc('is_gym_owner', { p_gym_id: gymId });
      if (permission.error) throw permission.error;
      if (!permission.data) throw new Error('Solo el propietario o administración puede cambiar el plan y estado de la membresía.');
      if (input.planId) {
        const plan = await this.supabase.from('membership_plans').select('id').eq('id', input.planId).eq('gym_id', gymId).maybeSingle();
        if (plan.error) throw plan.error;
        if (!plan.data) throw new Error('El plan de membresía no pertenece a este gimnasio.');
      }
    }
    const { data, error } = await this.supabase
      .from('client_gym_memberships')
      .update({
        ...(managePlan ? { membership_plan_id: input.planId, subscription_status: input.status } : {}),
        next_payment_due_date: input.dueDate ? `${input.dueDate}T12:00:00` : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', membershipId)
      .eq('gym_id', gymId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para actualizar esta membresía.');
  }

  async savePlan(gymId: string, input: GymPlanInput, planId?: string): Promise<string> {
    const payload = {
      gym_id: gymId,
      name: input.name.trim(),
      price: input.price,
      currency: input.currency,
      active: input.active,
      description: input.description?.trim() || null,
      updated_at: new Date().toISOString()
    };
    if (planId) {
      const { data, error } = await this.supabase
        .from('membership_plans')
        .update(payload)
        .eq('id', planId)
        .eq('gym_id', gymId)
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    }
    const { data, error } = await this.supabase
      .from('membership_plans')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  async deletePlan(gymId: string, planId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('membership_plans')
      .delete()
      .eq('id', planId)
      .eq('gym_id', gymId)
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No tienes permiso para eliminar este plan.');
  }
}
