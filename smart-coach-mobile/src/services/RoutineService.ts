import {
    collection,
    addDoc,
    deleteDoc,
    getDocs,
    getDoc,
    doc,
    query,
    orderBy,
    where,
    serverTimestamp,
    writeBatch,
    updateDoc
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    Routine,
    TrainingDay,
    CreateRoutineData,
    RoutineWithDays
} from '../types/Routine';

class RoutineService {

    /**
     * Get all routines for a coach
     */
    async getAllRoutines(coachId: string): Promise<Routine[]> {
        const routinesRef = collection(db, 'coaches', coachId, 'routines');
        const q = query(routinesRef, orderBy('createdAt', 'desc'));

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                startDate: data.startDate?.toDate(),
                endDate: data.endDate?.toDate(),
                createdAt: data.createdAt?.toDate(),
                updatedAt: data.updatedAt?.toDate()
            } as Routine;
        });
    }

    /**
     * Get routines for a specific client
     */
    async getClientRoutines(coachId: string, clientId: string): Promise<Routine[]> {
        // In most NoSQL structures, we can query the top-level collection filtering by field
        // If we strictly follow Angular's pattern, we might filter client-side or use a compound query
        // Angular app filters client-side in getClientRoutines (getting all then filtering)
        // We will do a query here for efficiency if index exists, otherwise catch error

        try {
            const routinesRef = collection(db, 'coaches', coachId, 'routines');
            // Requires index: clientId ASC, createdAt DESC. If not exists, might fail nicely or we filter manually
            const q = query(
                routinesRef,
                where('clientId', '==', clientId),
                orderBy('createdAt', 'desc')
            );

            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    startDate: data.startDate?.toDate(),
                    endDate: data.endDate?.toDate(),
                    createdAt: data.createdAt?.toDate(),
                    updatedAt: data.updatedAt?.toDate()
                } as Routine;
            });
        } catch (error: any) {
            // Fallback if index is missing: Fetch all and filter
            if (error.code === 'failed-precondition' || error.message.includes('index')) {
                console.warn('Missing index for client routines, filtering client-side');
                const all = await this.getAllRoutines(coachId);
                return all.filter(r => r.clientId === clientId);
            }
            throw error;
        }
    }

    /**
     * Get a single routine with all its days
     */
    async getRoutineWithDays(coachId: string, routineId: string): Promise<RoutineWithDays | null> {
        // 1. Get Routine
        const routineRef = doc(db, 'coaches', coachId, 'routines', routineId);
        const routineSnap = await getDoc(routineRef);

        if (!routineSnap.exists()) return null;

        const routineData = routineSnap.data();
        const routine = {
            id: routineSnap.id,
            ...routineData,
            startDate: routineData.startDate?.toDate(),
            endDate: routineData.endDate?.toDate(),
            createdAt: routineData.createdAt?.toDate(),
            updatedAt: routineData.updatedAt?.toDate()
        } as Routine;

        // 2. Get Days
        const daysRef = collection(db, 'coaches', coachId, 'routines', routineId, 'days');
        const qDays = query(daysRef, orderBy('dayNumber', 'asc'));
        const daysSnap = await getDocs(qDays);

        const days = daysSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as TrainingDay[];

        return {
            ...routine,
            days
        };
    }

    /**
     * Create a new routine (Basic Info Only for Phase 1)
     */
    async createRoutine(
        coachId: string,
        data: CreateRoutineData,
        // Phase 2 will accept days here
        days: Omit<TrainingDay, 'id' | 'routineId'>[] = []
    ): Promise<string> {
        const routinesRef = collection(db, 'coaches', coachId, 'routines');

        const routineData = {
            ...data,
            coachId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(routinesRef, routineData);
        const routineId = docRef.id;

        // Add Days if any
        if (days.length > 0) {
            const batch = writeBatch(db);
            const daysRef = collection(db, 'coaches', coachId, 'routines', routineId, 'days');

            days.forEach(day => {
                const newDayRef = doc(daysRef); // auto-id
                batch.set(newDayRef, {
                    ...day,
                    routineId: routineId
                });
            });
            await batch.commit();
        }

        return routineId;
    }

    /**
     * Update an existing routine and its days.
     * This implementation replaces all days with the new set.
     */
    async updateRoutine(
        coachId: string,
        routineId: string,
        data: Partial<CreateRoutineData>,
        days: Omit<TrainingDay, 'id' | 'routineId'>[]
    ): Promise<void> {
        const batch = writeBatch(db);

        // 1. Update Routine Document
        const routineRef = doc(db, 'coaches', coachId, 'routines', routineId);
        batch.update(routineRef, {
            ...data,
            updatedAt: serverTimestamp()
        });

        // 2. Delete existing days
        const daysRef = collection(db, 'coaches', coachId, 'routines', routineId, 'days');
        const existingDaysSnap = await getDocs(daysRef);
        existingDaysSnap.forEach(d => {
            batch.delete(d.ref);
        });

        // 3. Create new days
        days.forEach(day => {
            const newDayRef = doc(daysRef); // auto-id
            batch.set(newDayRef, {
                ...day,
                routineId: routineId
            });
        });

        await batch.commit();
    }

    /**
     * Delete a routine and its days
     */
    async deleteRoutine(coachId: string, routineId: string): Promise<void> {
        // 1. Delete days (subcollection)
        // Note: Client-side usually can't delete collection, must delete docs one by one
        const daysRef = collection(db, 'coaches', coachId, 'routines', routineId, 'days');
        const daysSnap = await getDocs(daysRef);

        const batch = writeBatch(db);
        daysSnap.docs.forEach(d => {
            batch.delete(d.ref);
        });

        // 2. Delete Routine
        const routineRef = doc(db, 'coaches', coachId, 'routines', routineId);
        batch.delete(routineRef);

        await batch.commit();
    }
}

export const routineService = new RoutineService();
