import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../services/confirm.service';
import { ButtonComponent } from '../button/button.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    <div class="modal-overlay" *ngIf="confirmService.isOpen()" (click)="confirmService.handleCancel()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header" [class]="'type-' + confirmService.options().type">
          <div class="modal-icon">
            <svg *ngIf="confirmService.options().type === 'danger'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 9v4"></path>
              <path d="M12 17h.01"></path>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
            </svg>
            <svg *ngIf="confirmService.options().type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m13 2-2 10h4l-2 10"></path>
            </svg>
            <svg *ngIf="confirmService.options().type === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4"></path>
              <path d="M12 8h.01"></path>
            </svg>
          </div>
          <h2>{{ confirmService.options().title }}</h2>
        </div>
        <div class="modal-body">
          <p>{{ confirmService.options().message }}</p>
        </div>
        <div class="modal-actions">
          <app-button 
            variant="outline" 
            [fullWidth]="true"
            (click)="confirmService.handleCancel()">
            {{ confirmService.options().cancelText }}
          </app-button>
          <app-button 
            [variant]="confirmService.options().type === 'danger' ? 'danger' : 'primary'"
            [fullWidth]="true"
            (click)="confirmService.handleConfirm()">
            {{ confirmService.options().confirmText }}
          </app-button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(7, 9, 13, 0.78);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      padding: 20px;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .modal-content {
      background: linear-gradient(180deg, #1a2029 0%, #151a22 100%);
      border: 1px solid #2f3948;
      border-radius: 18px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55);
      animation: slideUp 0.3s ease-out;
      
      @media (max-width: 640px) {
        max-width: 100%;
        margin: 0 10px;
      }
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .modal-header {
      padding: 24px 24px 16px;
      text-align: center;
      
      .modal-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 12px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(204, 255, 0, 0.1);
        border: 1px solid rgba(204, 255, 0, 0.28);
        margin-bottom: 12px;

        svg {
          width: 28px;
          height: 28px;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
      }
      
      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #ffffff;
      }
      
      &.type-danger {
        .modal-icon {
          background: rgba(255, 76, 76, 0.14);
          border-color: rgba(255, 76, 76, 0.45);
          filter: drop-shadow(0 0 12px rgba(255, 76, 76, 0.26));
        }
      }
      
      &.type-warning {
        .modal-icon {
          background: rgba(255, 184, 77, 0.14);
          border-color: rgba(255, 184, 77, 0.45);
          filter: drop-shadow(0 0 12px rgba(255, 184, 77, 0.26));
        }
      }

      &.type-info {
        .modal-icon {
          color: #ccff00;
          filter: drop-shadow(0 0 12px rgba(204, 255, 0, 0.22));
        }
      }
    }

    .modal-body {
      padding: 0 24px 24px;
      
      p {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: #c0c7d4;
        text-align: center;
      }
    }

    .modal-actions {
      padding: 16px 24px 24px;
      display: flex;
      gap: 12px;
      justify-content: center;
      
      app-button {
        flex: 1;
        min-width: 120px;
      }
      
      @media (max-width: 640px) {
        flex-direction: row;
        
        app-button {
          width: auto;
        }
      }
    }
  `]
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmService);
}
