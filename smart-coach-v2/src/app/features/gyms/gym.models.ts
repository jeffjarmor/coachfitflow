export type GymStaffRole = 'owner' | 'trainer' | 'receptionist' | 'admin';

export interface GymPermissions {
  canEditClients: boolean;
  canCreateRoutines: boolean;
  canViewPayments: boolean;
  canManageStaff: boolean;
  canManageSettings: boolean;
}

export interface GymSummary {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  accessCode: string;
  ownerId?: string | null;
}

export interface GymContext {
  gym: GymSummary;
  role: GymStaffRole;
  roleLabel: string;
  joinedAt?: string | null;
  primaryOwner: boolean;
  permissions: GymPermissions;
}

export interface GymDashboardData {
  clients: number;
  staff: number;
  routines: number;
  overduePayments: number | null;
}

export type GymPermission = keyof GymPermissions;

