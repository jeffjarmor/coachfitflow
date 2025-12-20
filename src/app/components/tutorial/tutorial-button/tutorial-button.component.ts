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
            position: fixed;
            bottom: $spacing-6;
            right: $spacing-6;
            width: 56px;
            height: 56px;
            border-radius: $radius-full;
            background: $primary-600;
            color: white;
            border: none;
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            z-index: 1000;
            
            .icon {
                font-size: 24px;
                font-weight: $font-weight-bold;
            }
            
            &:hover {
                background: $primary-700;
                transform: scale(1.05);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }
            
            &:active {
                transform: scale(0.95);
            }
        }
        
        @media (max-width: 768px) {
            .tutorial-help-btn {
                bottom: $spacing-4;
                right: $spacing-4;
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
