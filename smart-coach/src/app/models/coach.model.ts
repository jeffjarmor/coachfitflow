export interface Coach {
    id: string;
    email: string;
    name: string;
    phone?: string;
    logoUrl?: string;
    brandColor?: string;
    role: 'admin' | 'coach' | 'owner';
    createdAt: Date;
    updatedAt?: Date;

    // GYM MULTI-TENANCY FIELDS (backward compatible - optional)
    gymId?: string | null;           // null/undefined for independent coaches
    accountType?: 'independent' | 'gym';  // defaults to 'independent' if not set
}

export interface CreateCoachData {
    email: string;
    name: string;
    phone?: string;
}

export interface UpdateCoachData {
    name?: string;
    email?: string;
    phone?: string;
    logoUrl?: string;
    brandColor?: string;
}
