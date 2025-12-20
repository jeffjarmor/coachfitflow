import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MobileBottomNavComponent } from './components/navigation/mobile-bottom-nav/mobile-bottom-nav.component';
import { ScrollToTopComponent } from './components/ui/scroll-to-top/scroll-to-top.component';
import { ToastContainerComponent } from './components/ui/toast-container/toast-container.component';
import { ConfirmDialogComponent } from './components/ui/confirm-dialog/confirm-dialog.component';
import { AuthService } from './services/auth.service';
import { TutorialOverlayComponent } from './components/tutorial/tutorial-overlay/tutorial-overlay.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MobileBottomNavComponent, ScrollToTopComponent, ToastContainerComponent, ConfirmDialogComponent, TutorialOverlayComponent],
  template: `
    <main [class.has-bottom-nav]="authService.currentUser()">
      <router-outlet></router-outlet>
    </main>
    <app-mobile-bottom-nav *ngIf="authService.currentUser()"></app-mobile-bottom-nav>
    <app-scroll-to-top *ngIf="authService.currentUser()"></app-scroll-to-top>
    <app-toast-container></app-toast-container>
    <app-confirm-dialog></app-confirm-dialog>
    <app-tutorial-overlay></app-tutorial-overlay>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }
  `]
})
export class AppComponent {
  title = 'Smart Coach';
  authService = inject(AuthService);
}
