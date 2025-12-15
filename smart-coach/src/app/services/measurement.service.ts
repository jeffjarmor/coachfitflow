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
     * Get all measurements for a client
     */
    async getClientMeasurements(coachId: string, clientId: string): Promise<Measurement[]> {
        try {
            this.loading.set(true);
            const measurements = await this.firestoreService.getDocuments<Measurement>(
                `coaches/${coachId}/clients/${clientId}/measurements`,
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
    async addMeasurement(coachId: string, measurementData: CreateMeasurementData): Promise<string> {
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
            if (measurementData.notes !== undefined && measurementData.notes.trim() !== '') {
                cleanData.notes = measurementData.notes;
            }

            const id = await this.firestoreService.addDocument(
                `coaches/${coachId}/clients/${measurementData.clientId}/measurements`,
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
     * Delete a measurement
     */
    async deleteMeasurement(coachId: string, clientId: string, measurementId: string): Promise<void> {
        try {
            this.loading.set(true);
            await this.firestoreService.deleteDocument(
                `coaches/${coachId}/clients/${clientId}/measurements`,
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
