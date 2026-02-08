import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    DocumentData
} from '@angular/fire/firestore';
import {
    Payment,
    CreatePaymentData,
    UpdatePaymentData,
    PaymentStats,
    PaymentStatus
} from '../models/payment.model';

@Injectable({
    providedIn: 'root'
})
export class PaymentService {
    private firestore = inject(Firestore);

    /**
     * Create a new payment
     */
    async createPayment(gymId: string, data: CreatePaymentData): Promise<Payment> {
        try {
            const paymentRef = doc(collection(this.firestore, `gyms/${gymId}/payments`));
            const paymentId = paymentRef.id;

            const payment: Payment = {
                id: paymentId,
                ...data,
                currency: data.currency || 'USD', // Default currency
                createdBy: data.createdBy || '',  // Default empty if missing
                status: 'pending',
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await setDoc(paymentRef, payment);
            return payment;
        } catch (error) {
            console.error('Error creating payment:', error);
            throw error;
        }
    }

    /**
     * Get all payments for a client
     */
    async getClientPayments(gymId: string, clientId: string): Promise<Payment[]> {
        try {
            const paymentsRef = collection(this.firestore, `gyms/${gymId}/payments`);
            const q = query(
                paymentsRef,
                where('clientId', '==', clientId),
                orderBy('dueDate', 'desc')
            );
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => doc.data() as Payment);
        } catch (error) {
            console.error('Error getting client payments:', error);
            throw error;
        }
    }

    /**
     * Get all payments for a gym
     */
    async getAllPayments(gymId: string): Promise<Payment[]> {
        try {
            const paymentsRef = collection(this.firestore, `gyms/${gymId}/payments`);
            const q = query(paymentsRef, orderBy('dueDate', 'desc'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => doc.data() as Payment);
        } catch (error) {
            console.error('Error getting all payments:', error);
            throw error;
        }
    }

    /**
     * Get overdue payments
     */
    async getOverduePayments(gymId: string): Promise<Payment[]> {
        try {
            const paymentsRef = collection(this.firestore, `gyms/${gymId}/payments`);
            const q = query(paymentsRef, where('status', '==', 'overdue'));
            const snapshot = await getDocs(q);

            return snapshot.docs.map(doc => doc.data() as Payment);
        } catch (error) {
            console.error('Error getting overdue payments:', error);
            throw error;
        }
    }

    /**
     * Mark payment as paid
     */
    async markPaymentAsPaid(gymId: string, paymentId: string): Promise<void> {
        try {
            const paymentRef = doc(this.firestore, `gyms/${gymId}/payments/${paymentId}`);
            await updateDoc(paymentRef, {
                status: 'paid',
                paidDate: new Date(),
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error marking payment as paid:', error);
            throw error;
        }
    }

    /**
     * Update payment
     */
    async updatePayment(gymId: string, paymentId: string, data: UpdatePaymentData): Promise<void> {
        try {
            const paymentRef = doc(this.firestore, `gyms/${gymId}/payments/${paymentId}`);
            await updateDoc(paymentRef, {
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating payment:', error);
            throw error;
        }
    }

    /**
     * Delete payment
     */
    async deletePayment(gymId: string, paymentId: string): Promise<void> {
        try {
            const paymentRef = doc(this.firestore, `gyms/${gymId}/payments/${paymentId}`);
            await deleteDoc(paymentRef);
        } catch (error) {
            console.error('Error deleting payment:', error);
            throw error;
        }
    }

    /**
     * Get payment statistics
     */
    async getPaymentStats(gymId: string): Promise<PaymentStats> {
        try {
            const payments = await this.getAllPayments(gymId);

            const stats: PaymentStats = {
                totalPending: 0,
                totalPaid: 0,
                totalOverdue: 0,
                pendingAmount: 0,
                paidAmount: 0,
                overdueAmount: 0
            };

            payments.forEach(payment => {
                switch (payment.status) {
                    case 'pending':
                        stats.totalPending++;
                        stats.pendingAmount += payment.amount;
                        break;
                    case 'paid':
                        stats.totalPaid++;
                        stats.paidAmount += payment.amount;
                        break;
                    case 'overdue':
                        stats.totalOverdue++;
                        stats.overdueAmount += payment.amount;
                        break;
                }
            });

            return stats;
        } catch (error) {
            console.error('Error getting payment stats:', error);
            throw error;
        }
    }

    /**
     * Check and update overdue payments (should be run periodically)
     */
    async updateOverduePayments(gymId: string): Promise<void> {
        try {
            const paymentsRef = collection(this.firestore, `gyms/${gymId}/payments`);
            const q = query(paymentsRef, where('status', '==', 'pending'));
            const snapshot = await getDocs(q);

            const now = new Date();
            const updatePromises: Promise<void>[] = [];

            snapshot.docs.forEach(docSnap => {
                const payment = docSnap.data() as Payment;
                const dueDate = payment.dueDate instanceof Date
                    ? payment.dueDate
                    : new Date(payment.dueDate);

                if (dueDate < now) {
                    const paymentRef = doc(this.firestore, `gyms/${gymId}/payments/${payment.id}`);
                    updatePromises.push(
                        updateDoc(paymentRef, {
                            status: 'overdue',
                            updatedAt: new Date()
                        })
                    );
                }
            });

            await Promise.all(updatePromises);
        } catch (error) {
            console.error('Error updating overdue payments:', error);
            throw error;
        }
    }

    /**
     * Register a payment and update client subscription status
     */
    async registerPayment(gymId: string, data: CreatePaymentData): Promise<Payment> {
        try {
            // 1. Create Payment Record
            const payment = await this.createPayment(gymId, data);

            // 2. Update Client's Next Payment Date
            const clientRef = doc(this.firestore, `gyms/${gymId}/clients/${data.clientId}`);
            const clientSnap = await getDoc(clientRef);

            if (clientSnap.exists()) {
                const clientData = clientSnap.data();
                // Check if nextPaymentDueDate exists, otherwise default to now
                const nextPaymentDueTimestamp = clientData['nextPaymentDueDate'];
                let currentDueDate = new Date();

                if (nextPaymentDueTimestamp) {
                    if (typeof nextPaymentDueTimestamp.toDate === 'function') {
                        currentDueDate = nextPaymentDueTimestamp.toDate();
                    } else {
                        currentDueDate = new Date(nextPaymentDueTimestamp);
                    }
                }

                let nextDate = new Date(currentDueDate);

                // If it was overdue (older than today), start from today. If not, extend from current due date.
                if (nextDate < new Date()) {
                    nextDate = new Date();
                }

                // Add 1 month
                nextDate.setMonth(nextDate.getMonth() + 1);

                await updateDoc(clientRef, {
                    nextPaymentDueDate: nextDate,
                    subscriptionStatus: 'active',
                    updatedAt: new Date()
                });
            }

            return payment;
        } catch (error) {
            console.error('Error registering payment:', error);
            throw error;
        }
    }
}
