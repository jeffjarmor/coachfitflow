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
     * Determines the base Firestore path based on whether the coach belongs to a gym
     * @param coachId - The coach's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     * @returns The base path for Firestore operations
     */
    private getBasePath(coachId: string, gymId?: string): string {
        // If coach belongs to a gym, use gym path (shared data)
        if (gymId) {
            return `gyms/${gymId}`;
        }
        // Otherwise, use individual coach path (isolated data)
        return `coaches/${coachId}`;
    }

    /**
     * Get all clients for a coach or gym
     * @param coachId - The coach's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async getClients(coachId: string, gymId?: string): Promise<Client[]> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            const clients = await this.firestoreService.getDocuments<Client>(
                `${basePath}/clients`,
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
     * @param coachId - The coach's ID
     * @param clientId - The client's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async getClient(coachId: string, clientId: string, gymId?: string): Promise<Client | null> {
        try {
            const basePath = this.getBasePath(coachId, gymId);
            return await this.firestoreService.getDocument<Client>(
                `${basePath}/clients`,
                clientId
            );
        } catch (error) {
            console.error('Error getting client:', error);
            throw error;
        }
    }

    /**
     * Create a new client
     * @param coachId - The coach's ID
     * @param data - The client data
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async createClient(coachId: string, data: CreateClientData, gymId?: string): Promise<string> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);

            // Calculate next payment date (1 month from now) if in gym mode
            let nextPaymentDueDate = data.nextPaymentDueDate;
            if (gymId && !nextPaymentDueDate) {
                const date = new Date();
                date.setMonth(date.getMonth() + 1);
                nextPaymentDueDate = date;
            }

            const clientData = {
                ...data,
                nextPaymentDueDate,
                coachId: gymId || coachId // Store gymId if available, otherwise coachId
            };
            const clientId = await this.firestoreService.addDocument(
                `${basePath}/clients`,
                clientData
            );

            // Refresh clients list
            await this.getClients(coachId, gymId);

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
     * @param coachId - The coach's ID
     * @param clientId - The client's ID
     * @param data - The updated client data
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async updateClient(
        coachId: string,
        clientId: string,
        data: UpdateClientData,
        gymId?: string
    ): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.updateDocument(
                `${basePath}/clients`,
                clientId,
                data
            );

            // Refresh clients list
            await this.getClients(coachId, gymId);
        } catch (error) {
            console.error('Error updating client:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete a client
     * @param coachId - The coach's ID
     * @param clientId - The client's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     */
    async deleteClient(coachId: string, clientId: string, gymId?: string): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);

            // First delete all routines associated with this client
            await this.routineService.deleteRoutinesByClient(coachId, clientId, gymId);

            // Then delete the client
            await this.firestoreService.deleteDocument(
                `${basePath}/clients`,
                clientId
            );

            // Refresh clients list
            await this.getClients(coachId, gymId);
        } catch (error) {
            console.error('Error deleting client:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Search clients by name (uses in-memory filtering)
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

    // ====================
    // LEGACY GYM METHODS (Deprecated - use main methods with gymId parameter)
    // ====================

    /** @deprecated Use getClients(coachId, gymId) instead */
    async getGymClients(gymId: string): Promise<Client[]> {
        return this.getClients(gymId, gymId);
    }

    /** @deprecated Use getClient(coachId, clientId, gymId) instead */
    async getGymClient(gymId: string, clientId: string): Promise<Client | null> {
        return this.getClient(gymId, clientId, gymId);
    }

    /** @deprecated Use createClient(coachId, data, gymId) instead */
    async createGymClient(gymId: string, data: CreateClientData): Promise<string> {
        return this.createClient(gymId, data, gymId);
    }

    /** @deprecated Use updateClient(coachId, clientId, data, gymId) instead */
    async updateGymClient(gymId: string, clientId: string, data: UpdateClientData): Promise<void> {
        return this.updateClient(gymId, clientId, data, gymId);
    }

    /** @deprecated Use deleteClient(coachId, clientId, gymId) instead */
    async deleteGymClient(gymId: string, clientId: string): Promise<void> {
        return this.deleteClient(gymId, clientId, gymId);
    }
}

