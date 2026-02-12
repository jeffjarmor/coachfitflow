import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    getDocs,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Client, CreateClientData, UpdateClientData } from '../types/Client';

class ClientService {
    /**
     * Subscribe to a coach's clients list in real-time
     */
    subscribeToClients(coachId: string, onUpdate: (clients: Client[]) => void, onError: (error: Error) => void) {
        // Path: coaches/{coachId}/clients
        const clientsRef = collection(db, 'coaches', coachId, 'clients');
        const q = query(clientsRef, orderBy('createdAt', 'desc'));

        return onSnapshot(q, (snapshot) => {
            const clients = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamps to JS Dates
                    birthDate: data.birthDate?.toDate(),
                    nextPaymentDueDate: data.nextPaymentDueDate?.toDate(),
                    createdAt: data.createdAt?.toDate(),
                    updatedAt: data.updatedAt?.toDate()
                } as Client;
            });
            onUpdate(clients);
        }, onError);
    }

    /**
     * Get all clients (one-time fetch)
     */
    async getClients(coachId: string): Promise<Client[]> {
        const clientsRef = collection(db, 'coaches', coachId, 'clients');
        const q = query(clientsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                birthDate: data.birthDate?.toDate(),
                nextPaymentDueDate: data.nextPaymentDueDate?.toDate(),
                createdAt: data.createdAt?.toDate(),
                updatedAt: data.updatedAt?.toDate()
            } as Client;
        });
    }

    /**
     * Add a new client
     */
    async addClient(coachId: string, data: CreateClientData): Promise<string> {
        const clientsRef = collection(db, 'coaches', coachId, 'clients');

        const docRef = await addDoc(clientsRef, {
            ...data,
            coachId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        return docRef.id;
    }

    /**
     * Update an existing client
     */
    async updateClient(coachId: string, clientId: string, data: UpdateClientData): Promise<void> {
        const clientRef = doc(db, 'coaches', coachId, 'clients', clientId);

        await updateDoc(clientRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    }

    /**
     * Delete a client
     */
    async deleteClient(coachId: string, clientId: string): Promise<void> {
        const clientRef = doc(db, 'coaches', coachId, 'clients', clientId);
        await deleteDoc(clientRef);
    }
}

export const clientService = new ClientService();
