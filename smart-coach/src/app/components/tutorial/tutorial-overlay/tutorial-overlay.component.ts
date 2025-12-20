import { Component, inject, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TutorialService } from '../../../services/tutorial.service';
import { ButtonComponent } from '../../ui/button/button.component';

@Component({
    selector: 'app-tutorial-overlay',
    standalone: true,
    imports: [CommonModule, ButtonComponent],
    template: `
        <div *ngIf="tutorialService.state().isActive" class="tutorial-overlay">
            
            <!-- Fallback backdrop if no element is highlighted -->
            <div class="tutorial-backdrop" *ngIf="!hasVisibleElement()"></div>

            <!-- Spotlight highlight -->
            <div class="tutorial-spotlight" [style]="spotlightStyle()"></div>
            
            <!-- Tooltip -->
            <div class="tutorial-tooltip" [style]="tooltipStyle()" *ngIf="currentStep()">
                <div class="tooltip-header">
                    <h3>{{ currentStep()?.title }}</h3>
                    <button class="close-btn" (click)="onSkip()" aria-label="Cerrar tutorial">
                        ✕
                    </button>
                </div>
                
                <div class="tooltip-body">
                    <p>{{ currentStep()?.description }}</p>
                </div>
                
                <div class="tooltip-footer">
                    <div class="progress-indicator">
                        <span class="step-counter">
                            Paso {{ tutorialService.state().currentStepIndex + 1 }} de {{ tutorialService.state().totalSteps }}
                        </span>
                        <div class="progress-bar">
                            <div class="progress-fill" [style.width.%]="tutorialService.progress()"></div>
                        </div>
                    </div>
                    
                    <div class="tooltip-actions">
                        <button 
                            *ngIf="tutorialService.state().currentStepIndex > 0 && !currentStep()?.disableNavigation"
                            class="btn-secondary" 
                            (click)="onPrevious()">
                            Anterior
                        </button>
                        <app-button 
                            *ngIf="!currentStep()?.disableNavigation || tutorialService.isLastStep()"
                            (click)="onNext()"
                            variant="primary">
                            {{ tutorialService.isLastStep() ? 'Finalizar' : 'Siguiente' }}
                        </app-button>
                        
                        <app-button 
                            *ngIf="currentStep()?.disableNavigation && !tutorialService.isLastStep()"
                            (click)="onSkip()"
                            variant="primary">
                            Entendido
                        </app-button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        .tutorial-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            pointer-events: none;
        }
        
        .tutorial-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            pointer-events: all;
            animation: fadeIn 0.3s ease-out;
        }
        
        .tutorial-spotlight {
            position: absolute;
            pointer-events: none;
            border-radius: 8px;
            box-shadow: 
                0 0 0 4px rgba(59, 130, 246, 0.5),
                0 0 0 9999px rgba(0, 0, 0, 0.7);
            transition: all 0.3s ease-out;
            z-index: 10000;
            animation: pulse 2s ease-in-out infinite;
        }
        
        .tutorial-tooltip {
            position: absolute;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            max-width: 400px;
            min-width: 320px;
            pointer-events: all;
            z-index: 10001;
            animation: slideIn 0.3s ease-out;
            
            .tooltip-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding: 24px;
                border-bottom: 1px solid #e5e7eb;
                
                h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    flex: 1;
                }
                
                .close-btn {
                    background: none;
                    border: none;
                    font-size: 20px;
                    color: #6b7280;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 6px;
                    transition: all 0.2s;
                    
                    &:hover {
                        background: #f3f4f6;
                        color: #111827;
                    }
                }
            }
            
            .tooltip-body {
                padding: 24px;
                
                p {
                    margin: 0;
                    font-size: 16px;
                    line-height: 1.5;
                    color: #4b5563;
                }
            }
            
            .tooltip-footer {
                padding: 24px;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
                border-radius: 0 0 12px 12px;
                
                .progress-indicator {
                    margin-bottom: 16px;
                    
                    .step-counter {
                        display: block;
                        font-size: 12px;
                        font-weight: 500;
                        color: #6b7280;
                        margin-bottom: 8px;
                    }
                    
                    .progress-bar {
                        height: 4px;
                        background: #e5e7eb;
                        border-radius: 2px;
                        overflow: hidden;
                        
                        .progress-fill {
                            height: 100%;
                            background: #3b82f6;
                            transition: width 0.3s ease;
                        }
                    }
                }
                
                .tooltip-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    
                    .btn-secondary {
                        padding: 8px 16px;
                        background: white;
                        border: 1px solid #d1d5db;
                        border-radius: 6px;
                        color: #374151;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s;
                        
                        &:hover {
                            background: #f3f4f6;
                            border-color: #9ca3af;
                        }
                    }
                }
            }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes slideIn {
            from { 
                opacity: 0;
                transform: translateY(10px);
            }
            to { 
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4), 0 0 0 9999px rgba(0, 0, 0, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0), 0 0 0 9999px rgba(0, 0, 0, 0.7); }
            100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0), 0 0 0 9999px rgba(0, 0, 0, 0.7); }
        }
        
        @media (max-width: 768px) {
            .tutorial-tooltip {
                width: auto;
                max-width: none;
                
                .tooltip-header, .tooltip-body, .tooltip-footer {
                    padding: 16px;
                }
                
                .tooltip-footer .tooltip-actions {
                    flex-direction: column-reverse;
                    
                    button, app-button {
                        width: 100%;
                    }
                    
                    ::ng-deep button {
                        width: 100%;
                    }
                }
            }
        }
    `]
})
export class TutorialOverlayComponent {
    tutorialService = inject(TutorialService);
    currentStep = computed(() => {
        const state = this.tutorialService.state();
        if (!state.isActive || !state.currentModule) return null;

        const module = this.tutorialService.getModule(state.currentModule);
        if (!module || !module.steps[state.currentStepIndex]) return null;

        return module.steps[state.currentStepIndex];
    });

