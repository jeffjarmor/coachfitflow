import { Injectable, inject } from '@angular/core';
import {
    Storage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
    uploadBytesResumable,
    UploadTask
} from '@angular/fire/storage';
import { Observable, from } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class StorageService {
    private storage = inject(Storage);

    /**
     * Upload a file and return the download URL
     */
    async uploadFile(path: string, file: File): Promise<string> {
        try {
            const storageRef = ref(this.storage, path);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    }

    /**
     * Upload file with progress tracking
     */
    uploadFileWithProgress(path: string, file: File): {
        task: UploadTask;
        downloadURL: Promise<string>;
    } {
        const storageRef = ref(this.storage, path);
        const uploadTask = uploadBytesResumable(storageRef, file);

        const downloadURL = new Promise<string>((resolve, reject) => {
            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    console.log('Upload is ' + progress + '% done');
                },
                (error) => {
                    console.error('Upload error:', error);
                    reject(error);
                },
                async () => {
                    const url = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(url);
                }
            );
        });

        return { task: uploadTask, downloadURL };
    }

    /**
     * Delete a file
     */
    async deleteFile(path: string): Promise<void> {
        try {
            const storageRef = ref(this.storage, path);
            await deleteObject(storageRef);
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    /**
     * Get download URL for a file
     */
    async getDownloadURL(path: string): Promise<string> {
        try {
            const storageRef = ref(this.storage, path);
            return await getDownloadURL(storageRef);
        } catch (error) {
            console.error('Error getting download URL:', error);
            throw error;
        }
    }

    /**
     * Upload coach logo
     */
    async uploadCoachLogo(coachId: string, file: File): Promise<string> {
        const path = `coaches/${coachId}/logo/${file.name}`;
        return this.uploadFile(path, file);
    }

    /**
     * Upload exercise image
     */
    async uploadExerciseImage(
        coachId: string | null,
        file: File,
        isGlobal: boolean = false
    ): Promise<string> {
        const path = isGlobal
            ? `exercises_global/${file.name}`
            : `coaches/${coachId}/exercises/${file.name}`;
        return this.uploadFile(path, file);
    }
}
