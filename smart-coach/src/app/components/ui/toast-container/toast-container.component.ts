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
          <svg *ngIf="toast.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m5 12 5 5L20 7"></path>
          </svg>
          <svg *ngIf="toast.type === 'error'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m18 6-12 12"></path>
            <path d="m6 6 12 12"></path>
          </svg>
          <svg *ngIf="toast.type === 'warning'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 9v4"></path>
            <path d="M12 17h.01"></path>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path>
          </svg>
          <svg *ngIf="toast.type === 'info'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
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
      background: linear-gradient(180deg, #1a2029 0%, #151a22 100%);
      border: 1px solid #2f3948;
      border-radius: 14px;
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
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

      svg {
        width: 18px;
        height: 18px;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }

    .toast-success {
      border-left: 4px solid #6ee74b;
      
      .toast-icon {
        background: rgba(110, 231, 75, 0.16);
        color: #a7f684;
      }
    }

    .toast-error {
      border-left: 4px solid #ff4c4c;
      
      .toast-icon {
        background: rgba(255, 76, 76, 0.16);
        color: #ff9a9a;
      }
    }

    .toast-warning {
      border-left: 4px solid #ffb84d;
      
      .toast-icon {
        background: rgba(255, 184, 77, 0.16);
        color: #ffd08a;
      }
    }

    .toast-info {
      border-left: 4px solid #ccff00;
      
      .toast-icon {
        background: rgba(204, 255, 0, 0.14);
        color: #ccff00;
      }
    }

    .toast-message {
      flex: 1;
      font-size: 14px;
      line-height: 1.5;
      color: #ffffff;
    }

    .toast-close {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: #8c95a4;
      font-size: 24px;
      line-height: 1;
      cursor: pointer;
      transition: color 0.2s;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &:hover {
        color: #ccff00;
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
