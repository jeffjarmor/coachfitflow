import { Component, inject, signal, computed, OnInit, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { RoutineService } from '../../../services/routine.service';
import { ConfirmService } from '../../../services/confirm.service';
import { CanComponentDeactivate } from '../../../guards/can-deactivate.guard';
import { ButtonComponent } from '../../../components/ui/button/button.component';
import { PageHeaderComponent } from '../../../components/navigation/page-header/page-header.component';
import { TutorialButtonComponent } from '../../../components/tutorial/tutorial-button/tutorial-button.component';
import { TutorialService } from '../../../services/tutorial.service';

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

    currentStep = computed(() => this.routineService.wizardState().step);
    wizardState = this.routineService.wizardState;

    // Computed validity for the current step
    isStepValid = computed(() => {
        const state = this.wizardState();
        const step = this.currentStep();

        switch (step) {
            case 1: return !!state.clientId;
            case 2: return !!state.routineName && !!state.daysCount && state.daysCount > 0 && !!state.durationWeeks && state.durationWeeks > 0;
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

    constructor() {
        // No auto-start or sync effect needed for contextual mode
    }

    // Admin mode properties
    adminMode = signal(false);
    targetCoachId = signal<string | null>(null);
    targetClientId = signal<string | null>(null);

    ngOnInit() {
        // Check if we're in admin mode (route params from admin)
        this.route.paramMap.subscribe(params => {
            const coachId = params.get('coachId');
            const clientId = params.get('clientId');

            if (coachId && clientId) {
                // Admin mode: creating routine for another coach's client
                this.adminMode.set(true);
                this.targetCoachId.set(coachId);
                this.targetClientId.set(clientId);
                this.routineService.updateWizardState({ clientId });
            }
        });

        // Check for clientId query param to pre-select client (normal mode)
        this.route.queryParams.subscribe(params => {
            if (params['clientId'] && !this.adminMode()) {
                this.routineService.updateWizardState({ clientId: params['clientId'] });
            }
        });
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
            this.navigateExit();
        } else {
            this.routineService.goToStep(this.currentStep() - 1);
        }
    }

    async goBack() {
        // Always go back to dashboard from header button
        const confirmed = await this.confirmService.confirm({
            title: '¿Salir del asistente?',
            message: '¿Estás seguro de que quieres salir? Tu progreso se perderá.',
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
        }
    }

    canDeactivate(): boolean {
        // If user is navigating away from wizard (browser back, etc.)
        // Show confirmation if there's any progress
        const state = this.wizardState();
        if (state.step > 1 || state.clientId || state.routineName) {
            return confirm('¿Estás seguro de que quieres salir? Tu progreso se perderá.');
        }
        return true;
    }
}
