export interface Gym {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
    brandColor?: string;
    accessCode: string;  // PIN for gym staff to join
    ownerId?: string;     // Coach ID of gym owner/admin
    createdAt: Date;
    updatedAt?: Date;
}

export interface CreateGymData {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
    brandColor?: string;
    ownerId?: string;
}

export interface UpdateGymData {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
    brandColor?: string;
}