    private domUpdate = signal(0);

    hasVisibleElement = computed(() => {
        this.domUpdate();
        const step = this.currentStep();
        if (!step) return false;
        return !!this.findVisibleElement(step.targetSelector);
    });

    spotlightStyle = computed(() => {
        // Depend on domUpdate to force recalculation
        this.domUpdate();

        const step = this.currentStep();
        if (!step) return { display: 'none' };

        const element = this.findVisibleElement(step.targetSelector);
        if (!element) return { display: 'none' };

        const rect = element.getBoundingClientRect();
        const padding = step.highlightPadding || 10;

        return {
            top: `${rect.top - padding}px`,
            left: `${rect.left - padding}px`,
            width: `${rect.width + (padding * 2)}px`,
            height: `${rect.height + (padding * 2)}px`
        };
    });

    tooltipStyle = computed(() => {
        // Depend on domUpdate to force recalculation
        this.domUpdate();

        const step = this.currentStep();
        if (!step) return { display: 'none' };

        const element = this.findVisibleElement(step.targetSelector);
        if (!element) {
            // If element not found, center the tooltip
            return {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                position: 'fixed'
            };
        }

        const rect = element.getBoundingClientRect();
        const padding = step.highlightPadding || 10;
        const tooltipWidth = 320; // Approximate width

        // Calculate position based on preference
        let top = 0;
        let left = 0;

        // Simple positioning logic (can be improved)
        switch (step.position) {
            case 'bottom':
                top = rect.bottom + padding + 20;
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                break;
            case 'top':
                top = rect.top - padding - 200; // Approximate height
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                break;
            case 'left':
                top = rect.top;
                left = rect.left - padding - tooltipWidth - 20;
                break;
            case 'right':
                top = rect.top;
                left = rect.right + padding + 20;
                break;
            case 'center':
            default:
                return {
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    position: 'fixed'
                };
        }

        // Boundary checks (keep on screen)
        if (left < 20) left = 20;
        if (left + tooltipWidth > window.innerWidth - 20) left = window.innerWidth - tooltipWidth - 20;
        if (top < 20) top = 20;

        // Mobile adjustments
        if (window.innerWidth <= 768) {
            return {
                position: 'fixed',
                bottom: '20px',
                left: '20px',
                right: '20px',
                width: 'auto',
                maxWidth: 'none',
                top: 'auto',
                transform: 'none',
                'z-index': '10001' // Ensure tooltip is above everything
            };
        }

        return {
            top: `${top}px`,
            left: `${left}px`
        };
    });

    constructor() {
        // Scroll highlighted element into view when step changes
        effect(() => {
            const step = this.currentStep();
            if (step) {
                // Small delay to allow DOM to update and animations to finish
                setTimeout(() => {
                    this.domUpdate.update(v => v + 1);

                    const element = this.findVisibleElement(step.targetSelector);
                    if (element) {
                        const isMobile = window.innerWidth <= 768;
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        // On mobile, wait a bit longer for scroll to complete
                        if (isMobile) {
                            setTimeout(() => {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }, 400);
                        }
                    }
                }, 300);
            }
        });
    }

    private findVisibleElement(selector: string): Element | null {
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            const style = window.getComputedStyle(el);
            if ((el.offsetWidth > 0 || el.offsetHeight > 0) &&
                style.display !== 'none' &&
                style.visibility !== 'hidden') {
                return el;
            }
        }
        return null;
    }

    onNext(): void {
        this.tutorialService.nextStep();
    }

    onPrevious(): void {
        this.tutorialService.previousStep();
    }

    onSkip(): void {
        this.tutorialService.skipTutorial();
    }

    onBackdropClick(): void {
        // Optionally skip on backdrop click
        // this.onSkip();
    }
}
