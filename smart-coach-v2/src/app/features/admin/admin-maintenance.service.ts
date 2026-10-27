import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../core/auth/supabase.service';
import { AdminCoachRecord, AdminDataService } from './admin-data.service';

export interface MaintenanceGym {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
  ownerEmail: string;
}

export interface MaintenanceDirectory {
  gyms: MaintenanceGym[];
  availableOwners: AdminCoachRecord[];
}

export class AdminMaintenanceError extends Error {}

@Injectable({ providedIn: 'root' })
export class AdminMaintenanceService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly admin = inject(AdminDataService);

  async load(): Promise<MaintenanceDirectory> {
    await this.assertAdmin();
    const [gyms, coaches] = await Promise.all([this.admin.listGyms(), this.admin.listCoaches()]);
    const accounts = new Map(coaches.map((coach) => [coach.id, coach]));
    const ownerIds = new Set(gyms.flatMap((gym) => gym.ownerId ? [gym.ownerId] : []));
    return {
      gyms: gyms.map((gym) => ({
        ...gym,
        ownerName: gym.ownerId ? accounts.get(gym.ownerId)?.name || 'Propietario no disponible' : 'Sin propietario',
        ownerEmail: gym.ownerId ? accounts.get(gym.ownerId)?.email || '' : ''
      })),
      // Match the original administration picker: independent, non-admin accounts.
      availableOwners: coaches.filter((coach) => coach.role !== 'admin' && !coach.affiliations.length && !ownerIds.has(coach.id))
    };
  }

  async assignOwner(gym: MaintenanceGym, coachId: string): Promise<void> {
    await this.assertAdmin();
    const gyms = await this.assertCurrentGym(gym);
    const coach = await this.admin.getCoach(coachId);
    if (!coach || coach.role === 'admin' || coach.affiliations.length || gyms.some((row) => row.ownerId === coachId)) {
      throw new AdminMaintenanceError('La cuenta ya no es un entrenador independiente. Actualiza la lista y selecciona otra cuenta.');
    }
    await this.admin.assignGymOwner(gym.id, coachId);
  }

  async deleteGym(gym: MaintenanceGym, confirmation: string): Promise<void> {
    await this.assertAdmin();
    if (confirmation.trim() !== gym.name.trim()) {
      throw new AdminMaintenanceError('Escribe el nombre completo del gimnasio para confirmar la eliminación.');
    }
    await this.assertCurrentGym(gym);
    // Reuse the original scoped workflow. It does not delete coach/Auth accounts
    // or base client profiles; it removes the selected gym and its related data.
    await this.admin.deleteGym(gym.id);
    await this.assertAdmin();
    if ((await this.admin.listGyms()).some((row) => row.id === gym.id)) {
      throw new AdminMaintenanceError('La eliminación no se completó y puede haber cambios parciales. Actualiza la lista y revisa el gimnasio antes de repetir.');
    }
  }

  private async assertAdmin(): Promise<void> {
    const result = await this.supabase.rpc('is_admin');
    if (result.error) throw result.error;
    if (!result.data) throw new AdminMaintenanceError('Solo administración puede usar estas herramientas.');
  }

  private async assertCurrentGym(expected: MaintenanceGym) {
    const gyms = await this.admin.listGyms();
    const gym = gyms.find((row) => row.id === expected.id);
    if (!gym || gym.name !== expected.name || gym.ownerId !== expected.ownerId) {
      throw new AdminMaintenanceError('El gimnasio cambió o ya no está disponible. Actualiza la lista antes de continuar.');
    }
    return gyms;
  }
}
