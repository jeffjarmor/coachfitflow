import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionGroup, getDocs, doc, getDoc, deleteDoc, query, where, orderBy, updateDoc, setDoc } from '@angular/fire/firestore';
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
            console.time('getAllClients');
            const clientsWithCoach: ClientWithCoach[] = [];

            // Execute parallel queries for performance
            // 1. Get all coaches
            // 2. Get all clients (via collection group)
            // 3. Get all routines (via collection group) - needed for counting
            const [coachesSnapshot, clientsSnapshot, routinesSnapshot] = await Promise.all([
                getDocs(collection(this.firestore, 'coaches')),
                getDocs(collectionGroup(this.firestore, 'clients')),
                getDocs(query(collectionGroup(this.firestore, 'routines')))
            ]);

            // Create lookup maps
            const coachesMap = new Map<string, Coach>();
            coachesSnapshot.docs.forEach(doc => {
                coachesMap.set(doc.id, doc.data() as Coach);
            });

            // Count routines per client
            const routineCounts = new Map<string, number>();
            routinesSnapshot.docs.forEach(doc => {
                const data = doc.data() as Routine;
                const clientId = data.clientId;
                if (clientId) {
                    routineCounts.set(clientId, (routineCounts.get(clientId) || 0) + 1);
                }
            });

            // Assemble the result
            clientsSnapshot.docs.forEach(doc => {
                const clientData = doc.data() as Client;
                const clientId = doc.id;

                // IMPORTANT: In collectionGroup queries, we must ensure we are reading from the correct path hierarchy 
                // or rely on data fields. Assuming clientData.coachId is reliable.
                // If not, we could parse doc.ref.path

                const coachId = clientData.coachId;
                const coach = coachesMap.get(coachId);

                // Only include if we found the coach (consistency check)
                if (coach) {
                    clientsWithCoach.push({
                        client: clientData,
                        clientId,
                        coach,
                        coachId,
                        routinesCount: routineCounts.get(clientId) || 0
                    });
                }
            });

            // Sort by client name
            const result = clientsWithCoach.sort((a, b) =>
                a.client.name.localeCompare(b.client.name)
            );

            console.timeEnd('getAllClients');
            return result;
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

    /**
     * Delete a client and all their data (routines, measurements)
     */
    async deleteClient(coachId: string, clientId: string): Promise<void> {
        try {
            // 1. Delete all routines for this client
            const routinesQuery = query(
                collection(this.firestore, `coaches/${coachId}/routines`),
                where('clientId', '==', clientId)
            );
            const routinesSnapshot = await getDocs(routinesQuery);

            for (const routineDoc of routinesSnapshot.docs) {
                const routineId = routineDoc.id;

                // Delete training days for this routine
                const daysSnapshot = await getDocs(
                    collection(this.firestore, `coaches/${coachId}/routines/${routineId}/days`)
                );

                for (const dayDoc of daysSnapshot.docs) {
                    await deleteDoc(dayDoc.ref);
                }

                // Delete the routine
                await deleteDoc(routineDoc.ref);
            }

            // 2. Delete all measurements for this client
            const measurementsSnapshot = await getDocs(
                collection(this.firestore, `coaches/${coachId}/clients/${clientId}/measurements`)
            );

            for (const measurementDoc of measurementsSnapshot.docs) {
                await deleteDoc(measurementDoc.ref);
            }

            // 3. Delete the client document
            const clientRef = doc(this.firestore, `coaches/${coachId}/clients/${clientId}`);
            await deleteDoc(clientRef);

            console.log('Client deleted successfully:', { coachId, clientId });
        } catch (error) {
            console.error('Error deleting client:', error);
            throw error;
        }
    }

    /**
     * FULLY DELETE A GYM (Cascading)
     * Deletes: Gym Doc, Clients, Routines, Coaches Subcollection, Logo
     * Resets: Associated Coaches to independent
     */
    async deleteGymFully(gymId: string): Promise<void> {
        try {
            console.log('Starting full gym deletion:', gymId);

            // 1. Delete all GYM ROUTINES
            // We can delete them all directly since they are all inside this gym
            const routinesSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/routines`));
            for (const routineDoc of routinesSnapshot.docs) {
                // Delete days subcollection
                const daysSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/routines/${routineDoc.id}/days`));
                for (const day of daysSnapshot.docs) {
                    await deleteDoc(day.ref);
                }
                await deleteDoc(routineDoc.ref);
            }

            // 2. Delete all GYM CLIENTS
            const clientsSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/clients`));
            for (const clientDoc of clientsSnapshot.docs) {
                // Delete measurements
                const measurementsSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/clients/${clientDoc.id}/measurements`));
                for (const m of measurementsSnapshot.docs) {
                    await deleteDoc(m.ref);
                }
                await deleteDoc(clientDoc.ref);
            }

            // 2.5. Delete all GYM EXERCISES
            const exercisesSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/exercises`));
            for (const exerciseDoc of exercisesSnapshot.docs) {
                await deleteDoc(exerciseDoc.ref);
            }

            // 2.6. Delete all GYM PAYMENTS
            const paymentsSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/payments`));
            for (const paymentDoc of paymentsSnapshot.docs) {
                await deleteDoc(paymentDoc.ref);
            }

            // 3. Handle COACHES (Reset them to independent)
            const gymCoachesSnapshot = await getDocs(collection(this.firestore, `gyms/${gymId}/coaches`));
            for (const gCoach of gymCoachesSnapshot.docs) {
                const coachId = gCoach.id;

                // Remove from gym subcollection
                await deleteDoc(gCoach.ref);

                // Update their main profile to be independent
                const coachRef = doc(this.firestore, `coaches/${coachId}`);
                await updateDoc(coachRef, {
                    gymId: null, // Valid for Firestore update even if type says optional
                    accountType: 'independent',
                    updatedAt: new Date()
                } as any);
            }

            // 4. Delete Gym Document
            await deleteDoc(doc(this.firestore, `gyms/${gymId}`));

            console.log('Gym deleted fully:', gymId);

        } catch (error) {
            console.error('Error deleting gym fully:', error);
            throw error;
        }
    }

    /**
     * FULLY DELETE A COACH (Cascading)
     * If Owner: Deletes their Gym too.
     * If Independent/Staff: Deletes their profile and personal data.
     */
    async deleteCoachFully(coachId: string): Promise<void> {
        try {
            console.log('Starting full coach deletion:', coachId);

            // 1. Get Coach Profile to check role/gym
            const coachRef = doc(this.firestore, `coaches/${coachId}`);
            const coachSnap = await getDoc(coachRef);
            if (!coachSnap.exists()) return;

            const coachData = coachSnap.data() as Coach;

            // 2. IF GYM OWNER -> DELETE GYM FIRST
            // Strict check: Are they the owner of their assigned gym?
            if (coachData.gymId) {
                const gymSnap = await getDoc(doc(this.firestore, `gyms/${coachData.gymId}`));

                if (gymSnap.exists()) {
                    const gymData = gymSnap.data() as any;

                    // If they are listed as the owner OR if they are a 'gym' account type (headless)
                    if (gymData.ownerId === coachId || coachData.accountType === 'gym') {
                        console.log('Coach is confirmed gym owner, deleting gym first...');
                        await this.deleteGymFully(coachData.gymId);
                    }
                }
            }

            // 3. Delete PERSONAL Clients & Routines (Independent mode data)
            // Even if they were in a gym, they might have old personal data

            // Personal Routines
            const routinesSnapshot = await getDocs(collection(this.firestore, `coaches/${coachId}/routines`));
            for (const r of routinesSnapshot.docs) {
                const days = await getDocs(collection(this.firestore, `coaches/${coachId}/routines/${r.id}/days`));
                for (const d of days.docs) await deleteDoc(d.ref);
                await deleteDoc(r.ref);
            }

            // Personal Clients
            const clientsSnapshot = await getDocs(collection(this.firestore, `coaches/${coachId}/clients`));
            for (const c of clientsSnapshot.docs) {
                const measurements = await getDocs(collection(this.firestore, `coaches/${coachId}/clients/${c.id}/measurements`));
                for (const m of measurements.docs) await deleteDoc(m.ref);
                await deleteDoc(c.ref);
            }

            // 4. Delete Coach Profile
            await deleteDoc(coachRef);

            console.log('Coach deleted fully:', coachId);

        } catch (error) {
            console.error('Error deleting coach fully:', error);
            throw error;
        }
    }
}
