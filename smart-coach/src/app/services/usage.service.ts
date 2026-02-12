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
    limit,
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

            // Note: We need a collectionGroup query to find all routines across all coaches
            // This might require a composite index in Firestore if combined with orderBy/where on other fields.
            // But let's start with a basic count if we can or fetch them all and filter in memory if volume is low.
            const routinesRef = collectionGroup(this.firestore, 'routines');
            const q = query(
                routinesRef,
                where('createdAt', '>=', Timestamp.fromDate(cutoff))
            );

            const snapshot = await getDocs(q);
            return {
                total: snapshot.size,
                routines: snapshot.docs.map(doc => doc.data() as Routine)
            };
        } catch (error) {
            console.error('Error fetching routine stats:', error);
            return { total: 0, routines: [] };
        }
    }
}
