import {
    collection,
    addDoc,
    deleteDoc,
    getDocs,
    doc,
    query,
    orderBy,
    Timestamp,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Measurement, CreateMeasurementData } from '../types/Measurement';

class MeasurementService {
    /**
     * Get all measurements for a client
     */
    async getClientMeasurements(coachId: string, clientId: string): Promise<Measurement[]> {
        const measurementsRef = collection(db, 'coaches', coachId, 'clients', clientId, 'measurements');
        const q = query(measurementsRef, orderBy('date', 'desc'));

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: data.date?.toDate(),
                createdAt: data.createdAt?.toDate()
            } as Measurement;
        });
    }

    /**
     * Add a new measurement
     */
    async addMeasurement(coachId: string, measurementData: CreateMeasurementData): Promise<string> {
        const measurementsRef = collection(db, 'coaches', coachId, 'clients', measurementData.clientId, 'measurements');

        // Remove undefined fields
        const cleanData: any = {
            clientId: measurementData.clientId,
            date: measurementData.date,
            weight: measurementData.weight,
            height: measurementData.height,
            bmi: measurementData.bmi,
            createdAt: serverTimestamp()
        };

        // Add optional fields only if they exist
        const optionalFields = [
            'routineId', 'bodyFatPercentage', 'muscleMass', 'visceralFat', 'metabolicAge',
            'waist', 'hips', 'chest', 'arms', 'legs', 'calf', 'thigh', 'notes'
        ] as const;

        optionalFields.forEach(field => {
            if (measurementData[field] !== undefined) {
                cleanData[field] = measurementData[field];
            }
        });

        const docRef = await addDoc(measurementsRef, cleanData);
        return docRef.id;
    }

    /**
     * Delete a measurement
     */
    async deleteMeasurement(coachId: string, clientId: string, measurementId: string): Promise<void> {
        const docRef = doc(db, 'coaches', coachId, 'clients', clientId, 'measurements', measurementId);
        await deleteDoc(docRef);
    }
}

export const measurementService = new MeasurementService();
