import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy // Import this
} from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Gym, CreateGymData, UpdateGymData } from '../models/gym.model';
import { GymCoach, GymCoachRole, DEFAULT_PERMISSIONS } from '../models/gym-coach.model';
import { CoachService } from './coach.service';

@Injectable({
    providedIn: 'root'
})
export class GymService {
    private firestore = inject(Firestore);
    private storage = inject(Storage);
    private coachService = inject(CoachService);

    /**
     * Generate a unique 6-character access code for gym
     */
    generateAccessCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0, O, 1, I
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Create a new gym
     */
    async createGym(data: CreateGymData): Promise<Gym> {
        try {
            const gymRef = doc(collection(this.firestore, 'gyms'));
            const gymId = gymRef.id;
            const accessCode = this.generateAccessCode();

            // Build gym object, only including fields with actual values (Firestore doesn't accept undefined)
            const gym: any = {
                id: gymId,
                name: data.name,
                accessCode,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Only add optional fields if they have values
            if (data.email) gym.email = data.email;
            if (data.phone) gym.phone = data.phone;
            if (data.address) gym.address = data.address;
            if (data.logoUrl) gym.logoUrl = data.logoUrl;
            if (data.brandColor) gym.brandColor = data.brandColor;
            if (data.ownerId) gym.ownerId = data.ownerId;

            // Create gym document
            await setDoc(gymRef, gym);

            // ONLY add owner if ownerId is provided (e.g., self-registration)
            // If created by Admin without ownerId, Admin assigns owner later.
            if (data.ownerId) {
                // Add owner as first coach member
                const ownerCoach = await this.coachService.getCoachProfile(data.ownerId);
                if (ownerCoach) {
                    await this.addCoachToGym(gymId, data.ownerId, ownerCoach.name, ownerCoach.email, 'owner');
                }

                // Update coach document with gymId
                await this.coachService.updateCoachGymAffiliation(data.ownerId, gymId, 'gym');
            }

            return gym;
        } catch (error) {
            console.error('Error creating gym:', error);
            throw error;
        }
    }

    /**
     * Get gym by ID
     */
    async getGym(gymId: string): Promise<Gym | null> {
        try {
            const gymRef = doc(this.firestore, `gyms/${gymId}`);
            const gymSnap = await getDoc(gymRef);

            if (!gymSnap.exists()) {
                return null;
            }

            return gymSnap.data() as Gym;
        } catch (error) {
            console.error('Error getting gym:', error);
            throw error;
        }
    }

    /**
     * Update gym information
     */
    async updateGym(gymId: string, data: UpdateGymData): Promise<void> {
        try {
            const gymRef = doc(this.firestore, `gyms/${gymId}`);
            await updateDoc(gymRef, {
                ...data,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating gym:', error);
            throw error;
        }
    }

    /**
     * Find gym by access code
     */
    async findGymByAccessCode(accessCode: string): Promise<Gym | null> {
        try {
            const gymsRef = collection(this.firestore, 'gyms');
            const q = query(gymsRef, where('accessCode', '==', accessCode.toUpperCase()));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                return null;
            }

            return querySnapshot.docs[0].data() as Gym;
        } catch (error) {
            console.error('Error finding gym by access code:', error);
            throw error;
        }
    }

    /**
     * Join a gym using access code
     */
    async joinGym(coachId: string, accessCode: string): Promise<Gym> {
        try {
            // Find gym by access code
            const gym = await this.findGymByAccessCode(accessCode);
            if (!gym) {
                throw new Error('Invalid access code');
            }

            // Get coach info
            const coach = await this.coachService.getCoachProfile(coachId);
            if (!coach) {
                throw new Error('Coach not found');
            }

            // Check if coach is already a member
            const existingMember = await this.getGymCoach(gym.id, coachId);
            if (existingMember) {
                throw new Error('You are already a member of this gym');
            }

            // Add coach to gym
            await this.addCoachToGym(gym.id, coachId, coach.name, coach.email, 'trainer');

            // Update coach document with gymId
            await this.coachService.updateCoachGymAffiliation(coachId, gym.id, 'gym');

            return gym;
        } catch (error) {
            console.error('Error joining gym:', error);
            throw error;
        }
    }

    /**
     * Add a coach to gym's coaches subcollection
     */
    private async addCoachToGym(
        gymId: string,
        coachId: string,
        name: string,
        email: string,
        role: GymCoachRole
    ): Promise<void> {
        try {
            const gymCoachRef = doc(this.firestore, `gyms/${gymId}/coaches/${coachId}`);
            const gymCoach: GymCoach = {
                coachId,
                name,
                email,
                role,
                joinedAt: new Date(),
                permissions: DEFAULT_PERMISSIONS[role]
            };

            await setDoc(gymCoachRef, gymCoach);
        } catch (error) {
            console.error('Error adding coach to gym:', error);
            throw error;
        }
    }

    /**
     * Get all coaches in a gym
     */
    async getGymCoaches(gymId: string): Promise<GymCoach[]> {
        try {
            const coachesRef = collection(this.firestore, `gyms/${gymId}/coaches`);
            const snapshot = await getDocs(coachesRef);

            return snapshot.docs.map(doc => doc.data() as GymCoach);
        } catch (error) {
            console.error('Error getting gym coaches:', error);
            throw error;
        }
    }

    /**
     * Get a specific gym coach
     */
    async getGymCoach(gymId: string, coachId: string): Promise<GymCoach | null> {
        try {
            const coachRef = doc(this.firestore, `gyms/${gymId}/coaches/${coachId}`);
            const coachSnap = await getDoc(coachRef);

            if (!coachSnap.exists()) {
                return null;
            }

            return coachSnap.data() as GymCoach;
        } catch (error) {
            console.error('Error getting gym coach:', error);
            throw error;
        }
    }

    /**
     * Remove a coach from gym
     */
    async removeCoachFromGym(gymId: string, coachId: string): Promise<void> {
        try {
            // Remove from gym's coaches subcollection
            const gymCoachRef = doc(this.firestore, `gyms/${gymId}/coaches/${coachId}`);
            await deleteDoc(gymCoachRef);

            // Update coach document (remove gymId)
            await this.coachService.updateCoachGymAffiliation(coachId, null, 'independent');
        } catch (error) {
            console.error('Error removing coach from gym:', error);
            throw error;
        }
    }

    /**
     * Update coach details in gym (Role, Name, Email)
     */
    async updateGymCoachDetails(gymId: string, coachId: string, data: { name?: string, email?: string, role?: GymCoachRole }): Promise<void> {
        try {
            const gymCoachRef = doc(this.firestore, `gyms/${gymId}/coaches/${coachId}`);

            const updateData: any = {};
            if (data.role) {
                updateData.role = data.role;
                updateData.permissions = DEFAULT_PERMISSIONS[data.role];
            }
            if (data.name) updateData.name = data.name;
            if (data.email) updateData.email = data.email;

            await updateDoc(gymCoachRef, updateData);
        } catch (error) {
            console.error('Error updating gym coach details:', error);
            throw error;
        }
    }
    /**
     * Get all gyms (Admin only)
     */
    async getAllGyms(): Promise<Gym[]> {
        try {
            const gymsRef = collection(this.firestore, 'gyms');
            // Simply get all, ordering by creation date
            const q = query(gymsRef, orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => doc.data() as Gym);
        } catch (error) {
            console.error('Error getting all gyms:', error);
            return [];
        }
    }

    /**
     * Assign owner to gym
     */
    async assignGymOwner(gymId: string, coachId: string): Promise<void> {
        try {
            console.log('🔧 Starting assignGymOwner:', { gymId, coachId });

            // 1. Update Gym Owner ID
            console.log('📝 Step 1: Updating gym document ownerId...');
            const gymRef = doc(this.firestore, 'gyms', gymId);
            await updateDoc(gymRef, { ownerId: coachId });
            console.log('✅ Step 1: Gym ownerId updated successfully');

            // 2. Update Coach Role and Gym ID
            console.log('📝 Step 2: Updating coach affiliation...');
            await this.coachService.updateCoachGymAffiliation(coachId, gymId, 'gym');
            console.log('✅ Step 2: Coach affiliation updated successfully');

            // 3. Add to gym coaches collection as owner (if not already there)
            console.log('📝 Step 3: Adding coach to gym coaches collection...');
            const coach = await this.coachService.getCoachProfile(coachId);
            if (coach) {
                await this.addCoachToGym(gymId, coachId, coach.name, coach.email, 'owner');
                console.log('✅ Step 3: Coach added to gym coaches collection');
            } else {
                console.warn('⚠️ Step 3: Coach not found, skipping coaches collection');
            }

            console.log('🎉 assignGymOwner completed successfully');
        } catch (error) {
            console.error('❌ Error assigning gym owner:', error);
            throw error;
        }
    }

    /**
     * Upload Gym Logo
     */
    async uploadLogo(gymId: string, file: File): Promise<string> {
        try {
            const filePath = `gyms/${gymId}/logo_${Date.now()}`;
            const storageRef = ref(this.storage, filePath);

            await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(storageRef);

            // Update gym profile with new logo URL
            await this.updateGym(gymId, { logoUrl: downloadUrl });

            return downloadUrl;
        } catch (error) {
            console.error('Error uploading gym logo:', error);
            throw error;
        }
    }
}
