export interface MembershipPlan {
    id: string;
    gymId: string;
    name: string;
    price: number;
    currency?: string;
    active: boolean;
    description?: string;
    createdAt: Date;
    updatedAt?: Date;
}

export interface CreateMembershipPlanData {
    name: string;
    price: number;
    currency?: string;
    active?: boolean;
    description?: string;
}

export interface UpdateMembershipPlanData {
    name?: string;
    price?: number;
    currency?: string;
    active?: boolean;
    description?: string;
}
