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
            background: #3b82f6;
            color: white;
            border: none;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
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
                background: #2563eb;
                transform: scale(1.05);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
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
