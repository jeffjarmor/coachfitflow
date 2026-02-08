import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { StorageService } from './storage.service';
import { Coach, CreateCoachData, UpdateCoachData } from '../models/coach.model';
import { doc, setDoc } from '@angular/fire/firestore';
import { Firestore } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class CoachService {
    private firestoreService = inject(FirestoreService);
    private storageService = inject(StorageService);
    private firestore = inject(Firestore);

    // Signal for current coach profile
    currentCoach = signal<Coach | null>(null);
    loading = signal<boolean>(false);

    /**
     * Create a new coach profile
     */
    async createCoachProfile(data: CreateCoachData, userId: string): Promise<void> {
        try {
            const docRef = doc(this.firestore, 'coaches', userId);
            const coachData = {
                email: data.email,
                name: data.name,
                phone: data.phone || '',
                logoUrl: '',
                brandColor: '#2196f3',
                role: 'coach' as const,
                createdAt: new Date()
            };

            await setDoc(docRef, coachData);
        } catch (error) {
            console.error('Error creating coach profile:', error);
            throw error;
        }
    }

    /**
     * Check if coach profile exists
     */
    async coachExists(coachId: string): Promise<boolean> {
        return this.firestoreService.documentExists('coaches', coachId);
    }

    /**
     * Get coach profile by ID
     */
    async getCoachProfile(coachId: string): Promise<Coach | null> {
        try {
            this.loading.set(true);
            const coach = await this.firestoreService.getDocument<Coach>('coaches', coachId);
            if (coach) {
                this.currentCoach.set(coach);
            }
            return coach;
        } catch (error) {
            console.error('Error getting coach profile:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Get all coaches (Admin only)
     */
    async getAllCoaches(): Promise<Coach[]> {
        try {
            this.loading.set(true);
            // In a real app, we should filter by role='coach', but for now get all
            return await this.firestoreService.getCollection<Coach>('coaches');
        } catch (error) {
            console.error('Error getting all coaches:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete coach profile (Admin only)
     */
    async deleteCoach(coachId: string): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.deleteDocument('coaches', coachId);
        } catch (error) {
            console.error('Error deleting coach:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update coach profile
     */
    async updateCoachProfile(coachId: string, data: UpdateCoachData): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.updateDocument('coaches', coachId, data);

            // Update local signal
            const updatedCoach = await this.getCoachProfile(coachId);
            if (updatedCoach) {
                this.currentCoach.set(updatedCoach);
            }
        } catch (error) {
            console.error('Error updating coach profile:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Upload coach logo
     */
    async uploadLogo(coachId: string, file: File): Promise<string> {
        try {
            this.loading.set(true);
            const logoUrl = await this.storageService.uploadCoachLogo(coachId, file);

            // Update coach profile with new logo URL
            await this.updateCoachProfile(coachId, { logoUrl });

            return logoUrl;
        } catch (error) {
            console.error('Error uploading logo:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update brand color
     */
    async updateBrandColor(coachId: string, brandColor: string): Promise<void> {
        return this.updateCoachProfile(coachId, { brandColor });
    }

    /**
     * Update coach gym affiliation (for gym multi-tenancy)
     */
    async updateCoachGymAffiliation(
        coachId: string,
        gymId: string | null,
        accountType: 'independent' | 'gym'
    ): Promise<void> {
        try {
            const updateData: Partial<Coach> = {
                gymId: gymId || undefined,
                accountType,
                updatedAt: new Date()
            };

            await this.firestoreService.updateDocument('coaches', coachId, updateData);

            // Update local signal if this is the current coach
            const currentCoach = this.currentCoach();
            if (currentCoach && currentCoach.id === coachId) {
                this.currentCoach.set({
                    ...currentCoach,
                    ...updateData
                });
            }
        } catch (error) {
            console.error('Error updating coach gym affiliation:', error);
            throw error;
        }
    }
}
