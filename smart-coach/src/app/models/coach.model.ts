export type CoachPlan = 'standard' | 'paid';
export type PaidCoachAccessStatus = 'standard' | 'active' | 'pending';
export const DEFAULT_COACH_LOGO_URL = '/assets/brand/coach-fitflow-icon-dark-square.svg';
export const DEFAULT_COACH_BRAND_COLOR = '#000000';
export const INDEPENDENT_CLIENT_PORTAL_BLOCKED_MESSAGE =
    'Suscripción de entrenador pendiente. Cuando el entrenador renueve su pago podrás volver a ingresar.';
export const PRO_PLAN_UPSELL_MESSAGE =
    'Para usar esta función debes activar la suscripción Pro.';

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

export function parseCoachPlanPaymentDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;

    if (value instanceof Date) {
        if (isNaN(value.getTime())) return null;
        const normalized = new Date(value);
        normalized.setHours(0, 0, 0, 0);
        return normalized;
    }

    const parsed = new Date(`${value}T00:00:00`);
    if (isNaN(parsed.getTime())) return null;

    parsed.setHours(0, 0, 0, 0);
    return parsed;
}

export function getPaidIndependentCoachAccessStatus(
    coach: Pick<Coach, 'accountType' | 'coachPlan' | 'nextPlanPaymentDate'> | null | undefined,
    referenceDate: Date = new Date()
): PaidCoachAccessStatus {
    if (!isPaidIndependentCoach(coach)) {
        return 'standard';
    }

    const nextPaymentDate = parseCoachPlanPaymentDate(coach?.nextPlanPaymentDate);
    if (!nextPaymentDate) {
        return 'pending';
    }

    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);

    return nextPaymentDate.getTime() >= today.getTime() ? 'active' : 'pending';
}

export function hasActivePaidIndependentCoachAccess(
    coach: Pick<Coach, 'accountType' | 'coachPlan' | 'nextPlanPaymentDate'> | null | undefined,
    referenceDate?: Date
): boolean {
    return getPaidIndependentCoachAccessStatus(coach, referenceDate) === 'active';
}

export function isIndependentCoachPaymentPending(
    coach: Pick<Coach, 'accountType' | 'coachPlan' | 'nextPlanPaymentDate'> | null | undefined,
    referenceDate?: Date
): boolean {
    return getPaidIndependentCoachAccessStatus(coach, referenceDate) === 'pending';
}
