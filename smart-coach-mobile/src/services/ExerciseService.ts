import {
    collection,
    addDoc,
    deleteDoc,
    getDocs,
    query,
    orderBy,
    doc,
    updateDoc,
    serverTimestamp,
    where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Exercise, CreateExerciseData, UpdateExerciseData } from '../types/Exercise';

class ExerciseService {

    /**
     * Get all global exercises
     */
    async getGlobalExercises(): Promise<Exercise[]> {
        const exercisesRef = collection(db, 'exercises_global');
        const q = query(exercisesRef, orderBy('name', 'asc'));

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate()
        })) as Exercise[];
    }

    /**
     * Get coach-specific exercises
     */
    async getCoachExercises(coachId: string): Promise<Exercise[]> {
        const exercisesRef = collection(db, 'coaches', coachId, 'exercises');
        const q = query(exercisesRef, orderBy('name', 'asc'));

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate()
        })) as Exercise[];
    }

    /**
     * Get all exercises (global + coach)
     */
    async getAllExercises(coachId: string): Promise<Exercise[]> {
        const [global, coach] = await Promise.all([
            this.getGlobalExercises(),
            this.getCoachExercises(coachId)
        ]);
        // Sort merged list by name
        return [...global, ...coach].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Create a new exercise
     */
    async createExercise(coachId: string, data: CreateExerciseData): Promise<string> {
        // Mobile app currently only allows creating coach-specific exercises
        // Unless we add an admin mode later
        const targetCollection = data.isGlobal
            ? collection(db, 'exercises_global')
            : collection(db, 'coaches', coachId, 'exercises');

        const exerciseData = {
            ...data,
            coachId: data.isGlobal ? undefined : coachId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(targetCollection, exerciseData);
        return docRef.id;
    }

    /**
     * Update an exercise
     */
    async updateExercise(coachId: string, exerciseId: string, data: UpdateExerciseData, isGlobal: boolean): Promise<void> {
        const collectionPath = isGlobal ? 'exercises_global' : `coaches/${coachId}/exercises`;
        const exerciseRef = doc(db, collectionPath, exerciseId);

        await updateDoc(exerciseRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    }

    /**
     * Delete an exercise
     */
    async deleteExercise(coachId: string, exerciseId: string, isGlobal: boolean): Promise<void> {
        const collectionPath = isGlobal ? 'exercises_global' : `coaches/${coachId}/exercises`;
        const exerciseRef = doc(db, collectionPath, exerciseId);

        await deleteDoc(exerciseRef);
    }
}

export const exerciseService = new ExerciseService();
