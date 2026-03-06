import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    orderBy,
    updateDoc
} from '@angular/fire/firestore';
import { GymClientProfile } from '../models/gym-client.model';
import { Client } from '../models/client.model';
import { Routine } from '../models/routine.model';
import { Measurement } from '../models/measurement.model';
import { Payment } from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class GymClientService {
    private firestore = inject(Firestore);

    /**
     * Fetch the gymClients/{uid} profile document.
     * Returns null if the uid does not belong to a gym client.
     */
    async getClientProfile(uid: string): Promise<GymClientProfile | null> {
        try {
            const ref = doc(this.firestore, `gymClients/${uid}`);
            const snap = await getDoc(ref);
            if (!snap.exists()) return null;
            return snap.data() as GymClientProfile;
        } catch {
            return null;
        }
    }

    /**
     * Get the client's own record from the gym clients subcollection.
     */
    async getMyClientData(gymId: string, clientId: string): Promise<Client | null> {
        try {
            const ref = doc(this.firestore, `gyms/${gymId}/clients/${clientId}`);
            const snap = await getDoc(ref);
            if (!snap.exists()) return null;
            return snap.data() as Client;
        } catch (error) {
            console.error('GymClientService.getMyClientData:', error);
            return null;
        }
    }

    /**
     * Update the client's own record (e.g. from the client profile page).
     */
    async updateMyClientData(gymId: string, clientId: string, data: Partial<Client>): Promise<void> {
        try {
            const ref = doc(this.firestore, `gyms/${gymId}/clients/${clientId}`);
            // Use updateDoc instead of setDoc to preserve existing fields not in 'data'
            await updateDoc(ref, {
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('GymClientService.updateMyClientData:', error);
            throw error;
        }
    }

    /**
     * Get all routines assigned to the client in this gym.
     */
    async getMyRoutines(gymId: string, clientId: string): Promise<Array<{ id: string; routine: Routine }>> {
        try {
            const q = query(
                collection(this.firestore, `gyms/${gymId}/routines`),
                where('clientId', '==', clientId)
            );
            const snap = await getDocs(q);
            const routines = snap.docs.map(d => ({ id: d.id, routine: d.data() as Routine }));
            // Sort newest first in memory (avoid composite index)
            return routines.sort((a, b) => {
                const tA = a.routine.createdAt ? new Date(a.routine.createdAt).getTime() : 0;
                const tB = b.routine.createdAt ? new Date(b.routine.createdAt).getTime() : 0;
                return tB - tA;
            });
        } catch (error) {
            console.error('GymClientService.getMyRoutines:', error);
            return [];
        }
    }

    /**
     * Get measurements for this client, newest first.
     */
    async getMyMeasurements(gymId: string, clientId: string): Promise<Measurement[]> {
        try {
            const ref = collection(this.firestore, `gyms/${gymId}/clients/${clientId}/measurements`);
            const snap = await getDocs(ref);
            const items = snap.docs.map(d => d.data() as Measurement);
            return items.sort((a, b) => {
                const tA = a.date ? new Date(a.date as any).getTime() : 0;
                const tB = b.date ? new Date(b.date as any).getTime() : 0;
                return tB - tA;
            });
        } catch (error) {
            console.error('GymClientService.getMyMeasurements:', error);
            return [];
        }
    }

    /**
     * Get all payments for this client in the gym.
     */
    async getMyPayments(gymId: string, clientId: string): Promise<Payment[]> {
        try {
            const q = query(
                collection(this.firestore, `gyms/${gymId}/payments`),
                where('clientId', '==', clientId)
            );
            const snap = await getDocs(q);
            const items = snap.docs.map(d => d.data() as Payment);
            return items.sort((a, b) => {
                const tA = a.dueDate ? new Date(a.dueDate as any).getTime() : 0;
                const tB = b.dueDate ? new Date(b.dueDate as any).getTime() : 0;
                return tB - tA;
            });
        } catch (error) {
            console.error('GymClientService.getMyPayments:', error);
            return [];
        }
    }

    /**
     * Get a single routine with its training days.
     */
    async getMyRoutineDetail(gymId: string, routineId: string): Promise<{ routine: Routine | null; days: any[] }> {
        try {
            const routineRef = doc(this.firestore, `gyms/${gymId}/routines/${routineId}`);
            const routineSnap = await getDoc(routineRef);
            if (!routineSnap.exists()) return { routine: null, days: [] };

            const daysRef = collection(this.firestore, `gyms/${gymId}/routines/${routineId}/days`);
            const daysSnap = await getDocs(daysRef);
            const days = daysSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            return { routine: routineSnap.data() as Routine, days };
        } catch (error) {
            console.error('GymClientService.getMyRoutineDetail:', error);
            return { routine: null, days: [] };
        }
    }
}
