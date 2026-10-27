import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';

export interface AdminActivityDay {
  /** Calendar date in the administrator's local time zone. */
  date: string;
  logins: number;
  routines: number;
}

export interface AdminActivitySummary {
  from: string;
  to: string;
  updatedAt: string;
  today: { logins: number; uniqueUsers: number; routines: number };
  total: { logins: number; routines: number };
  /** Last seven calendar days, oldest first, matching the original dashboard. */
  daily: AdminActivityDay[];
}

interface LoginActivity { timestamp: string; user_id: string | null }
interface RoutineActivity { created_at: string }

export class AdminActivityAccessError extends Error {
  readonly code = 'ADMIN_ACTIVITY_FORBIDDEN';
  constructor() {
    super('Esta actividad solo está disponible para administración.');
    this.name = 'AdminActivityAccessError';
  }
}

export function localActivityDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function summarizeAdminActivity(
  logins: readonly LoginActivity[], routines: readonly RoutineActivity[], now = new Date()
): AdminActivitySummary {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const daily: AdminActivityDay[] = Array.from({ length: 7 }, (_value, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (6 - index));
    return { date: localActivityDate(day), logins: 0, routines: 0 };
  });
  const byDate = new Map(daily.map((day) => [day.date, day]));
  const todayUsers = new Set<string>();
  const summary: AdminActivitySummary = {
    from: cutoff.toISOString(), to: now.toISOString(), updatedAt: now.toISOString(),
    today: { logins: 0, uniqueUsers: 0, routines: 0 }, total: { logins: 0, routines: 0 }, daily
  };
  for (const login of logins) {
    const date = new Date(login.timestamp);
    if (Number.isNaN(date.getTime()) || date < cutoff || date > now) continue;
    summary.total.logins++;
    const day = byDate.get(localActivityDate(date));
    if (day) day.logins++;
    if (date >= today) {
      summary.today.logins++;
      if (login.user_id) todayUsers.add(login.user_id);
    }
  }
  for (const routine of routines) {
    const date = new Date(routine.created_at);
    if (Number.isNaN(date.getTime()) || date < cutoff || date > now) continue;
    summary.total.routines++;
    const day = byDate.get(localActivityDate(date));
    if (day) day.routines++;
    if (date >= today) summary.today.routines++;
  }
  summary.today.uniqueUsers = todayUsers.size;
  return summary;
}

@Injectable({ providedIn: 'root' })
export class AdminActivityService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly pageSize = 1000;

  async load(referenceTime = new Date()): Promise<AdminActivitySummary> {
    // Use the validated Auth identity and its current database role, never editable metadata.
    const identity = await this.supabase.auth.getUser();
    if (identity.error) throw identity.error;
    if (!identity.data.user) throw new AdminActivityAccessError();
    const profile = await this.supabase.from('coaches').select('role').eq('id', identity.data.user.id).maybeSingle();
    if (profile.error) throw profile.error;
    if (profile.data?.role !== 'admin') throw new AdminActivityAccessError();

    const now = new Date(referenceTime);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 30);
    const [logins, routines] = await Promise.all([
      this.loadLogins(cutoff.toISOString(), now.toISOString()),
      this.loadRoutines(cutoff.toISOString(), now.toISOString())
    ]);
    // A failed page rejects the complete summary; partial data must never appear as zero activity.
    return summarizeAdminActivity(logins, routines, now);
  }

  private async loadLogins(from: string, to: string): Promise<LoginActivity[]> {
    const rows: LoginActivity[] = [];
    for (let offset = 0; ; offset += this.pageSize) {
      const result = await this.supabase.from('activity_logins').select('timestamp,user_id')
        .gte('timestamp', from).lte('timestamp', to)
        .order('timestamp', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + this.pageSize - 1);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data || []).length < this.pageSize) return rows;
    }
  }

  private async loadRoutines(from: string, to: string): Promise<RoutineActivity[]> {
    const rows: RoutineActivity[] = [];
    for (let offset = 0; ; offset += this.pageSize) {
      const result = await this.supabase.from('routines').select('created_at')
        .gte('created_at', from).lte('created_at', to)
        .order('created_at', { ascending: true }).order('id', { ascending: true })
        .range(offset, offset + this.pageSize - 1);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data || []).length < this.pageSize) return rows;
    }
  }
}
