import { Injectable, inject, signal } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { Measurement, CreateMeasurementData } from '../models/measurement.model';
import { orderBy } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class MeasurementService {
    private firestoreService = inject(FirestoreService);

    loading = signal<boolean>(false);

    /**
     * Determines the base Firestore path based on whether the coach belongs to a gym
     */
    private getBasePath(coachId: string, gymId?: string | null): string {
        if (gymId) {
            return `gyms/${gymId}`;
        }
        return `coaches/${coachId}`;
    }

    /**
     * Get all measurements for a client
     */
    async getClientMeasurements(coachId: string, clientId: string, gymId?: string | null): Promise<Measurement[]> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            const measurements = await this.firestoreService.getDocuments<Measurement>(
                `${basePath}/clients/${clientId}/measurements`,
                orderBy('date', 'desc')
            );
            return measurements;
        } catch (error) {
            console.error('Error getting client measurements:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Add a new measurement
     */
    async addMeasurement(coachId: string, measurementData: CreateMeasurementData, gymId?: string | null): Promise<string> {
        try {
            this.loading.set(true);

            // Remove undefined fields (Firestore doesn't accept undefined values)
            const cleanData: any = {
                clientId: measurementData.clientId,
                date: measurementData.date,
                weight: measurementData.weight,
                height: measurementData.height,
                bmi: measurementData.bmi,
                createdAt: new Date()
            };

            // Only add optional fields if they have values
            if (measurementData.routineId !== undefined) {
                cleanData.routineId = measurementData.routineId;
            }
            if (measurementData.bodyFatPercentage !== undefined) {
                cleanData.bodyFatPercentage = measurementData.bodyFatPercentage;
            }
            if (measurementData.muscleMass !== undefined) {
                cleanData.muscleMass = measurementData.muscleMass;
            }
            if (measurementData.visceralFat !== undefined) {
                cleanData.visceralFat = measurementData.visceralFat;
            }
            if (measurementData.metabolicAge !== undefined) {
                cleanData.metabolicAge = measurementData.metabolicAge;
            }
            if (measurementData.calories !== undefined) {
                cleanData.calories = measurementData.calories;
            }
            if (measurementData.boneMass !== undefined) {
                cleanData.boneMass = measurementData.boneMass;
            }
            if (measurementData.waterPercentage !== undefined) {
                cleanData.waterPercentage = measurementData.waterPercentage;
            }
            if (measurementData.notes !== undefined && measurementData.notes.trim() !== '') {
                cleanData.notes = measurementData.notes;
            }

            const basePath = this.getBasePath(coachId, gymId);
            const id = await this.firestoreService.addDocument(
                `${basePath}/clients/${measurementData.clientId}/measurements`,
                cleanData
            );
            return id;
        } catch (error) {
            console.error('Error adding measurement:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Update an existing measurement
     */
    async updateMeasurement(coachId: string, clientId: string, measurementId: string, measurementData: Partial<CreateMeasurementData>, gymId?: string | null): Promise<void> {
        try {
            this.loading.set(true);

            // Remove undefined fields
            const cleanData: any = {};

            if (measurementData.weight !== undefined) cleanData.weight = measurementData.weight;
            if (measurementData.height !== undefined) cleanData.height = measurementData.height;
            if (measurementData.bmi !== undefined) cleanData.bmi = measurementData.bmi;
            if (measurementData.bodyFatPercentage !== undefined) cleanData.bodyFatPercentage = measurementData.bodyFatPercentage;
            if (measurementData.muscleMass !== undefined) cleanData.muscleMass = measurementData.muscleMass;
            if (measurementData.visceralFat !== undefined) cleanData.visceralFat = measurementData.visceralFat;
            if (measurementData.metabolicAge !== undefined) cleanData.metabolicAge = measurementData.metabolicAge;
            if (measurementData.calories !== undefined) cleanData.calories = measurementData.calories;
            if (measurementData.boneMass !== undefined) cleanData.boneMass = measurementData.boneMass;
            if (measurementData.waterPercentage !== undefined) cleanData.waterPercentage = measurementData.waterPercentage;
            if (measurementData.waist !== undefined) cleanData.waist = measurementData.waist;
            if (measurementData.hips !== undefined) cleanData.hips = measurementData.hips;
            if (measurementData.chest !== undefined) cleanData.chest = measurementData.chest;
            if (measurementData.arms !== undefined) cleanData.arms = measurementData.arms;
            if (measurementData.legs !== undefined) cleanData.legs = measurementData.legs;
            if (measurementData.calf !== undefined) cleanData.calf = measurementData.calf;
            if (measurementData.thigh !== undefined) cleanData.thigh = measurementData.thigh;
            if (measurementData.notes !== undefined && measurementData.notes.trim() !== '') {
                cleanData.notes = measurementData.notes;
            }

            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.updateDocument(
                `${basePath}/clients/${clientId}/measurements`,
                measurementId,
                cleanData
            );
        } catch (error) {
            console.error('Error updating measurement:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }

    /**
     * Delete a measurement
     */
    async deleteMeasurement(coachId: string, clientId: string, measurementId: string, gymId?: string | null): Promise<void> {
        try {
            this.loading.set(true);
            const basePath = this.getBasePath(coachId, gymId);
            await this.firestoreService.deleteDocument(
                `${basePath}/clients/${clientId}/measurements`,
                measurementId
            );
        } catch (error) {
            console.error('Error deleting measurement:', error);
            throw error;
        } finally {
            this.loading.set(false);
        }
    }
}
