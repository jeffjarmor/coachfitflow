import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { ClientService } from '../../../services/client.service';
import { ToastService } from '../../../services/toast.service';
import { CompetitorService } from '../../../services/competitor.service';
import { Client } from '../../../models/client.model';
import { Coach } from '../../../models/coach.model';
import {
    CompetitorExerciseBlock,
    CompetitorSheet,
    CompetitorWorkoutSheet
} from '../../../models/competitor-sheet.model';
import { CompetitorPdfService } from '../../../services/competitor-pdf.service';

@Component({
    selector: 'app-competitor-sheet',
    standalone: true,
    imports: [CommonModule, FormsModule, PageHeaderComponent, ButtonComponent],
    templateUrl: './competitor-sheet.component.html',
    styleUrls: ['./competitor-sheet.component.scss']
})
export class CompetitorSheetComponent implements OnInit {
    private authService = inject(AuthService);
    private coachService = inject(CoachService);
    private clientService = inject(ClientService);
    private competitorService = inject(CompetitorService);
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private toastService = inject(ToastService);
    private competitorPdfService = inject(CompetitorPdfService);

    loading = true;
    saving = false;
    generatingPdf = false;
    clients: Client[] = [];
    currentCoach: Coach | null = null;
    sheet: CompetitorSheet = this.competitorPdfService.createDefaultSheet();
    isEditMode = false;

    currentStep = 1;
    openBlocks: Record<string, number> = {};

    get totalSteps(): number {
        return this.sheet.workouts.length + 2; // General + Workouts + Resumen
    }

    get stepLabels(): string[] {
        const labels = ['General'];
        this.sheet.workouts.forEach((workout) => labels.push(`Entreno ${workout.key}`));
        labels.push('Resumen');
        return labels;
    }

    async ngOnInit(): Promise<void> {
        this.loading = true;
        try {
            await Promise.all([
                this.loadCoachProfile(),
                this.loadClients()
            ]);

            const sheetId = this.route.snapshot.paramMap.get('id');

            if (sheetId) {
                this.isEditMode = true;
                await this.loadSheet(sheetId);
            } else {
                const preselectedClientId = this.route.snapshot.queryParamMap.get('clientId');
                if (preselectedClientId && this.clients.some((client) => client.id === preselectedClientId)) {
                    this.sheet.clientId = preselectedClientId;
                }
            }

            this.initializeOpenBlocks();
        } catch (error) {
            console.error('Error initializing component:', error);
            this.toastService.error('Error al cargar la página');
        } finally {
            this.loading = false;
        }
    }

    async loadCoachProfile() {
        const userId = this.authService.getCurrentUserId();
        if (userId) {
            this.currentCoach = await this.coachService.getCoachProfile(userId);
        }
    }

    async loadSheet(id: string): Promise<void> {
        try {
            // loading is handled in ngOnInit for initial load
            const userId = this.authService.getCurrentUserId();
            if (!userId) return;

            const sheet = await this.competitorService.getSheet(userId, id, this.currentCoach?.gymId);
            if (sheet) {
                this.sheet = sheet;
            } else {
                this.toastService.error('No se encontró la hoja de competidor.');
                this.router.navigate(['/clients']);
            }
        } catch (error) {
            console.error('Error loading sheet:', error);
            this.toastService.error('Error al cargar la hoja.');
            this.router.navigate(['/clients']);
        }
    }

    async saveSheet(generatePdfAfter: boolean = false): Promise<void> {
        if (!this.sheet.clientId) {
            this.toastService.warning('Selecciona un atleta antes de guardar.');
            return;
        }

        try {
            this.saving = true;
            const userId = this.authService.getCurrentUserId();
            if (!userId) {
                this.toastService.error('Tu sesión no está activa.');
                return;
            }

            const gymId = this.currentCoach?.gymId;

            if (this.isEditMode && this.sheet.id) {
                await this.competitorService.updateSheet(userId, this.sheet.id, this.sheet, gymId);
                this.toastService.success('Hoja actualizada correctamente.');
            } else {
                const id = await this.competitorService.createSheet(userId, this.sheet, gymId);
                this.sheet.id = id;
                this.isEditMode = true;
                this.toastService.success('Hoja guardada correctamente.');
                // Update URL without reloading
                window.history.replaceState({}, '', `/competitor/${id}/edit`);
            }

            if (generatePdfAfter) {
                await this.generatePdf();
            }
        } catch (error) {
            console.error('Error saving sheet:', error);
            this.toastService.error('Error al guardar la hoja (Permisos insuficientes).');
        } finally {
            this.saving = false;
        }
    }

