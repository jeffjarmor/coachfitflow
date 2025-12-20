export interface TutorialStep {
    title: string;
    description: string;
    targetSelector: string; // CSS selector for spotlight
    position: 'top' | 'bottom' | 'left' | 'right' | 'center';
    action?: 'click' | 'none'; // Expected user action
    highlightPadding?: number; // Extra padding around highlighted element
    disableNavigation?: boolean;
}

export interface TutorialModule {
    id: string;
    name: string;
    description: string;
    steps: TutorialStep[];
}

export interface TutorialState {
    isActive: boolean;
    currentModule: string | null;
    currentStepIndex: number;
    totalSteps: number;
}

export interface TutorialProgress {
    [moduleId: string]: boolean; // true if completed
}
