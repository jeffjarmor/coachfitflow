export type GymCoachRole = 'owner' | 'trainer' | 'receptionist';

export interface GymCoach {
    coachId: string;     // Reference to main coach in coaches collection
    name: string;        // Denormalized for quick display
    email: string;       // Denormalized for quick display
    role: GymCoachRole;
    joinedAt: Date;
    permissions?: {
        canEditClients: boolean;
        canCreateRoutines: boolean;
        canViewPayments: boolean;
        canManageStaff: boolean;
    };
}

export interface GymCoachPermissions {
    canEditClients: boolean;
    canCreateRoutines: boolean;
    canViewPayments: boolean;
    canManageStaff: boolean;
}

// Default permissions by role
export const DEFAULT_PERMISSIONS: Record<GymCoachRole, GymCoachPermissions> = {
    owner: {
        canEditClients: true,
        canCreateRoutines: true,
        canViewPayments: true,
        canManageStaff: true
    },
    trainer: {
        canEditClients: true,
        canCreateRoutines: true,
        canViewPayments: false,
        canManageStaff: false
    },
    receptionist: {
        canEditClients: true,
        canCreateRoutines: false,
        canViewPayments: true,
        canManageStaff: false
    }
};
