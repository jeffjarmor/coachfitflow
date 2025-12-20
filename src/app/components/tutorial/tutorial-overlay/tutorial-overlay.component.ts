import { Component, inject, computed, effect, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TutorialService } from '../../../services/tutorial.service';
import { ButtonComponent } from '../../ui/button/button.component';

@Component({
    selector: 'app-tutorial-overlay',
    standalone: true,
    imports: [CommonModule, ButtonComponent],
    template: `
        <div *ngIf="tutorialService.state().isActive" class="tutorial-overlay">
            <!-- Backdrop -->
            <div class="tutorial-backdrop" (click)="onBackdropClick()"></div>
            
            <!-- Spotlight highlight -->
            <div #spotlight class="tutorial-spotlight" [style]="spotlightStyle()"></div>
            
            <!-- Tooltip -->
            <div #tooltip class="tutorial-tooltip" [style]="tooltipStyle()" *ngIf="currentStep()">
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
                            *ngIf="tutorialService.state().currentStepIndex > 0"
                            class="btn-secondary" 
                            (click)="onPrevious()">
                            Anterior
                        </button>
                        <app-button 
                            (click)="onNext()"
                            variant="primary">
                            {{ tutorialService.isLastStep() ? 'Finalizar' : 'Siguiente' }}
                        </app-button>
                    </div>
                </div>
            </div>
        </div>
    `,
    styles: [`
        @import 'styles/variables';
        
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
            border-radius: $radius-lg;
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
            border-radius: $radius-lg;
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
                padding: $spacing-6;
                border-bottom: 1px solid $border-light;
                
                h3 {
                    margin: 0;
                    font-size: $font-size-lg;
                    font-weight: $font-weight-semibold;
                    color: $text-primary;
                    flex: 1;
                }
                
                .close-btn {
                    background: none;
                    border: none;
                    font-size: $font-size-xl;
                    color: $text-secondary;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: $radius-md;
                    transition: all 0.2s;
                    
                    &:hover {
                        background: $neutral-100;
                        color: $text-primary;
                    }
                }
            }
            
            .tooltip-body {
                padding: $spacing-6;
                
                p {
                    margin: 0;
                    color: $text-secondary;
                    line-height: 1.6;
                }
            }
            
            .tooltip-footer {
                padding: $spacing-6;
                border-top: 1px solid $border-light;
                
                .progress-indicator {
                    margin-bottom: $spacing-4;
                    
                    .step-counter {
                        display: block;
                        font-size: $font-size-sm;
                        color: $text-secondary;
                        margin-bottom: $spacing-2;
                    }
                    
                    .progress-bar {
                        height: 4px;
                        background: $neutral-200;
                        border-radius: $radius-full;
                        overflow: hidden;
                        
                        .progress-fill {
                            height: 100%;
                            background: $primary-600;
                            transition: width 0.3s ease-out;
                        }
                    }
                }
                
                .tooltip-actions {
                    display: flex;
                    gap: $spacing-3;
                    justify-content: flex-end;
                    
                    .btn-secondary {
                        padding: $spacing-2 $spacing-4;
                        background: white;
                        border: 1px solid $border-light;
                        border-radius: $radius-md;
                        color: $text-primary;
                        font-weight: $font-weight-medium;
                        cursor: pointer;
                        transition: all 0.2s;
                        
                        &:hover {
                            background: $neutral-50;
                            border-color: $neutral-300;
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
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        @keyframes pulse {
            0%, 100% {
                box-shadow: 
                    0 0 0 4px rgba(59, 130, 246, 0.5),
                    0 0 0 9999px rgba(0, 0, 0, 0.7);
            }
            50% {
                box-shadow: 
                    0 0 0 8px rgba(59, 130, 246, 0.3),
                    0 0 0 9999px rgba(0, 0, 0, 0.7);
            }
        }
    `]
})
export class TutorialOverlayComponent {
    tutorialService = inject(TutorialService);

    @ViewChild('spotlight') spotlightEl?: ElementRef<HTMLDivElement>;
    @ViewChild('tooltip') tooltipEl?: ElementRef<HTMLDivElement>;

    currentStep = this.tutorialService.currentStep;

    spotlightStyle = computed(() => {
        const step = this.currentStep();
        if (!step) return {};

        const element = document.querySelector(step.targetSelector);
        if (!element) return { display: 'none' };

        const rect = element.getBoundingClientRect();
        const padding = step.highlightPadding || 8;

        return {
            top: `${rect.top - padding}px`,
            left: `${rect.left - padding}px`,
            width: `${rect.width + padding * 2}px`,
            height: `${rect.height + padding * 2}px`
        };
    });

    tooltipStyle = computed(() => {
        const step = this.currentStep();
        if (!step) return {};

        const element = document.querySelector(step.targetSelector);
        if (!element) return {};

        const rect = element.getBoundingClientRect();
        const tooltipWidth = 400;
        const tooltipHeight = 300; // Approximate
        const spacing = 16;

        let top = 0;
        let left = 0;

        switch (step.position) {
            case 'top':
                top = rect.top - tooltipHeight - spacing;
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                break;
            case 'bottom':
                top = rect.bottom + spacing;
                left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                break;
            case 'left':
                top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
                left = rect.left - tooltipWidth - spacing;
                break;
            case 'right':
                top = rect.top + (rect.height / 2) - (tooltipHeight / 2);
                left = rect.right + spacing;
                break;
            case 'center':
                top = window.innerHeight / 2 - tooltipHeight / 2;
                left = window.innerWidth / 2 - tooltipWidth / 2;
                break;
        }

        // Keep tooltip within viewport
        top = Math.max(spacing, Math.min(top, window.innerHeight - tooltipHeight - spacing));
        left = Math.max(spacing, Math.min(left, window.innerWidth - tooltipWidth - spacing));

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
                setTimeout(() => {
                    const element = document.querySelector(step.targetSelector);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        });
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
