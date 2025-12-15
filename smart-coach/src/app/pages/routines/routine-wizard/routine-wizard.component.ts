import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { RoutineService } from '../../../services/routine.service';
import { ConfirmService } from '../../../services/confirm.service';
import { ButtonComponent } from '../../../components/ui/button/button.component';

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
        Step1ClientComponent,
        Step2BasicInfoComponent,
        Step3MuscleGroupsComponent,
        Step4ExercisesComponent,
        Step6PreviewComponent
    ],
    templateUrl: './routine-wizard.component.html',
    styleUrls: ['./routine-wizard.component.scss']
})
export class RoutineWizardComponent implements OnInit {
    private routineService = inject(RoutineService);
    private router = inject(Router);
    private route = inject(ActivatedRoute);
    private confirmService = inject(ConfirmService);

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
                // Valid if all days have at least one muscle group assigned
                return state.days.length === state.daysCount && state.days.every(d => d.muscleGroups.length > 0);
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

    ngOnInit() {
        // Check for clientId query param to pre-select client
        this.route.queryParams.subscribe(params => {
            if (params['clientId']) {
                this.routineService.updateWizardState({ clientId: params['clientId'] });
            }
        });
    }

    nextStep() {
        if (this.currentStep() < 5 && this.isStepValid()) {
            this.routineService.goToStep(this.currentStep() + 1);
        }
    }

    prevStep() {
        if (this.currentStep() === 1) {
            // Cancel and go back to dashboard
            this.router.navigate(['/dashboard']);
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
            this.router.navigate(['/dashboard']);
        }
    }
}
