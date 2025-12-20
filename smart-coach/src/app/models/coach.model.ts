export interface Coach {
    id: string;
    email: string;
    name: string;
    phone?: string;
    logoUrl?: string;
    brandColor?: string;
    role: 'admin' | 'coach';
    createdAt: Date;
    updatedAt?: Date;
}

export interface CreateCoachData {
    email: string;
    name: string;
    phone?: string;
}

export interface UpdateCoachData {
    name?: string;
    phone?: string;
    logoUrl?: string;
    brandColor?: string;
}
