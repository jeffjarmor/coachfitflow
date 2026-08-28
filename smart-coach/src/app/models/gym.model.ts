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

export const GYM_LOGO_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export const GYM_LOGO_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function isSupportedGymLogoFile(file: Pick<File, 'name' | 'type'>): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const hasAllowedExtension = extension === 'jpg' || extension === 'jpeg' || extension === 'png';
    const hasAllowedMimeType = GYM_LOGO_ALLOWED_MIME_TYPES.includes(
        file.type.toLowerCase() as (typeof GYM_LOGO_ALLOWED_MIME_TYPES)[number]
    );

    return hasAllowedExtension && hasAllowedMimeType;
}
