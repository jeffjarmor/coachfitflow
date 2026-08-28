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

export function hasGymOwnerAccess(
    gym: { ownerId?: string | null } | null | undefined,
    member: Pick<GymCoach, 'coachId' | 'role'> | null | undefined,
    coachId: string | null | undefined
): boolean {
    if (!coachId) return false;
    return gym?.ownerId === coachId
        || (member?.coachId === coachId && member.role === 'owner');
}

export function isPrimaryGymOwner(
    gym: { ownerId?: string | null } | null | undefined,
    coachId: string | null | undefined
): boolean {
    return !!coachId && gym?.ownerId === coachId;
}
