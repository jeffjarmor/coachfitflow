import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import {
  GymContext,
  GymDashboardData,
  GymPermissions,
  GymStaffRole,
  GymSummary
} from './gym.models';

@Injectable({ providedIn: 'root' })
export class GymContextService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly gymsState = signal<GymContext[]>([]);
  private readonly activeGymState = signal<GymContext | null>(null);
  private loadedUserId = '';

  readonly gyms = this.gymsState.asReadonly();
  readonly activeGym = this.activeGymState.asReadonly();

  async loadAccessibleGyms(userId: string, profileRole: string, force = false): Promise<GymContext[]> {
    if (!force && this.loadedUserId === userId) return this.gymsState();

    const [gymsResult, staffResult] = await Promise.all([
      this.supabase
        .from('gyms')
        .select('id,name,email,phone,address,logo_url,brand_color,access_code,owner_id')
        .order('name', { ascending: true }),
      this.supabase
        .from('gym_staff')
        .select('gym_id,role,joined_at,can_edit_clients,can_create_routines,can_view_payments,can_manage_staff')
        .eq('coach_id', userId)
    ]);

    if (gymsResult.error) throw gymsResult.error;
    if (staffResult.error) throw staffResult.error;

    const memberships = new Map((staffResult.data || []).map((row) => [row.gym_id, row]));
    const isAdmin = profileRole === 'admin';
    const contexts = (gymsResult.data || []).flatMap((row): GymContext[] => {
      const membership = memberships.get(row.id);
      const primaryOwner = row.owner_id === userId;
      if (!isAdmin && !primaryOwner && !membership) return [];

      const role = (isAdmin ? 'admin' : primaryOwner ? 'owner' : membership?.role || 'trainer') as GymStaffRole;
      const permissions = this.permissionsFor(role, membership);
      return [{
        gym: this.mapGym(row),
        role,
        roleLabel: this.roleLabel(role),
        joinedAt: membership?.joined_at,
        primaryOwner,
        permissions
      }];
    });

    this.loadedUserId = userId;
    this.gymsState.set(contexts);

    const storedId = this.readStoredGymId(userId);
    const previousId = this.activeGymState()?.gym.id;
    const nextActive = contexts.find((context) => context.gym.id === previousId)
      || contexts.find((context) => context.gym.id === storedId)
      || contexts.find((context) => context.primaryOwner)
      || contexts[0] || null;
    this.activeGymState.set(nextActive || null);
    if (nextActive) this.storeGymId(userId, nextActive.gym.id);
    return contexts;
  }

  activateGym(gymId: string, userId: string): GymContext | null {
    const context = this.gymsState().find((item) => item.gym.id === gymId) || null;
    this.activeGymState.set(context);
    if (context) this.storeGymId(userId, gymId);
    return context;
  }

  async joinByAccessCode(userId: string, profileRole: string, accessCode: string): Promise<GymContext> {
    const normalized = accessCode.trim().toUpperCase();
    if (!normalized) throw new Error('Escribe el código de acceso del gimnasio.');

    const { data, error } = await this.supabase.rpc('join_gym_by_access_code', {
      p_access_code: normalized
    });
    if (error) throw new Error(this.joinError(error.message));

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.id) throw new Error('No pudimos confirmar el ingreso al gimnasio.');
    await this.loadAccessibleGyms(userId, profileRole, true);
    const context = this.activateGym(row.id, userId);
    if (!context) throw new Error('El gimnasio se agregó, pero no pudimos abrirlo. Recarga e inténtalo nuevamente.');
    return context;
  }

  async loadDashboard(context: GymContext): Promise<GymDashboardData> {
    const [membershipsResult, staffResult] = await Promise.all([
      this.supabase
        .from('client_gym_memberships')
        .select('id,next_payment_due_date,subscription_status')
        .eq('gym_id', context.gym.id),
      this.supabase
        .from('gym_staff')
        .select('coach_id')
        .eq('gym_id', context.gym.id)
    ]);

    if (membershipsResult.error) throw membershipsResult.error;
    if (staffResult.error) throw staffResult.error;

    const memberships = membershipsResult.data || [];
    const membershipIds = memberships.map((row) => row.id);
    let routines = 0;
    if (membershipIds.length) {
      const routinesResult = await this.supabase
        .from('routines')
        .select('id', { count: 'exact', head: true })
        .in('client_gym_membership_id', membershipIds);
      if (routinesResult.error) throw routinesResult.error;
      routines = routinesResult.count || 0;
    }

    const staffIds = new Set((staffResult.data || []).map((row) => row.coach_id));
    if (context.gym.ownerId) staffIds.add(context.gym.ownerId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overduePayments = context.permissions.canViewPayments
      ? memberships.filter((membership) => {
          if (membership.subscription_status === 'overdue') return true;
          if (!membership.next_payment_due_date || membership.subscription_status === 'inactive') return false;
          const dueDate = new Date(membership.next_payment_due_date);
          dueDate.setHours(0, 0, 0, 0);
          return Number.isFinite(dueDate.getTime()) && dueDate < today;
        }).length
      : null;

    return {
      clients: memberships.length,
      staff: staffIds.size,
      routines,
      overduePayments
    };
  }

  clear(): void {
    this.loadedUserId = '';
    this.gymsState.set([]);
    this.activeGymState.set(null);
  }

  private permissionsFor(role: GymStaffRole, membership: any): GymPermissions {
    if (role === 'owner' || role === 'admin') {
      return {
        canEditClients: true,
        canCreateRoutines: true,
        canViewPayments: true,
        canManageStaff: true,
        canManageSettings: true
      };
    }
    return {
      canEditClients: !!membership?.can_edit_clients,
      canCreateRoutines: !!membership?.can_create_routines,
      canViewPayments: !!membership?.can_view_payments,
      canManageStaff: !!membership?.can_manage_staff,
      canManageSettings: false
    };
  }

  private mapGym(row: any): GymSummary {
    return {
      id: row.id,
      name: row.name || 'Gimnasio sin nombre',
      email: row.email,
      phone: row.phone,
      address: row.address,
      logoUrl: row.logo_url,
      brandColor: row.brand_color,
      accessCode: row.access_code,
      ownerId: row.owner_id
    };
  }

  private roleLabel(role: GymStaffRole): string {
    if (role === 'owner') return 'Propietario';
    if (role === 'receptionist') return 'Recepción';
    if (role === 'admin') return 'Administrador';
    return 'Entrenador';
  }

  private joinError(message: string): string {
    const normalized = message.toLocaleLowerCase('es');
    if (normalized.includes('invalid access code')) return 'No encontramos un gimnasio con ese código.';
    if (normalized.includes('already a member')) return 'Ya formas parte de este gimnasio.';
    if (normalized.includes('coach not found')) return 'Tu perfil de entrenador todavía no está listo. Recarga e inténtalo nuevamente.';
    if (normalized.includes('not authenticated')) return 'Tu sesión venció. Inicia sesión nuevamente.';
    return 'No pudimos unirte al gimnasio. Revisa el código e inténtalo nuevamente.';
  }

  private readStoredGymId(userId: string): string {
    try {
      return localStorage.getItem(`zummith:active-gym:${userId}`) || '';
    } catch {
      return '';
    }
  }

  private storeGymId(userId: string, gymId: string): void {
    try {
      localStorage.setItem(`zummith:active-gym:${userId}`, gymId);
    } catch {
      // The route remains the source of truth if storage is unavailable.
    }
  }
}

