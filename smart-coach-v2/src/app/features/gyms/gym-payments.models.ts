export type GymPaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';
export type GymSubscriptionStatus = 'active' | 'inactive' | 'pending' | 'overdue';
export type GymBillingState = 'active' | 'due-soon' | 'overdue' | 'pending' | 'inactive';

export interface GymMembershipPlan {
  id: string;
  gymId: string;
  name: string;
  price: number;
  currency: string;
  active: boolean;
  description?: string | null;
}

export interface GymBillingMembership {
  id: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  planId?: string | null;
  planName?: string | null;
  planPrice?: number | null;
  currency: string;
  nextDueDate?: string | null;
  subscriptionStatus: GymSubscriptionStatus;
}

export interface GymPaymentRecord {
  planId?: string | null;
  id: string;
  membershipId: string;
  clientId: string;
  clientName: string;
  amount: number;
  currency: string;
  method?: string | null;
  dueDate: string;
  paidDate?: string | null;
  status: GymPaymentStatus;
  notes?: string | null;
  createdAt: string;
}

export interface GymPaymentsData {
  memberships: GymBillingMembership[];
  plans: GymMembershipPlan[];
  payments: GymPaymentRecord[];
}

export interface GymPlanInput {
  name: string;
  price: number;
  currency: string;
  active: boolean;
  description?: string | null;
}

export interface GymPaymentInput {
  amount: number;
  currency: string;
  method: string;
  paidDate: string;
  notes?: string | null;
}
