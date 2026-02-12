import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    query,
    where
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { Coach } from '../types/coach';

export const CoachService = {
    /**
     * Create a new coach profile
     */
    async createCoachProfile(userId: string, data: { name: string; email: string; phone?: string }): Promise<void> {
        try {
            const coachRef = doc(db, 'coaches', userId);
            const coachData: Coach = {
                id: userId,
                email: data.email,
                name: data.name,
                phone: data.phone || '',
                logoUrl: '',
                brandColor: '#2196f3',
                role: 'coach',
                accountType: 'independent', // Default
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await setDoc(coachRef, coachData);
        } catch (error) {
            console.error('Error creating coach profile:', error);
            throw error;
        }
    },

    /**
     * Get coach profile by ID
     */
    async getCoachProfile(coachId: string): Promise<Coach | null> {
        try {
            const coachRef = doc(db, 'coaches', coachId);
            const coachSnap = await getDoc(coachRef);

            if (coachSnap.exists()) {
                const data = coachSnap.data();
                // Convert timestamps if necessary
                return {
                    id: coachSnap.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
                    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)
                } as Coach;
            }
            return null;
        } catch (error) {
            console.error('Error getting coach profile:', error);
            throw error;
        }
    },

    /**
     * Update coach profile
     */
    async updateCoachProfile(coachId: string, data: Partial<Coach>): Promise<void> {
        try {
            const coachRef = doc(db, 'coaches', coachId);
            await updateDoc(coachRef, {
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating coach profile:', error);
            throw error;
        }
    },

    /**
     * Upload coach logo
     */
    async uploadLogo(coachId: string, imageUri: string): Promise<string> {
        try {
            // Convert URI to blob
            const response = await fetch(imageUri);
            const blob = await response.blob();

            // Create reference
            // Use a timestamp to prevent caching issues if they change it properly
            const filename = `logo_${Date.now()}.jpg`;
            const storageRef = ref(storage, `coaches/${coachId}/${filename}`);

            // Upload
            await uploadBytes(storageRef, blob);

            // Get URL
            const downloadURL = await getDownloadURL(storageRef);

            // Update profile
            await this.updateCoachProfile(coachId, { logoUrl: downloadURL });

            return downloadURL;
        } catch (error) {
            console.error('Error uploading logo:', error);
            throw error;
        }
    }
};
