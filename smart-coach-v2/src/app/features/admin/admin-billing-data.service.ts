import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../../core/auth/supabase.service';

export interface AdminBillingCoachPlan {
  id: string;
  name: string;
  email: string;
  plan: 'paid' | 'standard';
  accessThrough: string | null;
  renewal: 'automatic' | 'disabled' | 'pending' | 'failed' | null;
}

export interface AdminBillingMovement {
  id: string;
  coachName: string;
  date: string;
  status: string;
  amountMinor: number;
  currency: 'USD' | 'CRC';
  kind: 'subscription' | 'renewal';
}

export interface AdminBillingSettlement {
  id: string;
  reference: string | null;
  date: string;
  transactionCount: number | null;
  grossMinor: number;
  feesMinor: number | null;
  payoutFeeMinor: number | null;
  retentionsMinor: number | null;
  netMinor: number;
  status: 'paid';
}

export interface AdminBillingReport {
  asOf: string;
  activeSubscriptions: number;
  renewalsDue: number;
  collectedMinor: number;
  previousCollectedMinor: number;
  movements: AdminBillingMovement[];
  settlements: AdminBillingSettlement[];
}

export type BillingCurrency = 'USD' | 'CRC';

function requireLocalBillingApi(): void {
  let hostname = '';
  try { hostname = new URL(environment.supabase.url).hostname.toLowerCase(); } catch { /* handled below */ }
  if (environment.production || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) {
    throw new Error('La conciliación de billing está disponible solo en el entorno local de pruebas.');
  }
}

@Injectable({ providedIn: 'root' })
export class AdminBillingDataService {
  private readonly supabase = inject(SupabaseService).client;

  async listPlans(): Promise<AdminBillingCoachPlan[]> {
    requireLocalBillingApi();
    const { data, error } = await this.supabase.rpc('admin_billing_plans');
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Respuesta inválida al consultar los planes.');
    return data as AdminBillingCoachPlan[];
  }

  async report(month: string, currency: BillingCurrency): Promise<AdminBillingReport> {
    requireLocalBillingApi();
    if (!/^\d{4}-\d{2}$/.test(month) || !['USD', 'CRC'].includes(currency)) throw new Error('Filtros de conciliación inválidos.');
    const { data, error } = await this.supabase.rpc('admin_billing_report', {
      p_month: `${month}-01`,
      p_currency: currency
    });
    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Respuesta inválida al consultar la conciliación.');
    return data as AdminBillingReport;
  }
}
