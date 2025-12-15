import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { Client, CreateClientData, UpdateClientData } from '../models/client.model';
import { where, orderBy } from '@angular/fire/firestore';
import { RoutineService } from './routine.service';

@Injectable({
    providedIn: 'root'
})
export class ClientService {
    private firestoreService = inject(FirestoreService);
    private routineService = inject(RoutineService);

    clients = signal<Client[]>([]);
    loading = signal<boolean>(false);

    /**
     * Get all clients for a coach
     */
    async getClients(coachId: string): Promise<Client[]> {
        try {
            this.loading.set(true);
            const clients = await this.firestoreService.getDocuments<Client>(
                `coaches/${coachId}/clients`,
                orderBy('createdAt', 'desc')
            );
            this.clients.set(clients);
            return clients;
        } catch (error) {
            console.error('Error getting clients:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Get a single client by ID
     */
    async getClient(coachId: string, clientId: string): Promise<Client | null> {
        try {
            return await this.firestoreService.getDocument<Client>(
                `coaches/${coachId}/clients`,
                clientId
            );
        } catch (error) {
            console.error('Error getting client:', error);
            throw error;
        }
    }

    /**
     * Create a new client
     */
    async createClient(coachId: string, data: CreateClientData): Promise<string> {
        try {
            this.loading.set(true);
            const clientData = {
                ...data,
                coachId
            };
            const clientId = await this.firestoreService.addDocument(
                `coaches/${coachId}/clients`,
                clientData
            );

            // Refresh clients list
            await this.getClients(coachId);

            return clientId;
        } catch (error) {
            console.error('Error creating client:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update a client
     */
    async updateClient(
        coachId: string,
        clientId: string,
        data: UpdateClientData
    ): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument(
                `coaches/${coachId}/clients`,
                clientId,
                data
            );

            // Refresh clients list
            await this.getClients(coachId);
        } catch (error) {
            console.error('Error updating client:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete a client
     */
    async deleteClient(coachId: string, clientId: string): Promise<void> {
        try {
            this.loading.set(true);

            // First delete all routines associated with this client
            await this.routineService.deleteRoutinesByClient(coachId, clientId);

            // Then delete the client
            await this.firestoreService.deleteDocument(
                `coaches/${coachId}/clients`,
                clientId
            );

            // Refresh clients list
            await this.getClients(coachId);
        } catch (error) {
            console.error('Error deleting client:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Search clients by name
     */
    searchClients(searchTerm: string): Client[] {
        const allClients = this.clients();
        if (!searchTerm.trim()) {
            return allClients;
        }

        const term = searchTerm.toLowerCase();
        return allClients.filter(client =>
            client.name.toLowerCase().includes(term)
        );
    }
}
