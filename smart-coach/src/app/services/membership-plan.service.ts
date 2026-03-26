import { Injectable, inject } from '@angular/core';
import { FirestoreService } from './firestore.service';
import {
    MembershipPlan,
    CreateMembershipPlanData,
    UpdateMembershipPlanData
} from '../models/membership-plan.model';

@Injectable({
    providedIn: 'root'
})
export class MembershipPlanService {
    private firestoreService = inject(FirestoreService);

    private getPath(gymId: string): string {
        return `gyms/${gymId}/membershipPlans`;
    }

    async getPlans(gymId: string): Promise<MembershipPlan[]> {
        return this.firestoreService.getDocuments<MembershipPlan>(this.getPath(gymId));
    }

    async createPlan(gymId: string, data: CreateMembershipPlanData): Promise<string> {
        const payload: CreateMembershipPlanData = {
            ...data,
            currency: data.currency || 'CRC',
            active: data.active ?? true
        };
        return this.firestoreService.addDocument<CreateMembershipPlanData>(
            this.getPath(gymId),
            payload
        );
    }

    async updatePlan(gymId: string, planId: string, data: UpdateMembershipPlanData): Promise<void> {
        await this.firestoreService.updateDocument<UpdateMembershipPlanData>(
            this.getPath(gymId),
            planId,
            data
        );
    }

    async deletePlan(gymId: string, planId: string): Promise<void> {
        await this.firestoreService.deleteDocument(this.getPath(gymId), planId);
    }
}
