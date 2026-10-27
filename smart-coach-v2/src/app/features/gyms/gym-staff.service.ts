import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { GymStaffInput, GymStaffMember } from './gym-staff.models';

@Injectable({ providedIn: 'root' })
export class GymStaffService {
  private readonly supabase = inject(SupabaseService).client;

  async load(gymId: string, primaryOwnerId?: string | null): Promise<GymStaffMember[]> {
    const { data, error } = await this.supabase
      .from('gym_staff')
      .select('coach_id,role,joined_at,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff,coaches(name,email)')
      .eq('gym_id', gymId)
      .order('joined_at', { ascending: true });
    if (error) throw error;

    const members = (data || []).flatMap((row: any): GymStaffMember[] => {
      const coach = Array.isArray(row.coaches) ? row.coaches[0] : row.coaches;
      if (!coach || row.role === 'admin') return [];
      return [{
        coachId: row.coach_id,
        name: coach.name || 'Persona sin nombre',
        email: coach.email || '',
        role: row.role,
        joinedAt: row.joined_at,
        primaryOwner: row.coach_id === primaryOwnerId,
        permissions: {
          canEditClients: !!row.can_edit_clients,
          canCreateRoutines: !!row.can_create_routines,
          canViewPayments: !!row.can_view_payments,
          canManageStaff: !!row.can_manage_staff
        }
      }];
    });
    const roleOrder = { owner: 0, trainer: 1, receptionist: 2 } as const;
    return members.sort((a, b) => Number(b.primaryOwner) - Number(a.primaryOwner)
      || roleOrder[a.role] - roleOrder[b.role]
      || a.name.localeCompare(b.name, 'es'));
  }

  async update(gymId: string, coachId: string, input: GymStaffInput): Promise<void> {
    const { error } = await this.supabase.rpc('set_gym_staff_role', {
      p_gym_id: gymId, p_coach_id: coachId, p_role: input.role
    });
    if (error) throw error;
  }

  async remove(gymId: string, coachId: string): Promise<void> {
    const { error } = await this.supabase.rpc('remove_gym_staff_member', {
      p_gym_id: gymId,
      p_coach_id: coachId
    });
    if (error) throw error;
  }
}
