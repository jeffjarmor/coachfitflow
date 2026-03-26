import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
    providedIn: 'root'
})
export class StorageService {
    private supabase = inject(SupabaseService).client;
    private bucket = 'assets';

    async uploadFile(path: string, file: File): Promise<string> {
        const { data, error } = await this.supabase.storage.from(this.bucket).upload(path, file, {
            upsert: true,
            contentType: file.type
        });
        if (error) throw error;
        const { data: pub } = this.supabase.storage.from(this.bucket).getPublicUrl(data.path);
        return pub.publicUrl;
    }

    uploadFileWithProgress(path: string, file: File): { task: any; downloadURL: Promise<string>; } {
        const downloadURL = this.uploadFile(path, file);
        return { task: null, downloadURL };
    }

    async deleteFile(path: string): Promise<void> {
        const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
        if (error) throw error;
    }

    async getDownloadURL(path: string): Promise<string> {
        const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(path);
        return data.publicUrl;
    }

    async uploadCoachLogo(coachId: string, file: File): Promise<string> {
        const path = `coaches/${coachId}/logo/${Date.now()}_${file.name}`;
        return this.uploadFile(path, file);
    }

    async uploadExerciseImage(coachId: string | null, file: File, isGlobal: boolean = false): Promise<string> {
        const path = isGlobal
            ? `exercises_global/${Date.now()}_${file.name}`
            : `coaches/${coachId}/exercises/${Date.now()}_${file.name}`;
        return this.uploadFile(path, file);
    }
}
