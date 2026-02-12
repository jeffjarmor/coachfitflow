export interface Coach {
    id: string;
    email: string;
    name: string;
    phone?: string;
    role: 'coach' | 'admin' | 'owner';
    accountType?: 'independent' | 'gym';
    gymId?: string; // ID of the gym the coach belongs to (if any)
    photoUrl?: string;
    logoUrl?: string; // URL of the coach's logo
    brandColor?: string; // Hex color for branding
    createdAt: Date; // or { seconds: number; nanoseconds: number } if coming raw from Firestore, but we usually convert it
    updatedAt: Date;
}
