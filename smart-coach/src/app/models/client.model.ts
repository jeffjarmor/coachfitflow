// Client model definition
export interface Client {
    id: string;
    coachId: string;
    name: string;
    email: string;
    phone?: string;
    birthDate?: Date;
    notes?: string;
    age: number;
    weight: number; // in kg
    height: number; // in cm
    goal: string;

    // Gym Fields
    nextPaymentDueDate?: Date | any; // Allow Date or Timestamp
    subscriptionStatus?: 'active' | 'inactive' | 'pending' | 'overdue';
    address?: string; // Add address field

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
    address?: string; // Add address field
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
    address?: string; // Add address field
    nextPaymentDueDate?: Date;
    subscriptionStatus?: 'active' | 'inactive' | 'pending' | 'overdue';
}
