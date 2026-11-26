import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../auth/supabase.service';
import { BillingMode } from './coach-billing.models';

export type CoachBillingWithdrawalStatus = 'pending' | 'approved' | 'rejected';

export const COACH_BILLING_WITHDRAWAL_LABELS: Record<CoachBillingWithdrawalStatus, string> = {
  pending: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada'
};

export interface CoachBillingWithdrawalSubscription {
  mode: BillingMode;
  subscription_id: string | null;
}

export interface CoachBillingWithdrawalRequest {
  id: string;
  coach_id: string | null;
  billing_mode: BillingMode;
  subscription_id: string;
  requested_at: string;
  refund_due_on: string;
  current_period_start: string | null;
  current_period_end: string | null;
  first_paid_invoice_created_at: string | null;
  status: CoachBillingWithdrawalStatus;
  resolved_at: string | null;
  resolution_note: string | null;
}

export interface AdminCoachBillingWithdrawalRequest extends CoachBillingWithdrawalRequest {
  coach: { name: string | null; email: string | null } | null;
}

const table = 'coach_billing_withdrawal_requests';
const columns = 'id,coach_id,billing_mode,subscription_id,requested_at,refund_due_on,current_period_start,current_period_end,first_paid_invoice_created_at,status,resolved_at,resolution_note';

@Injectable({ providedIn: 'root' })
export class CoachBillingWithdrawalService {
  private readonly supabase = inject(SupabaseService).client;

  async currentSubscription(coachId: string): Promise<CoachBillingWithdrawalSubscription | null> {
    const { data, error } = await this.supabase.from('coach_billing_accounts')
      .select('mode,subscription_id')
      .eq('coach_id', coachId)
      .maybeSingle<CoachBillingWithdrawalSubscription>();
    if (error) throw error;
    return data;
  }

  async listForCoach(coachId: string): Promise<CoachBillingWithdrawalRequest[]> {
    const { data, error } = await this.supabase.from(table)
      .select(columns)
      .eq('coach_id', coachId)
      .order('requested_at', { ascending: false })
      .order('id')
      .returns<CoachBillingWithdrawalRequest[]>();
    if (error) throw error;
    return data;
  }

  async request(subscriptionId: string): Promise<CoachBillingWithdrawalRequest> {
    const { data, error } = await this.supabase.rpc('request_coach_billing_withdrawal', {
      p_subscription_id: subscriptionId
    });
    if (error) throw error;
    return data as CoachBillingWithdrawalRequest;
  }

  async listForAdmin(status: CoachBillingWithdrawalStatus, offset: number, limit: number): Promise<AdminCoachBillingWithdrawalRequest[]> {
    const pending = status === 'pending';
    const { data, error } = await this.supabase.from(table)
      .select(`${columns},coach:coaches!coach_billing_withdrawal_requests_coach_id_fkey(name,email)`)
      .eq('status', status)
      .order(pending ? 'requested_at' : 'resolved_at', { ascending: pending })
      .order('id')
      .range(offset, offset + limit - 1)
      .returns<AdminCoachBillingWithdrawalRequest[]>();
    if (error) throw error;
    return data;
  }

  async resolve(id: string, status: 'approved' | 'rejected', note: string): Promise<CoachBillingWithdrawalRequest> {
    const { data, error } = await this.supabase.rpc('resolve_coach_billing_withdrawal', {
      p_request_id: id, p_status: status, p_resolution_note: note
    });
    if (error) throw error;
    return data as CoachBillingWithdrawalRequest;
  }
}
