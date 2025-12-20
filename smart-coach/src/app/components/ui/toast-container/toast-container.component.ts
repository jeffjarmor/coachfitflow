import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../services/toast.service';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of toastService.toasts()" 
           class="toast toast-{{toast.type}}"
           [@slideIn]>
        <div class="toast-icon">
          <span *ngIf="toast.type === 'success'">✓</span>
          <span *ngIf="toast.type === 'error'">✕</span>
          <span *ngIf="toast.type === 'warning'">⚠</span>
          <span *ngIf="toast.type === 'info'">ℹ</span>
        </div>
        <div class="toast-message">{{ toast.message }}</div>
        <button class="toast-close" (click)="toastService.remove(toast.id)">×</button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      pointer-events: none;
      
      @media (max-width: 640px) {
        top: 10px;
        right: 10px;
        left: 10px;
      }
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      min-width: 300px;
      max-width: 500px;
      
      @media (max-width: 640px) {
        min-width: auto;
        max-width: 100%;
      }
    }

    .toast-icon {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: bold;
    }

    .toast-success {
      border-left: 4px solid #10b981;
      
      .toast-icon {
        background: #d1fae5;
        color: #059669;
      }
    }

    .toast-error {
      border-left: 4px solid #ef4444;
      
      .toast-icon {
        background: #fee2e2;
        color: #dc2626;
      }
    }

    .toast-warning {
      border-left: 4px solid #f59e0b;
      
      .toast-icon {
        background: #fef3c7;
        color: #d97706;
      }
    }

    .toast-info {
      border-left: 4px solid #3b82f6;
      
      .toast-icon {
        background: #dbeafe;
        color: #2563eb;
      }
    }

    .toast-message {
      flex: 1;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
    }

    .toast-close {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: #9ca3af;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      transition: color 0.2s;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        color: #4b5563;
      }
    }
  `],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateX(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ToastContainerComponent {
  toastService = inject(ToastService);
}
