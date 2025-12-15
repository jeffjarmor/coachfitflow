import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ClientService } from '../../../services/client.service';
import { RoutineService } from '../../../services/routine.service';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { Client } from '../../../models/client.model';
import { RoutineListComponent } from '../../routines/routine-list/routine-list.component';
import { ClientMeasurementsComponent } from '../../measurements/client-measurements/client-measurements.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';

@Component({
    selector: 'app-client-detail',
    standalone: true,
    imports: [CommonModule, RouterLink, ButtonComponent, RoutineListComponent, ClientMeasurementsComponent, PageHeaderComponent],
    templateUrl: './client-detail.component.html',
    styleUrls: ['./client-detail.component.scss']
})
export class ClientDetailComponent {
    private clientService = inject(ClientService);
    private authService = inject(AuthService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);

    client = signal<Client | null>(null);
    loading = signal<boolean>(true);

    // Confirmation modal state (simple implementation)
    showDeleteConfirm = signal<boolean>(false);

    // Tab state
    activeTab = signal<'routines' | 'measurements'>('routines');

    constructor() {
        // Use effect to load data when user is available
        effect(() => {
            const user = this.authService.currentUser();
            const params = this.route.snapshot.params; // Use snapshot as we are inside effect

            if (user && params['id']) {
                this.loadData(params['id']);
            }
        }, { allowSignalWrites: true });

        this.route.params.subscribe(params => {
            if (params['id'] && this.authService.currentUser()) {
                this.loadData(params['id']);
            }
        });
    }

    async loadData(clientId: string) {
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) return;

        try {
            this.loading.set(true);

            // Load client details
            const clientData = await this.clientService.getClient(coachId, clientId);
            this.client.set(clientData);
        } catch (error) {
            console.error('Error loading client data:', error);
        } finally {
            this.loading.set(false);
        }
    }

    calculateAge(birthDate: any): number {
        if (!birthDate) return 0;
        const dob = birthDate.toDate ? birthDate.toDate() : new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    }

    formatDate(date: any): string {
        if (!date) return '';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    async deleteClient() {
        const clientId = this.client()?.id;
        const coachId = this.authService.getCurrentUserId();
        if (!clientId || !coachId) return;

        try {
            this.loading.set(true);
            await this.clientService.deleteClient(coachId, clientId);
            this.router.navigate(['/clients']);
        } catch (error) {
            console.error('Error deleting client:', error);
            this.loading.set(false);
        }
    }
}