    async generatePdf(): Promise<void> {
        if (!this.sheet.clientId) {
            this.toastService.warning('Selecciona un atleta para generar la hoja.');
            return;
        }

        const selectedClient = this.clients.find((client) => client.id === this.sheet.clientId);
        if (!selectedClient) {
            this.toastService.error('No se encontró el atleta seleccionado.');
            return;
        }

        try {
            this.generatingPdf = true;
            await this.competitorPdfService.generatePdf(this.sheet, selectedClient.name, this.currentCoach);
            this.toastService.success('Hoja de competidor generada correctamente.');
        } catch (error) {
            console.error('Error generating competitor PDF:', error);
            this.toastService.error('No se pudo generar el PDF de competidor.');
        } finally {
            this.generatingPdf = false;
        }
    }

    goToStep(step: number): void {
        if (step < 1 || step > this.totalSteps) {
            return;
        }

        if (step > this.currentStep && !this.canGoNext()) {
            this.toastService.warning('Selecciona un atleta antes de continuar.');
            return;
        }

        this.currentStep = step;
    }

    nextStep(): void {
        if (!this.canGoNext()) {
            this.toastService.warning('Selecciona un atleta antes de continuar.');
            return;
        }
        this.currentStep = Math.min(this.totalSteps, this.currentStep + 1);
    }

    prevStep(): void {
        this.currentStep = Math.max(1, this.currentStep - 1);
    }

    canGoNext(): boolean {
        if (this.currentStep === 1) {
            return !!this.sheet.clientId;
        }
        return true;
    }

    isSummaryStep(): boolean {
        return this.currentStep === this.totalSteps;
    }

    getCurrentWorkoutIndex(): number {
        if (this.currentStep < 2 || this.currentStep > this.totalSteps - 1) {
            return -1;
        }
        return this.currentStep - 2;
    }

    getCurrentWorkout(): CompetitorWorkoutSheet | null {
        const index = this.getCurrentWorkoutIndex();
        if (index < 0 || index >= this.sheet.workouts.length) {
            return null;
        }
        return this.sheet.workouts[index];
    }

    addWorkout(): void {
        const nextLetter = String.fromCharCode(65 + this.sheet.workouts.length);
        const key = /^[A-Z]$/.test(nextLetter) ? nextLetter : `${this.sheet.workouts.length + 1}`;

        this.sheet.workouts.push({
            key,
            title: `ENTRENAMIENTO ${key}`,
            subtitle: 'SIMIL FULL BODY',
            code: 'BFB7',
            blocks: [this.createEmptyBlock()]
        });

        this.openBlocks[key] = 0;
    }

    removeWorkout(index: number): void {
        const removed = this.sheet.workouts[index];
        this.sheet.workouts.splice(index, 1);
        if (removed) {
            delete this.openBlocks[removed.key];
        }
        // Renumber keys if needed or just leave as is?
        // Let's re-letter them to be consistent A, B, C...
        this.sheet.workouts.forEach((workout, i) => {
            const letter = String.fromCharCode(65 + i);
            const newKey = /^[A-Z]$/.test(letter) ? letter : `${i + 1}`;
            if (workout.key !== newKey) {
                const oldKey = workout.key;
                workout.key = newKey;
                workout.title = `ENTRENAMIENTO ${newKey}`; // Optional: Auto-update title
                if (this.openBlocks[oldKey] !== undefined) {
                    this.openBlocks[newKey] = this.openBlocks[oldKey];
                    delete this.openBlocks[oldKey];
                }
            }
        });
    }

    removeCurrentWorkout(): void {
        const index = this.getCurrentWorkoutIndex();
        if (index < 0 || this.sheet.workouts.length <= 1) {
            return;
        }

        const removed = this.sheet.workouts[index];
        this.sheet.workouts.splice(index, 1);
        delete this.openBlocks[removed.key];

        this.currentStep = Math.min(this.currentStep, this.totalSteps - 1);
    }

