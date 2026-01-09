import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionGroup, getDocs, doc, getDoc, query, where, orderBy, updateDoc, setDoc } from '@angular/fire/firestore';
import { Client } from '../models/client.model';
import { Coach } from '../models/coach.model';
import { Routine } from '../models/routine.model';

export interface ClientWithCoach {
    client: Client;
    clientId: string;
    coach: Coach;
    coachId: string;
    routinesCount: number;
}

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private firestore = inject(Firestore);

    /**
     * Get all clients across all coaches
     * Fetches all coaches first, then gets clients for each coach
     */
    async getAllClients(): Promise<ClientWithCoach[]> {
        try {
            const clientsWithCoach: ClientWithCoach[] = [];

            // First, get all coaches
            const coachesSnapshot = await getDocs(collection(this.firestore, 'coaches'));

            // For each coach, get their clients
            for (const coachDoc of coachesSnapshot.docs) {
                const coachId = coachDoc.id;
                const coachData = coachDoc.data() as Coach;

                // Get clients for this coach
                const clientsSnapshot = await getDocs(
                    collection(this.firestore, `coaches/${coachId}/clients`)
                );

                // For each client, count their routines
                for (const clientDoc of clientsSnapshot.docs) {
                    const clientId = clientDoc.id;
                    const clientData = clientDoc.data() as Client;

                    // Count routines for this client
                    const routinesQuery = query(
                        collection(this.firestore, `coaches/${coachId}/routines`),
                        where('clientId', '==', clientId)
                    );
                    const routinesSnapshot = await getDocs(routinesQuery);

                    clientsWithCoach.push({
                        client: clientData,
                        clientId,
                        coach: coachData,
                        coachId,
                        routinesCount: routinesSnapshot.size
                    });
                }
            }

            // Sort by client name
            return clientsWithCoach.sort((a, b) =>
                a.client.name.localeCompare(b.client.name)
            );
        } catch (error) {
            console.error('Error fetching all clients:', error);
            throw error;
        }
    }

    /**
     * Get all coaches
     */
    async getAllCoaches(): Promise<Array<{ id: string; coach: Coach }>> {
        try {
            const coachesSnapshot = await getDocs(collection(this.firestore, 'coaches'));
            return coachesSnapshot.docs.map(doc => ({
                id: doc.id,
                coach: doc.data() as Coach
            }));
        } catch (error) {
            console.error('Error fetching all coaches:', error);
            throw error;
        }
    }

    /**
     * Get a specific client with coach info
     */
    async getClientWithCoach(coachId: string, clientId: string): Promise<ClientWithCoach | null> {
        try {
            const clientDoc = await getDoc(doc(this.firestore, `coaches/${coachId}/clients/${clientId}`));
            const coachDoc = await getDoc(doc(this.firestore, `coaches/${coachId}`));

            if (!clientDoc.exists() || !coachDoc.exists()) {
                return null;
            }

            // Count routines
            const routinesQuery = query(
                collection(this.firestore, `coaches/${coachId}/routines`),
                where('clientId', '==', clientId)
            );
            const routinesSnapshot = await getDocs(routinesQuery);

            return {
                client: clientDoc.data() as Client,
                clientId: clientDoc.id,
                coach: coachDoc.data() as Coach,
                coachId,
                routinesCount: routinesSnapshot.size
            };
        } catch (error) {
            console.error('Error fetching client with coach:', error);
            throw error;
        }
    }

    /**
     * Get all routines for a specific client
     */
    async getClientRoutines(coachId: string, clientId: string): Promise<Array<{ id: string; routine: Routine }>> {
        try {
            const routinesQuery = query(
                collection(this.firestore, `coaches/${coachId}/routines`),
                where('clientId', '==', clientId)
            );
            const routinesSnapshot = await getDocs(routinesQuery);

            const routines = routinesSnapshot.docs.map(doc => ({
                id: doc.id,
                routine: doc.data() as Routine
            }));

            // Sort in memory to avoid composite index requirement
            return routines.sort((a, b) => {
                const dateA = a.routine.createdAt ? new Date(a.routine.createdAt).getTime() : 0;
                const dateB = b.routine.createdAt ? new Date(b.routine.createdAt).getTime() : 0;
                return dateB - dateA;
            });
        } catch (error) {
            console.error('Error fetching client routines:', error);
            throw error;
        }
    }

    /**
     * Update client data as admin
     */
    async updateClientData(coachId: string, clientId: string, data: Partial<Client>): Promise<void> {
        try {
            const clientRef = doc(this.firestore, `coaches/${coachId}/clients/${clientId}`);
            await updateDoc(clientRef, data);
            console.log('Update client data:', { coachId, clientId, data });
        } catch (error) {
            console.error('Error updating client data:', error);
            throw error;
        }
    }
    /**
     * Clone a client to another coach
     */
    async cloneClient(sourceCoachId: string, clientId: string, targetCoachId: string): Promise<void> {
        try {
            // 1. Get source client data
            const clientDoc = await getDoc(doc(this.firestore, `coaches/${sourceCoachId}/clients/${clientId}`));
            if (!clientDoc.exists()) {
                throw new Error('Client not found');
            }
            const clientData = clientDoc.data() as Client;

            // 2. Create new client for target coach
            // We use a new ID for the client to avoid any potential conflicts, 
            // although using the same ID is also possible if we want to track "same person" across coaches.
            // For safety and clean separation, let's generate a new ID by using addDoc-like behavior (doc() without path)
            // BUT the user guide I wrote suggested keeping IDs. Let's try to keep the ID if possible, 
            // but if it already exists in target, we might overwrite. 
            // To be safe and simple for this "Clone" feature, let's generate a NEW ID for the cloned client.
            // This avoids overwriting if the target coach already has a client with that ID (unlikely but possible).

            const newClientRef = doc(collection(this.firestore, `coaches/${targetCoachId}/clients`));
            const newClientId = newClientRef.id;

            const newClientData: Client = {
                ...clientData,
                id: newClientId,
                coachId: targetCoachId,
                createdAt: new Date(), // Reset creation date or keep original? Let's reset to indicate when it was added to this coach
                updatedAt: new Date()
            };

            await setDoc(newClientRef, newClientData);

            // 3. Copy Measurements
            const measurementsSnapshot = await getDocs(
                collection(this.firestore, `coaches/${sourceCoachId}/clients/${clientId}/measurements`)
            );

            for (const mDoc of measurementsSnapshot.docs) {
                const mData = mDoc.data();
                const newMRef = doc(collection(this.firestore, `coaches/${targetCoachId}/clients/${newClientId}/measurements`));
                await setDoc(newMRef, {
                    ...mData,
                    id: newMRef.id,
                    clientId: newClientId
                });
            }

            // 4. Copy Routines
            const routinesQuery = query(
                collection(this.firestore, `coaches/${sourceCoachId}/routines`),
                where('clientId', '==', clientId)
            );
            const routinesSnapshot = await getDocs(routinesQuery);

            for (const rDoc of routinesSnapshot.docs) {
                const rData = rDoc.data() as Routine;
                const newRoutineRef = doc(collection(this.firestore, `coaches/${targetCoachId}/routines`));
                const newRoutineId = newRoutineRef.id;

                await setDoc(newRoutineRef, {
                    ...rData,
                    id: newRoutineId,
                    coachId: targetCoachId,
                    clientId: newClientId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                // 5. Copy Training Days for this routine
                const daysSnapshot = await getDocs(
                    collection(this.firestore, `coaches/${sourceCoachId}/routines/${rDoc.id}/days`)
                );

                for (const dDoc of daysSnapshot.docs) {
                    const dData = dDoc.data();
                    const newDayRef = doc(collection(this.firestore, `coaches/${targetCoachId}/routines/${newRoutineId}/days`));
                    await setDoc(newDayRef, {
                        ...dData,
                        id: newDayRef.id,
                        routineId: newRoutineId
                    });
                }
            }

        } catch (error) {
            console.error('Error cloning client:', error);
            throw error;
        }
    }
}
