import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { Client, CreateClientData, UpdateClientData } from '../models/client.model';
import { RoutineService } from './routine.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class ClientService {
    private firestoreService = inject(FirestoreService);
    private routineService = inject(RoutineService);
    private authService = inject(AuthService);
    private supabase = inject(SupabaseService).client;

    clients = signal<Client[]>([]);
    loading = signal<boolean>(false);
    private clientsCache = new Map<string, { data: Client[]; expiresAt: number }>();
    private clientsInFlight = new Map<string, Promise<Client[]>>();
    private readonly clientsCacheTtlMs = 20_000;

    /**
     * Determines the base Firestore path based on whether the coach belongs to a gym
     * @param coachId - The coach's ID
     * @param gymId - Optional gym ID if the coach is part of a gym
     * @returns The base path for Firestore operations
     */
    private getBasePath(coachId: string, gymId?: string | null): string {
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
    async getClients(coachId: string, gymId?: string | null): Promise<Client[]> {
        const cacheKey = `${coachId}:${gymId || 'personal'}`;
        const now = Date.now();
        const cached = this.clientsCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            this.clients.set(cached.data);
            return cached.data;
        }

        const inFlight = this.clientsInFlight.get(cacheKey);
        if (inFlight) return inFlight;

        const request = this.fetchClients(coachId, gymId, cacheKey);
        this.clientsInFlight.set(cacheKey, request);
        try {
            return await request;
        } finally {
            this.clientsInFlight.delete(cacheKey);
        }
    }

    private async fetchClients(coachId: string, gymId?: string | null, cacheKey?: string): Promise<Client[]> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            const clients = await this.firestoreService.getDocuments<Client>(`${basePath}/clients`);
            if (cacheKey) {
                this.clientsCache.set(cacheKey, {
                    data: clients,
                    expiresAt: Date.now() + this.clientsCacheTtlMs
                });
            }
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
    async getClient(coachId: string, clientId: string, gymId?: string | null): Promise<Client | null> {
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
    async createClient(coachId: string, data: CreateClientData, gymId?: string | null): Promise<string> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);

            // Build client data object
            const clientData: any = {
                ...data,
                coachId: gymId || coachId
            };

            // Only add nextPaymentDueDate if we're in gym mode or if it was provided
            if (gymId && !data.nextPaymentDueDate) {
                // Calculate next payment date (1 month from now) for gym mode
                const date = new Date();
                date.setMonth(date.getMonth() + 1);
                clientData.nextPaymentDueDate = date;
            } else if (data.nextPaymentDueDate) {
                // Use provided date if available
                clientData.nextPaymentDueDate = data.nextPaymentDueDate;
            }
            // If not in gym mode and no date provided, don't add the field at all

            const clientId = await this.firestoreService.addDocument(
                `${basePath}/clients`,
                clientData
            );
            this.clientsCache.delete(`${coachId}:${gymId || 'personal'}`);

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
        gymId?: string | null
    ): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.updateDocument(
                `${basePath}/clients`,
                clientId,
                data
            );
            this.clientsCache.delete(`${coachId}:${gymId || 'personal'}`);

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
    async deleteClient(coachId: string, clientId: string, gymId?: string | null): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            const linkedAuthUserIds = await this.getLinkedAuthUserIds(clientId, gymId);

            // First delete all routines associated with this client
            await this.routineService.deleteRoutinesByClient(coachId, clientId, gymId);

            // Then delete the client document
            await this.firestoreService.deleteDocument(
                `${basePath}/clients`,
                clientId
            );
            this.clientsCache.delete(`${coachId}:${gymId || 'personal'}`);

            // Finally, delete linked Auth users only if they no longer have any portal access.
            for (const uid of linkedAuthUserIds) {
                try {
                    const { count, error: countErr } = await this.supabase
                        .from('client_portal_access')
                        .select('id', { count: 'exact', head: true })
                        .eq('user_id', uid);
                    if (countErr) throw countErr;

                    if ((count || 0) === 0) {
                        await this.authService.deleteUserFromAuthViaFunction(uid);
                    }
                } catch (authError) {
                    console.warn('Could not delete linked auth user after client deletion:', uid, authError);
                }
            }

            // Refresh clients list
            await this.getClients(coachId, gymId);
        } catch (error) {
            console.error('Error deleting client:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    private async getLinkedAuthUserIds(clientId: string, gymId?: string | null): Promise<string[]> {
        const uidSet = new Set<string>();

        try {
            const { data: clientRow } = await this.supabase
                .from('clients')
                .select('user_id')
                .eq('id', clientId)
                .maybeSingle();
            if (clientRow?.user_id) uidSet.add(clientRow.user_id);
        } catch {
            // Best-effort only.
        }

        try {
            let membershipsQuery = this.supabase
                .from('client_gym_memberships')
                .select('id')
                .eq('client_id', clientId);

            if (gymId) membershipsQuery = membershipsQuery.eq('gym_id', gymId);
            const { data: memberships } = await membershipsQuery;

            const membershipIds = (memberships || []).map((m: any) => m.id).filter(Boolean);
            if (membershipIds.length > 0) {
                const { data: accesses } = await this.supabase
                    .from('client_portal_access')
                    .select('user_id')
                    .in('client_gym_membership_id', membershipIds);

                for (const row of accesses || []) {
                    if (row?.user_id) uidSet.add(row.user_id);
                }
            }
        } catch {
            // Best-effort only.
        }

        try {
            const { data: accesses } = await this.supabase
                .from('independent_client_portal_access')
                .select('user_id')
                .eq('client_id', clientId);
            for (const row of accesses || []) {
                if (row?.user_id) uidSet.add(row.user_id);
            }
        } catch {
            // Best-effort only.
        }

        return Array.from(uidSet);
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
