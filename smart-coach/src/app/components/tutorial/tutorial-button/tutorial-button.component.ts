import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-tutorial-button',
    standalone: true,
    imports: [CommonModule],
    template: `
        <button 
            class="tutorial-help-btn"
            (click)="onClick()"
            [attr.aria-label]="ariaLabel"
            [title]="tooltip">
            <span class="icon">?</span>
        </button>
    `,
    styles: [`
        @import 'styles/variables';
        
        .tutorial-help-btn {
            position: fixed !important;
            bottom: 24px !important;
            right: 24px !important;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: $primary-500;
            color: $text-on-primary;
            border: 1px solid rgba($primary-500, 0.7);
            box-shadow: 0 12px 26px rgba($primary-500, 0.28), 0 8px 22px rgba(0, 0, 0, 0.45);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            z-index: 99999 !important;
            
            .icon {
                font-size: 24px;
                font-weight: 700;
            }
            
            &:hover {
                background: $primary-400;
                transform: scale(1.05);
                box-shadow: 0 18px 34px rgba($primary-500, 0.34), 0 12px 26px rgba(0, 0, 0, 0.5);
            }
            
            &:active {
                transform: scale(0.95);
            }
        }
        
        
        @media (max-width: 768px) {
            .tutorial-help-btn {
                /* Position above mobile bottom nav (60px) + spacing + safe area */
                bottom: calc(70px + env(safe-area-inset-bottom, 0px)) !important;
                left: 16px !important; // Changed to left side
                right: auto !important;
                width: 48px;
                height: 48px;
                
                .icon {
                    font-size: 20px;
                }
            }
        }
    `]
})
export class TutorialButtonComponent {
    @Input() tooltip = 'Ver tutorial';
    @Input() ariaLabel = 'Abrir tutorial guiado';
    @Output() tutorialRequested = new EventEmitter<void>();

    onClick(): void {
        this.tutorialRequested.emit();
    }
}
