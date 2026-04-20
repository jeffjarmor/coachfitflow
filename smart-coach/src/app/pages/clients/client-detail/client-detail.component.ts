import { Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ClientService } from '../../../services/client.service';
import { CoachService } from '../../../services/coach.service';
import { CompetitorService } from '../../../services/competitor.service';
import { AuthService } from '../../../services/auth.service';
import { GymService } from '../../../services/gym.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { Client } from '../../../models/client.model';
import { CompetitorSheet } from '../../../models/competitor-sheet.model';
import { RoutineListComponent } from '../../routines/routine-list/routine-list.component';
import { ClientMeasurementsComponent } from '../../measurements/client-measurements/client-measurements.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';
import { ToastService } from '../../../services/toast.service';
import { isPaidIndependentCoach } from '../../../models/coach.model';
import { TrainingLogService } from '../../../services/training-log.service';
import { TrainingHistoryItem, TrainingSessionSet } from '../../../models/training-log.model';

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
    private gymService = inject(GymService);
    private competitorService = inject(CompetitorService);
    private toastService = inject(ToastService);
    private trainingLogService = inject(TrainingLogService);

    client = signal<Client | null>(null);
    loading = signal<boolean>(true);
    resendingInvite = signal<boolean>(false);
    competitorSheets = signal<CompetitorSheet[]>([]);
    trainingHistory = signal<TrainingHistoryItem[]>([]);
    rirEnabled = signal<boolean>(false);
    expandedRirSessions = signal<Record<string, boolean>>({});

    // Confirmation modal state (simple implementation)
    showDeleteConfirm = signal<boolean>(false);
    showDeleteSheetConfirm = signal<string | null>(null);

    // Tab state
    activeTab = signal<'routines' | 'measurements' | 'competitor' | 'rir'>('routines');
    private lastLoadedClientId: string | null = null;
    private lastLoadedCoachId: string | null = null;
    private loadInProgress = false;
    private historyRefreshTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        this.route.params.subscribe(params => {
            if (params['id']) this.tryLoadData(params['id']);
        });
    }

    private async tryLoadData(clientId: string): Promise<void> {
        await this.authService.waitForAuthReady();
        const coachId = this.authService.getCurrentUserId();
        if (!coachId) return;

        // Avoid reloading when the same client is already loaded (e.g. tab visibility/auth refresh events).
        if (
            this.client()?.id === clientId &&
            this.lastLoadedClientId === clientId &&
            this.lastLoadedCoachId === coachId &&
            !this.loadInProgress
        ) {
            return;
        }

        await this.loadData(clientId, coachId);
    }

    private async loadData(clientId: string, coachId: string) {
        if (this.loadInProgress) return;
        this.loadInProgress = true;

        try {
            this.loading.set(true);

            // Get coach profile to determine gymId
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            // Load client details with potential gymId
            const clientData = await this.clientService.getClient(coachId, clientId, gymId);
            this.client.set(clientData);
            this.rirEnabled.set(!gymId && isPaidIndependentCoach(coachProfile));

            // Load competitor sheets
            const sheets = await this.competitorService.getSheetsByClient(coachId, clientId, gymId);
            this.competitorSheets.set(sheets);

            if (clientData && this.rirEnabled()) {
                await this.loadTrainingHistory(coachId, clientId, gymId);
                this.startHistoryAutoRefresh(coachId, clientId, gymId);
            } else {
                this.trainingHistory.set([]);
                this.stopHistoryAutoRefresh();
            }
            this.lastLoadedClientId = clientId;
            this.lastLoadedCoachId = coachId;
        } catch (error) {
            console.error('Error loading client data:', error);
        } finally {
            this.loading.set(false);
            this.loadInProgress = false;
        }
    }

    formatSessionDate(date: any): string {
        if (!date) return '—';
        const d = new Date(date);
        return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    getCompletedSetCount(item: TrainingHistoryItem): number {
        return item.sets.filter((set) => set.actualReps != null || set.rir != null || set.load != null).length;
    }

    getAverageRir(item: TrainingHistoryItem): string {
        const validRirs = item.sets
            .map((set) => set.rir)
            .filter((rir): rir is number => typeof rir === 'number');

        if (validRirs.length === 0) return '—';
        const avg = validRirs.reduce((sum, value) => sum + value, 0) / validRirs.length;
        return avg % 1 === 0 ? `${avg}` : avg.toFixed(1);
    }

    getGroupedExerciseSets(item: TrainingHistoryItem): Array<{ exerciseName: string; sets: TrainingSessionSet[] }> {
        const groups = new Map<string, TrainingSessionSet[]>();

        for (const set of item.sets) {
            const key = `${set.exerciseOrder}:${set.exerciseName}`;
            const current = groups.get(key) || [];
            current.push(set);
            groups.set(key, current);
        }

        return Array.from(groups.entries()).map(([key, sets]) => ({
            exerciseName: key.split(':').slice(1).join(':'),
            sets: sets.sort((a, b) => a.setNumber - b.setNumber)
        }));
    }

    formatSetLoad(set: TrainingSessionSet): string {
        if (set.load == null) return '—';
        return `${set.load} ${set.loadUnit || 'kg'}`;
    }

    toggleRirSession(sessionId: string): void {
        this.expandedRirSessions.update((current) => ({
            ...current,
            [sessionId]: !current[sessionId]
        }));
    }

    isRirSessionExpanded(sessionId: string): boolean {
        return !!this.expandedRirSessions()[sessionId];
    }

    private async loadTrainingHistory(coachId: string, clientId: string, gymId?: string | null): Promise<void> {
        const history = await this.trainingLogService.getClientTrainingHistory(coachId, clientId, {
            gymId
        });
        this.trainingHistory.set(history);
        this.expandedRirSessions.update((current) => {
            const next = { ...current };
            history.forEach((item, index) => {
                if (next[item.session.id] === undefined) {
                    next[item.session.id] = index === 0;
                }
            });
            return next;
        });
    }

    private startHistoryAutoRefresh(coachId: string, clientId: string, gymId?: string | null): void {
        this.stopHistoryAutoRefresh();
        this.historyRefreshTimer = setInterval(() => {
            if (this.activeTab() !== 'rir') return;
            void this.loadTrainingHistory(coachId, clientId, gymId);
        }, 5000);
    }

    private stopHistoryAutoRefresh(): void {
        if (this.historyRefreshTimer) {
            clearInterval(this.historyRefreshTimer);
            this.historyRefreshTimer = null;
        }
    }

    ngOnDestroy(): void {
        this.stopHistoryAutoRefresh();
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

    async resendPortalInvite() {
        const client = this.client();
        const coachId = this.authService.getCurrentUserId();
        if (!client?.id || !client.email || !coachId) return;

        try {
            this.resendingInvite.set(true);
            const coachProfile = await this.coachService.getCoachProfile(coachId);
            const gymId = coachProfile?.gymId;

            if (gymId) {
                const gym = await this.gymService.getGym(gymId);
                const gymName = gym?.name || 'tu gimnasio';
                await this.authService.inviteGymClient(gymId, client.id, client.email, gymName, { skipSignup: true });
            } else if (isPaidIndependentCoach(coachProfile)) {
                await this.authService.inviteIndependentClient(
                    coachId,
                    client.id,
                    client.email,
                    coachProfile?.name || 'tu entrenador',
                    { skipSignup: true }
                );
            } else {
                this.toastService.error('Esta función requiere entrenador pago o contexto de gimnasio.');
                return;
            }
            this.toastService.success('Invitación reenviada al correo del cliente.');
        } catch (error) {
            console.error('Error resending client portal invite:', error);
            const code = (error as any)?.code;
            const message = (error as any)?.message || '';
            if (code === 'INVITE_RATE_LIMIT' || /rate limit|429/i.test(message)) {
                this.toastService.show?.(message || 'Límite temporal de envíos alcanzado. Intenta en 1-2 minutos.', 'warning');
            } else {
                this.toastService.error('No se pudo reenviar la invitación. Inténtalo de nuevo.');
            }
        } finally {
            this.resendingInvite.set(false);
        }
    }
}
