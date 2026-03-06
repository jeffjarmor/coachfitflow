import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    addDoc,
    query,
    getDocs,
    where,
    Timestamp,
    orderBy,
    collectionGroup
} from '@angular/fire/firestore';
import { Routine } from '../models/routine.model';

@Injectable({
    providedIn: 'root'
})
export class UsageService {
    private firestore = inject(Firestore);

    /**
     * Log a user login event
     */
    async logLogin(userId: string, role: string): Promise<void> {
        try {
            const loginRef = collection(this.firestore, 'activity_logins');
            await addDoc(loginRef, {
                userId,
                role,
                timestamp: Timestamp.now()
            });
            console.log('Login activity logged for user:', userId);
        } catch (error) {
            console.error('Error logging login activity:', error);
        }
    }

    /**
     * Get login statistics for a period
     */
    async getLoginStats(days: number = 30): Promise<any> {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);

            const loginRef = collection(this.firestore, 'activity_logins');
            const q = query(
                loginRef,
                where('timestamp', '>=', Timestamp.fromDate(cutoff)),
                orderBy('timestamp', 'desc')
            );

            const snapshot = await getDocs(q);
            const logins = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return {
                total: logins.length,
                logins: logins
            };
        } catch (error) {
            console.error('Error fetching login stats:', error);
            return { total: 0, logins: [] };
        }
    }

    /**
     * Get routine creation statistics
     */
    async getRoutineCreationStats(days: number = 30): Promise<any> {
        try {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);

            // Fetch all routines and filter locally to avoid collection group index requirements
            // for createdAt in projects where that index isn't deployed yet.
            const snapshot = await getDocs(collectionGroup(this.firestore, 'routines'));
            const routines = snapshot.docs
                .map(doc => doc.data() as Routine)
                .filter(routine => {
                    const createdAt = (routine as any)?.createdAt;
                    if (!createdAt) return false;

                    if (createdAt instanceof Timestamp) {
                        return createdAt.toDate() >= cutoff;
                    }

                    if (createdAt?.seconds && typeof createdAt.seconds === 'number') {
                        return new Date(createdAt.seconds * 1000) >= cutoff;
                    }

                    return new Date(createdAt) >= cutoff;
                });

            return {
                total: routines.length,
                routines
            };
        } catch (error) {
            console.error('Error fetching routine stats:', error);
            return { total: 0, routines: [] };
        }
    }
}
