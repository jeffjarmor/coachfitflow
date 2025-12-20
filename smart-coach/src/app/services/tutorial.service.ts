import { Injectable, signal, computed } from '@angular/core';
import { TutorialModule, TutorialState, TutorialProgress, TutorialStep } from '../models/tutorial.model';
import { getTutorialModule } from '../config/tutorial-config';

const STORAGE_KEY = 'tutorial_progress';

@Injectable({
    providedIn: 'root'
})
export class TutorialService {
    // State signals
    private _state = signal<TutorialState>({
        isActive: false,
        currentModule: null,
        currentStepIndex: 0,
        totalSteps: 0
    });

    private _currentModule = signal<TutorialModule | null>(null);

    // Public computed signals
    state = this._state.asReadonly();
    currentModule = this._currentModule.asReadonly();

    currentStep = computed<TutorialStep | null>(() => {
        const module = this._currentModule();
        const state = this._state();

        if (!module || state.currentStepIndex >= module.steps.length) {
            return null;
        }

        return module.steps[state.currentStepIndex];
    });

    isLastStep = computed<boolean>(() => {
        const state = this._state();
        return state.currentStepIndex === state.totalSteps - 1;
    });

    progress = computed<number>(() => {
        const state = this._state();
        if (state.totalSteps === 0) return 0;
        return ((state.currentStepIndex + 1) / state.totalSteps) * 100;
    });

    /**
     * Check if a tutorial has been completed
     */
    isTutorialCompleted(moduleId: string): boolean {
        const progress = this.getProgress();
        return progress[moduleId] === true;
    }

    /**
     * Get a tutorial module by ID
     */
    getModule(moduleId: string): TutorialModule | undefined {
        return getTutorialModule(moduleId);
    }

    /**
     * Start a tutorial for a specific module
     */
    startTutorial(moduleId: string, initialStepIndex: number = 0): boolean {
        const module = getTutorialModule(moduleId);

        if (!module || module.steps.length === 0) {
            console.warn(`Tutorial module "${moduleId}" not found or has no steps`);
            return false;
        }

        // Validate initialStepIndex
        if (initialStepIndex < 0 || initialStepIndex >= module.steps.length) {
            initialStepIndex = 0;
        }

        this._currentModule.set(module);
        this._state.set({
            isActive: true,
            currentModule: moduleId,
            currentStepIndex: initialStepIndex,
            totalSteps: module.steps.length
        });

        return true;
    }

    /**
     * Advance to the next step
     */
    nextStep(): void {
        const state = this._state();

        if (!state.isActive) return;

        const nextIndex = state.currentStepIndex + 1;

        if (nextIndex >= state.totalSteps) {
            // Tutorial completed
            this.completeTutorial();
        } else {
            this._state.update(s => ({
                ...s,
                currentStepIndex: nextIndex
            }));
        }
    }

    /**
     * Go to previous step
     */
    previousStep(): void {
        const state = this._state();

        if (!state.isActive || state.currentStepIndex === 0) return;

        this._state.update(s => ({
            ...s,
            currentStepIndex: s.currentStepIndex - 1
        }));
    }

    /**
     * Go to a specific step index
     */
    goToStep(index: number): void {
        const state = this._state();

        if (!state.isActive || index < 0 || index >= state.totalSteps) return;

        // Prevent redundant updates and infinite loops
        if (state.currentStepIndex === index) return;

        this._state.update(s => ({
            ...s,
            currentStepIndex: index
        }));
    }

    /**
     * Skip the current tutorial
     */
    skipTutorial(): void {
        this.stopTutorial();
    }

    /**
     * Complete the current tutorial and mark it as done
     */
    private completeTutorial(): void {
        const state = this._state();

        if (state.currentModule) {
            this.markTutorialCompleted(state.currentModule);
        }

        this.stopTutorial();
    }

    /**
     * Stop the tutorial without marking as completed
     */
    private stopTutorial(): void {
        this._state.set({
            isActive: false,
            currentModule: null,
            currentStepIndex: 0,
            totalSteps: 0
        });
        this._currentModule.set(null);
    }

    /**
     * Reset a specific tutorial (mark as not completed)
     */
    resetTutorial(moduleId: string): void {
        const progress = this.getProgress();
        delete progress[moduleId];
        this.saveProgress(progress);
    }

    /**
     * Reset all tutorials
     */
    resetAllTutorials(): void {
        localStorage.removeItem(STORAGE_KEY);
    }

    /**
     * Mark a tutorial as completed
     */
    private markTutorialCompleted(moduleId: string): void {
        const progress = this.getProgress();
        progress[moduleId] = true;
        this.saveProgress(progress);
    }

    /**
     * Get tutorial progress from localStorage
     */
    private getProgress(): TutorialProgress {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error reading tutorial progress:', error);
            return {};
        }
    }

    /**
     * Save tutorial progress to localStorage
     */
    private saveProgress(progress: TutorialProgress): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        } catch (error) {
            console.error('Error saving tutorial progress:', error);
        }
    }
}
