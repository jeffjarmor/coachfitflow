export interface Client {
    id: string;
    coachId: string;
    name: string;
    email: string;
    phone?: string;
    birthDate?: Date;
    notes?: string;
    age: number;
    weight: number; // kg
    height: number; // cm
    goal: string;

    // Gym fields (optional for independent coaches)
    nextPaymentDueDate?: Date;
    subscriptionStatus?: 'active' | 'inactive' | 'pending' | 'overdue';
    address?: string;

    createdAt: Date;
    updatedAt?: Date;
}

export interface CreateClientData {
    name: string;
    email: string;
    age: number;
    weight: number;
    height: number;
    goal: string;
    phone?: string;
    birthDate?: Date;
    notes?: string;
    address?: string;
    nextPaymentDueDate?: Date;
    subscriptionStatus?: 'active' | 'inactive' | 'pending' | 'overdue';
}

export interface UpdateClientData {
    name?: string;
    email?: string;
    age?: number;
    weight?: number;
    height?: number;
    goal?: string;
    phone?: string;
    birthDate?: Date;
    notes?: string;
    address?: string;
    nextPaymentDueDate?: Date;
    subscriptionStatus?: 'active' | 'inactive' | 'pending' | 'overdue';
}
