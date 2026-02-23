import { Injectable, inject } from '@angular/core';
import { FirestoreService } from './firestore.service';
import { CompetitorSheet } from '../models/competitor-sheet.model';
import { where, orderBy } from '@angular/fire/firestore';

@Injectable({
    providedIn: 'root'
})
export class CompetitorService {
    private firestoreService = inject(FirestoreService);

    private getBasePath(coachId: string, gymId?: string | null): string {
        if (gymId) {
            return `gyms/${gymId}`;
        }
        return `coaches/${coachId}`;
    }

    async createSheet(coachId: string, sheet: CompetitorSheet, gymId?: string | null): Promise<string> {
        try {
            const path = `${this.getBasePath(coachId, gymId)}/competitor_sheets`;
            const data = {
                ...sheet,
                coachId,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            return await this.firestoreService.addDocument(path, data);
        } catch (error) {
            console.error('Error creating competitor sheet:', error);
            throw error;
        }
    }

    async updateSheet(coachId: string, sheetId: string, sheet: Partial<CompetitorSheet>, gymId?: string | null): Promise<void> {
        try {
            const path = `${this.getBasePath(coachId, gymId)}/competitor_sheets`;
            const data = {
                ...sheet,
                updatedAt: new Date()
            };
            await this.firestoreService.updateDocument(path, sheetId, data);
        } catch (error) {
            console.error('Error updating competitor sheet:', error);
            throw error;
        }
    }

    async getSheet(coachId: string, sheetId: string, gymId?: string | null): Promise<CompetitorSheet | null> {
        try {
            const path = `${this.getBasePath(coachId, gymId)}/competitor_sheets`;
            return await this.firestoreService.getDocument<CompetitorSheet>(path, sheetId);
        } catch (error) {
            console.error('Error getting competitor sheet:', error);
            throw error;
        }
    }

    async getSheetsByClient(coachId: string, clientId: string, gymId?: string | null): Promise<CompetitorSheet[]> {
        try {
            const path = `${this.getBasePath(coachId, gymId)}/competitor_sheets`;
            return await this.firestoreService.getDocuments<CompetitorSheet>(
                path,
                where('clientId', '==', clientId),
                orderBy('createdAt', 'desc')
            );
        } catch (error) {
            console.error('Error getting competitor sheets:', error);
            throw error;
        }
    }

    async deleteSheet(coachId: string, sheetId: string, gymId?: string | null): Promise<void> {
        try {
            const path = `${this.getBasePath(coachId, gymId)}/competitor_sheets`;
            await this.firestoreService.deleteDocument(path, sheetId);
        } catch (error) {
            console.error('Error deleting competitor sheet:', error);
            throw error;
        }
    }
}
