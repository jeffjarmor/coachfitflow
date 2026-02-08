export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface Payment {
    id: string;
    clientId: string;
    clientName?: string;  // Denormalized for quick display
    amount: number;
    currency: string;     // e.g., 'USD', 'MXN', 'EUR'
    method?: string;      // 'cash', 'card', 'transfer', etc.
    dueDate: Date;
    paidDate?: Date;
    status: PaymentStatus;
    notes?: string;
    createdBy: string;    // Coach ID who created the payment
    createdAt: Date;
    updatedAt?: Date;
}

export interface CreatePaymentData {
    clientId: string;
    amount: number;
    currency?: string; // Optional, default to system currency
    method?: string;
    dueDate: Date;
    notes?: string;
    createdBy?: string; // Optional if inferred
}

export interface UpdatePaymentData {
    amount?: number;
    dueDate?: Date;
    paidDate?: Date;
    status?: PaymentStatus;
    notes?: string;
}

// Payment statistics for dashboard
export interface PaymentStats {
    totalPending: number;
    totalPaid: number;
    totalOverdue: number;
    pendingAmount: number;
    paidAmount: number;
    overdueAmount: number;
}
