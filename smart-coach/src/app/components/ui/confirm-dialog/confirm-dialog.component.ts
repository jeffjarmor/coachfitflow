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
            <span *ngIf="confirmService.options().type === 'danger'">⚠️</span>
            <span *ngIf="confirmService.options().type === 'warning'">⚡</span>
            <span *ngIf="confirmService.options().type === 'info'">ℹ️</span>
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
      background: rgba(0, 0, 0, 0.5);
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
      background: white;
      border-radius: 16px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
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
        font-size: 48px;
        margin-bottom: 12px;
      }
      
      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #1f2937;
      }
      
      &.type-danger {
        .modal-icon {
          filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.3));
        }
      }
      
      &.type-warning {
        .modal-icon {
          filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.3));
        }
      }
    }

    .modal-body {
      padding: 0 24px 24px;
      
      p {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        color: #6b7280;
        text-align: center;
      }
    }

    .modal-actions {
      padding: 16px 24px 24px;
      display: flex;
      gap: 12px;
      justify-content: center; // Center buttons
      
      app-button {
        flex: 1; // Make buttons equal width
        min-width: 120px; // Minimum width for better touch target
      }
      
      @media (max-width: 640px) {
        flex-direction: row; // Keep horizontal on mobile too
        
        app-button {
          width: auto; // Reset width override if needed, but flex: 1 handles it
        }
      }
    }
  `]
})
export class ConfirmDialogComponent {
  confirmService = inject(ConfirmService);
}
