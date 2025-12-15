import { Injectable, inject } from '@angular/core';
import {
    Firestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    QueryConstraint,
    DocumentData,
    CollectionReference,
    Timestamp
} from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class FirestoreService {
    private firestore = inject(Firestore);

    /**
     * Get a document by ID
     */
    async getDocument<T>(collectionPath: string, docId: string): Promise<T | null> {
        try {
            const docRef = doc(this.firestore, collectionPath, docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return { id: docSnap.id, ...this.convertTimestamps(docSnap.data()) } as T;
            }
            return null;
        } catch (error) {
            console.error('Error getting document:', error);
            throw error;
        }
    }

    /**
     * Get all documents from a collection with optional query constraints
     */
    async getDocuments<T>(
        collectionPath: string,
        ...queryConstraints: QueryConstraint[]
    ): Promise<T[]> {
        try {
            const collectionRef = collection(this.firestore, collectionPath);
            const q = queryConstraints.length > 0
                ? query(collectionRef, ...queryConstraints)
                : collectionRef;

            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...this.convertTimestamps(doc.data())
            } as T));
        } catch (error) {
            console.error('Error getting documents:', error);
            throw error;
        }
    }

    /**
     * Add a new document
     */
    async addDocument<T>(collectionPath: string, data: Partial<T>): Promise<string> {
        try {
            const collectionRef = collection(this.firestore, collectionPath);
            const docData = {
                ...data,
                createdAt: Timestamp.now()
            };
            const docRef = await addDoc(collectionRef, docData);
            return docRef.id;
        } catch (error) {
            console.error('Error adding document:', error);
            throw error;
        }
    }

    /**
     * Set a document with a specific ID
     */
    async setDocument<T>(collectionPath: string, docId: string, data: Partial<T>): Promise<void> {
        try {
            const docRef = doc(this.firestore, collectionPath, docId);
            const docData = {
                ...data,
                createdAt: Timestamp.now()
            };
            await updateDoc(docRef, docData);
        } catch (error) {
            // If document doesn't exist, create it
            const docRef = doc(this.firestore, collectionPath, docId);
            const docData = {
                ...data,
                createdAt: Timestamp.now()
            };
            await updateDoc(docRef, docData);
        }
    }

    /**
     * Update a document
     */
    async updateDocument<T>(
        collectionPath: string,
        docId: string,
        data: Partial<T>
    ): Promise<void> {
        try {
            const docRef = doc(this.firestore, collectionPath, docId);
            const updateData = {
                ...data,
                updatedAt: Timestamp.now()
            };
            await updateDoc(docRef, updateData);
        } catch (error) {
            console.error('Error updating document:', error);
            throw error;
        }
    }

    /**
     * Delete a document
     */
    async deleteDocument(collectionPath: string, docId: string): Promise<void> {
        try {
            const docRef = doc(this.firestore, collectionPath, docId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error('Error deleting document:', error);
            throw error;
        }
    }

    /**
     * Check if a document exists
     */
    async documentExists(collectionPath: string, docId: string): Promise<boolean> {
        try {
            const docRef = doc(this.firestore, collectionPath, docId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists();
        } catch (error) {
            console.error('Error checking document existence:', error);
            return false;
        }
    }

    /**
     * Convert Firestore Timestamps to JavaScript Dates
     */
    private convertTimestamps(data: DocumentData): any {
        if (data instanceof Timestamp) {
            return data.toDate();
        } else if (Array.isArray(data)) {
            return data.map(item => this.convertTimestamps(item));
        } else if (typeof data === 'object' && data !== null) {
            const converted: any = {};
            for (const key in data) {
                converted[key] = this.convertTimestamps(data[key]);
            }
            return converted;
        } else {
            return data;
        }
    }
}
