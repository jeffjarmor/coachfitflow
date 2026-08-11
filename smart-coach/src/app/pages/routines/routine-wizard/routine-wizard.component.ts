import { Component, inject, signal, computed, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { RoutineService } from '../../../services/routine.service';
import { ConfirmService } from '../../../services/confirm.service';
import { CanComponentDeactivate } from '../../../guards/can-deactivate.guard';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';
import { AuthService } from '../../../services/auth.service';
import { ClientService } from '../../../services/client.service';
import { CoachService } from '../../../services/coach.service';

import { Step4ExercisesComponent } from './steps/step4-exercises/step4-exercises.component';
import { Step6PreviewComponent } from './steps/step6-preview/step6-preview.component';
import { Step3MuscleGroupsComponent } from './steps/step3-muscle-groups/step3-muscle-groups.component';
import { Step1ClientComponent } from './steps/step1-client/step1-client.component';
import { Step2BasicInfoComponent } from './steps/step2-basic-info/step2-basic-info.component';


@Component({
    selector: 'app-routine-wizard',
    standalone: true,
    imports: [
        CommonModule,
        ButtonComponent,
        PageHeaderComponent,
        Step1ClientComponent,
        Step2BasicInfoComponent,
        Step3MuscleGroupsComponent,
        Step4ExercisesComponent,
        Step6PreviewComponent,
        TutorialButtonComponent
    ],
    templateUrl: './routine-wizard.component.html',
    styleUrls: ['./routine-wizard.component.scss']
})
export class RoutineWizardComponent implements OnInit, CanComponentDeactivate {
    private routineService = inject(RoutineService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private confirmService = inject(ConfirmService);
    private tutorialService = inject(TutorialService);
    private authService = inject(AuthService);
    private clientService = inject(ClientService);
    private coachService = inject(CoachService);
    private draftKey: string | null = null;
    private draftCoachScope: string | null = null;
    private activeDraftClientId: string | null = null;
    private draftPersistenceReady = false;

    currentStep = computed(() => this.routineService.wizardState().step);
    wizardState = this.routineService.wizardState;

    // Computed validity for the current step
    isStepValid = computed(() => {
        const state = this.wizardState();
        const step = this.currentStep();

        switch (step) {
            case 1: return !!state.clientId;
            case 2:
                return !!state.routineName &&
                    !!state.daysCount && state.daysCount > 0 &&
                    !!state.durationWeeks && state.durationWeeks > 0 &&
                    !!state.startDate &&
                    !!state.endDate;
            case 3:
                // Valid if all days have at least one muscle group AND at least one exercise assigned
                return state.days.length === state.daysCount &&
                    state.days.every(d => d.muscleGroups.length > 0 && d.exercises.length > 0);
            case 4:
                // Valid if at least one exercise is selected
                return state.selectedExercises.length > 0;
            case 5:
                // Preview step is valid if we have days with exercises
                // We allow saving even if some days are empty, but maybe show a warning
                return true;
            default: return false;
        }
    });

    // Admin mode properties
    adminMode = signal(false);
    targetCoachId = signal<string | null>(null);
    targetClientId = signal<string | null>(null);

    constructor() {
        effect(() => {
            const clientId = this.wizardState().clientId || null;

            if (
                !this.draftPersistenceReady ||
                !this.draftCoachScope ||
                !clientId ||
                clientId === this.activeDraftClientId
            ) {
                return;
            }

            this.activeDraftClientId = clientId;
            this.draftKey = this.routineService.getWizardDraftKey(`${this.draftCoachScope}:${clientId}`);
            this.routineService.setWizardDraftKey(this.draftKey);
        });
    }

    async ngOnInit() {
        const coachId = this.route.snapshot.paramMap.get('coachId');
        const clientId = this.route.snapshot.paramMap.get('clientId');
        const queryClientId = this.route.snapshot.queryParamMap.get('clientId');
        const explicitClientId = clientId || queryClientId || null;

        await this.authService.waitForAuthReady();

        if (coachId && clientId) {
            // Admin mode: creating routine for another coach's client
            this.adminMode.set(true);
            this.targetCoachId.set(coachId);
            this.targetClientId.set(clientId);
        }

        await this.configureDraftPersistence(coachId, explicitClientId);
    }

    private async configureDraftPersistence(coachId: string | null, clientId: string | null): Promise<void> {
        const currentCoachId = coachId || this.authService.getCurrentUserId() || 'anonymous';
        this.draftCoachScope = currentCoachId;
        this.activeDraftClientId = clientId;
        this.draftPersistenceReady = false;
        this.routineService.setWizardDraftKey(null);
        this.routineService.resetWizardState(false);

        if (!clientId) {
            this.draftKey = null;
            this.draftPersistenceReady = true;
            return;
        }

        this.draftKey = this.routineService.getWizardDraftKey(`${currentCoachId}:${clientId}`);
        this.routineService.restoreWizardDraft(this.draftKey, { expectedClientId: clientId });
        this.routineService.updateWizardState({ clientId });
        await this.syncClientName(currentCoachId, clientId);
        this.routineService.setWizardDraftKey(this.draftKey);
        this.draftPersistenceReady = true;
    }

    private async syncClientName(coachId: string, clientId: string): Promise<void> {
        try {
            const coach = await this.coachService.getCoachProfile(coachId);
            const client = await this.clientService.getClient(coachId, clientId, coach?.gymId || undefined);
            if (client?.name) {
                this.routineService.updateWizardState({ clientName: client.name });
            }
        } catch (error) {
            console.error('Error syncing wizard client name:', error);
        }
    }

    getStepTitle(): string {
        switch (this.currentStep()) {
            case 1: return 'Seleccionar Cliente';
            case 2: return 'Detalles de la Rutina';
            case 3: return 'Planificación';
            case 4: return 'Configuración';
            case 5: return 'Vista Previa y Guardar';
            default: return '';
        }
    }

    nextStep() {
        if (this.currentStep() < 5 && this.isStepValid()) {
            this.routineService.goToStep(this.currentStep() + 1);
        }
    }

    prevStep() {
        if (this.currentStep() === 1) {
            // Cancel and go back
            this.routineService.resetWizard();
            this.navigateExit();
        } else {
            this.routineService.goToStep(this.currentStep() - 1);
        }
    }

    async goBack() {
        // Always go back to dashboard from header button
        const confirmed = await this.confirmService.confirm({
            title: '¿Salir del asistente?',
            message: '¿Estás seguro de que quieres salir? Se limpiará el borrador guardado.',
            confirmText: 'Salir',
            cancelText: 'Continuar',
            type: 'warning'
        });

        if (confirmed) {
            this.routineService.resetWizard();
            this.navigateExit();
        }
    }

    private navigateExit() {
        if (this.adminMode()) {
            this.router.navigate(['/admin/clients', this.targetCoachId(), this.targetClientId()]);
        } else {
            this.router.navigate(['/dashboard']);
        }
    }

    startTutorial() {
        // Contextual tutorial: Start directly at the step corresponding to the current wizard step
        // Wizard Step 1 -> Tutorial Step 1 (Client Select)
        // Wizard Step 2 -> Tutorial Step 2 (Basic Info)
        // ...
        const currentWizardStep = this.currentStep();
        this.tutorialService.startTutorial('routine-wizard', currentWizardStep);
    }

    // Method to be called from wizard footer Save button
    step6PreviewComponent?: Step6PreviewComponent;

    registerStep6Component(component: Step6PreviewComponent) {
        this.step6PreviewComponent = component;
    }

    async saveAndGeneratePdf() {
        if (this.step6PreviewComponent) {
            await this.step6PreviewComponent.saveRoutine(true);
            if (this.draftKey) {
                this.routineService.clearWizardDraft(this.draftKey);
            }
        }
    }

    canDeactivate(): boolean {
        // If user is navigating away from wizard (browser back, etc.)
        // Show confirmation if there's any progress
        const state = this.wizardState();
        if (state.step > 1 || state.clientId || state.routineName) {
            return confirm('¿Quieres salir del asistente? Tu progreso quedará guardado como borrador en este navegador.');
        }
        return true;
    }
}
