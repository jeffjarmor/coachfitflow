import {
    Coach,
    hasCoachPremiumFeatureAccess,
    isIndependentCoach
} from './coach.model';

export type AnnouncementAudience = 'all' | 'standard' | 'paid';

export interface CoachAnnouncement {
    id: string;
    title: string;
    message: string;
    audience: AnnouncementAudience;
    active: boolean;
    sortOrder: number;
    startsAt?: string | null;
    endsAt?: string | null;
    createdBy?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export function isAnnouncementActiveNow(
    announcement: Pick<CoachAnnouncement, 'active' | 'startsAt' | 'endsAt'>
): boolean {
    if (!announcement.active) return false;

    const now = new Date();
    const startsAt = announcement.startsAt ? new Date(announcement.startsAt) : null;
    const endsAt = announcement.endsAt ? new Date(announcement.endsAt) : null;

    if (startsAt && !isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) {
        return false;
    }

    if (endsAt && !isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime()) {
        return false;
    }

    return true;
}

export function isAnnouncementVisibleForCoach(
    announcement: CoachAnnouncement,
    coach: Coach | null | undefined
): boolean {
    if (!coach || !isAnnouncementActiveNow(announcement)) {
        return false;
    }

    if (announcement.audience === 'all') {
        return true;
    }

    const hasPaidAccess = hasCoachPremiumFeatureAccess(coach);
    if (announcement.audience === 'paid') {
        return hasPaidAccess;
    }

    return isIndependentCoach(coach) && !hasPaidAccess;
}

export function getAnnouncementAudienceLabel(audience: AnnouncementAudience): string {
    switch (audience) {
        case 'standard':
            return 'Entrenadores estándar';
        case 'paid':
            return 'Entrenadores Pro';
        default:
            return 'Todos';
    }
}
