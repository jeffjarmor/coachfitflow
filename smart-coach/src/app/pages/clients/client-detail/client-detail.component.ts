import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ClientService } from '../../../services/client.service';
import { CoachService } from '../../../services/coach.service';
import { RoutineService } from '../../../services/routine.service';
import { CompetitorService } from '../../../services/competitor.service';
import { AuthService } from '../../../services/auth.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { Client } from '../../../models/client.model';
import { CompetitorSheet } from '../../../models/competitor-sheet.model';
import { RoutineListComponent } from '../../routines/routine-list/routine-list.component';
import { ClientMeasurementsComponent } from '../../measurements/client-measurements/client-measurements.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';
import { ToastService } from '../../../services/toast.service';

@Component({
    selector: 'app-client-detail',
    standalone: true,
    imports: [CommonModule, RouterLink, ButtonComponent, RoutineListComponent, ClientMeasurementsComponent, PageHeaderComponent, TutorialButtonComponent],
    templateUrl: './client-detail.component.html',
    styleUrls: ['./client-detail.component.scss']
})
export class ClientDetailComponent {
    private clientService = inject(ClientService);
    private authService = inject(AuthService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private tutorialService = inject(TutorialService);
    private coachService = inject(CoachService);
    private competitorService = inject(CompetitorService);
    private toastService = inject(ToastService);

    client = signal<Client | null>(null);
    loading = signal<boolean>(true);
    competitorSheets = signal<CompetitorSheet[]>([]);

    // Confirmation modal state (simple implementation)
    showDeleteConfirm = signal<boolean>(false);
    showDeleteSheetConfirm = signal<string | null>(null);

    // Tab state
    activeTab = signal<'routines' | 'measurements' | 'competitor'>('routines');

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

            // Get coach profile to determine gymId
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            // Load client details with potential gymId
            const clientData = await this.clientService.getClient(coachId, clientId, gymId);
            this.client.set(clientData);

            // Load competitor sheets
            const sheets = await this.competitorService.getSheetsByClient(coachId, clientId, gymId);
            this.competitorSheets.set(sheets);
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
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            await this.clientService.deleteClient(coachId, clientId, gymId);
            this.router.navigate(['/clients']);
        } catch (error) {
            console.error('Error deleting client:', error);
            this.loading.set(false);
        }
    }

    async deleteCompetitorSheet(sheetId: string) {
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) return;

        try {
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            await this.competitorService.deleteSheet(coachId, sheetId, gymId);
            this.toastService.success('Hoja eliminada correctamente');

            // Refresh list
            const clientId = this.client()?.id;
            if (clientId) {
                const sheets = await this.competitorService.getSheetsByClient(coachId, clientId, gymId);
                this.competitorSheets.set(sheets);
            }
            this.showDeleteSheetConfirm.set(null);
        } catch (error) {
            console.error('Error deleting sheet:', error);
            this.toastService.error('Error al eliminar la hoja');
        }
    }

    startTutorial() {
        this.tutorialService.startTutorial('client-detail');
    }
}
