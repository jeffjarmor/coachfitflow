export interface PlanAccessSnapshot {
  accountType: string;
  coachPlan: string;
  nextPlanPaymentDate?: string | null;
}

export function localCalendarDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isPaidPlanCurrent(paymentDate: string | null | undefined, today = new Date()): boolean {
  const day = paymentDate?.slice(0, 10) ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day
    && day >= localCalendarDate(today);
}

export function hasActiveIndependentPro(profile: PlanAccessSnapshot): boolean {
  return profile.accountType === 'independent' &&
    profile.coachPlan === 'paid' &&
    isPaidPlanCurrent(profile.nextPlanPaymentDate);
}
