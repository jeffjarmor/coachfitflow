export type ClientPortalScope = 'gym' | 'independent';
export type ClientPortalCoachSubscriptionStatus = 'not_applicable' | 'active' | 'pending' | 'inactive';

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
    coachSubscriptionStatus: ClientPortalCoachSubscriptionStatus;
    portalAccessBlocked: boolean;
    portalAccessMessage?: string | null;
    createdAt: Date;
}
