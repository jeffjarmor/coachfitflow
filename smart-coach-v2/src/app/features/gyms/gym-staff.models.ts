import { GymStaffRole } from './gym.models';

export type EditableGymStaffRole = Exclude<GymStaffRole, 'admin'>;

export interface GymStaffPermissions {
  canEditClients: boolean;
  canCreateRoutines: boolean;
  canViewPayments: boolean;
  canManageStaff: boolean;
}

export interface GymStaffMember {
  coachId: string;
  name: string;
  email: string;
  role: EditableGymStaffRole;
  joinedAt: string;
  primaryOwner: boolean;
  permissions: GymStaffPermissions;
}

export interface GymStaffInput {
  email?: string;
  role: EditableGymStaffRole;
  permissions: GymStaffPermissions;
}
