export type ClientPortalScope = 'gym' | 'independent';

export interface GymClientProfile {
    uid: string;
    scope: ClientPortalScope;
    clientId: string;
    gymId?: string | null;
    coachId?: string | null;
    gymName?: string;
    coachName?: string;
    displayName: string;
    rirEnabled: boolean;
    createdAt: Date;
}
