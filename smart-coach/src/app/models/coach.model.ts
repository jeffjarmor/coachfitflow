export type CoachPlan = 'standard' | 'paid';

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
    coachPlan?: CoachPlan; // only applies to independent coaches
    nextPlanPaymentDate?: Date | string | null;
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
    coachPlan?: CoachPlan;
    nextPlanPaymentDate?: Date | string | null;
}

export function getCoachAccountType(coach: Pick<Coach, 'accountType'> | null | undefined): 'independent' | 'gym' {
    return coach?.accountType || 'independent';
}

export function getCoachPlan(coach: Pick<Coach, 'coachPlan'> | null | undefined): CoachPlan {
    return coach?.coachPlan || 'standard';
}

export function isIndependentCoach(coach: Pick<Coach, 'accountType'> | null | undefined): boolean {
    return getCoachAccountType(coach) === 'independent';
}

export function isPaidIndependentCoach(
    coach: Pick<Coach, 'accountType' | 'coachPlan'> | null | undefined
): boolean {
    return isIndependentCoach(coach) && getCoachPlan(coach) === 'paid';
}