    toggleBlock(workoutKey: string, blockIndex: number): void {
        this.openBlocks[workoutKey] = this.openBlocks[workoutKey] === blockIndex ? -1 : blockIndex;
    }

    resetTemplate(): void {
        const currentClientId = this.sheet.clientId;
        this.sheet = this.competitorPdfService.createDefaultSheet(currentClientId);
        this.currentStep = 1;
        this.initializeOpenBlocks();
    }

    addWeekPlan(): void {
        const nextWeekNumber = this.sheet.weekPlans.length + 1;
        this.sheet.weekPlans.push({
            weekLabel: `SEMANA ${nextWeekNumber}`,
            workouts: new Array(this.sheet.dayLabels.length).fill('')
        });
    }

    removeWeekPlan(index: number): void {
        this.sheet.weekPlans.splice(index, 1);
    }

    addDayColumn(): void {
        const dayNumber = this.sheet.dayLabels.length + 1;
        this.sheet.dayLabels = [...this.sheet.dayLabels, `Día ${dayNumber}`];
        // Add empty slot to all existing week plans
        this.sheet.weekPlans = this.sheet.weekPlans.map(plan => ({
            ...plan,
            workouts: [...plan.workouts, '']
        }));
    }

    removeDayColumn(dayIndex: number): void {
        if (this.sheet.dayLabels.length <= 1) {
            this.toastService.warning('Debe haber al menos un día en la semana.');
            return;
        }
        this.sheet.dayLabels = this.sheet.dayLabels.filter((_, idx) => idx !== dayIndex);
        // Remove corresponding workout from all week plans
        this.sheet.weekPlans = this.sheet.weekPlans.map(plan => ({
            ...plan,
            workouts: plan.workouts.filter((_, idx) => idx !== dayIndex)
        }));
    }

    trackByIndex(index: number): number {
        return index;
    }

    addExerciseBlock(workoutKey: string): void {
        const workout = this.sheet.workouts.find((item) => item.key === workoutKey);
        if (!workout) return;

        workout.blocks.push(this.createEmptyBlock());
        this.openBlocks[workoutKey] = workout.blocks.length - 1;
    }

    removeExerciseBlock(workoutKey: string, blockIndex: number): void {
        const workout = this.sheet.workouts.find((item) => item.key === workoutKey);
        if (!workout) return;

        workout.blocks.splice(blockIndex, 1);

        if (workout.blocks.length === 0) {
            workout.blocks.push(this.createEmptyBlock());
        }

        this.openBlocks[workoutKey] = Math.min(this.openBlocks[workoutKey] ?? 0, workout.blocks.length - 1);
    }

    getTotalBlocks(): number {
        return this.sheet.workouts.reduce((total, workout) => total + workout.blocks.length, 0);
    }

    getSelectedClientName(): string {
        const selected = this.clients.find((client) => client.id === this.sheet.clientId);
        return selected?.name || 'No seleccionado';
    }

    private initializeOpenBlocks(): void {
        this.openBlocks = {};
        this.sheet.workouts.forEach((workout) => {
            this.openBlocks[workout.key] = 0;
        });
    }

    private createEmptyBlock(): CompetitorExerciseBlock {
        return {
            name: 'NUEVO EJERCICIO',
            note: '',
            microcycles: [
                { series: '2x', reps: '-' },
                { series: '2x', reps: '-' },
                { series: '2x', reps: '-' }
            ],
            rest: ["1' 00''", "1' 00''", "1' 00''"]
        };
    }

    private async loadClients(): Promise<void> {
        try {
            this.loading = true;
            const userId = this.authService.getCurrentUserId();
            if (!userId) {
                this.toastService.error('Tu sesión no está activa.');
                return;
            }

            const coachProfile = await this.coachService.getCoachProfile(userId);
            this.currentCoach = coachProfile;
            const gymId = coachProfile?.gymId;

            this.clients = await this.clientService.getClients(userId, gymId);
        } catch (error) {
            console.error('Error loading clients for competitor mode:', error);
            this.toastService.error('No se pudieron cargar tus atletas.');
        } finally {
            this.loading = false;
        }
    }
}
