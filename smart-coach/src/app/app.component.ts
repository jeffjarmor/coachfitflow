import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MobileBottomNavComponent } from './components/navigation/mobile-bottom-nav/mobile-bottom-nav.component';
import { ScrollToTopComponent } from './components/ui/scroll-to-top/scroll-to-top.component';
import { ToastContainerComponent } from './components/ui/toast-container/toast-container.component';
import { ConfirmDialogComponent } from './components/ui/confirm-dialog/confirm-dialog.component';
import { AuthService } from './services/auth.service';
import { TutorialOverlayComponent } from './components/tutorial/tutorial-overlay/tutorial-overlay.component';
import { ProUpsellModalComponent } from './components/ui/pro-upsell-modal/pro-upsell-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MobileBottomNavComponent, ScrollToTopComponent, ToastContainerComponent, ConfirmDialogComponent, TutorialOverlayComponent, ProUpsellModalComponent],
  template: `
    <main [class.has-bottom-nav]="!!authService.currentUser()">
      <div class="main-content">
        <router-outlet></router-outlet>
      </div>
      
      <footer class="app-footer">
        <a href="https://www.thebonfire.dev/" target="_blank" rel="noopener noreferrer">
          Powered by Bonfire
        </a>
      </footer>
    </main>
    <app-mobile-bottom-nav *ngIf="authService.currentUser()"></app-mobile-bottom-nav>
    <app-scroll-to-top *ngIf="authService.currentUser()"></app-scroll-to-top>
    <app-toast-container></app-toast-container>
    <app-confirm-dialog></app-confirm-dialog>
    <app-pro-upsell-modal></app-pro-upsell-modal>
    <app-tutorial-overlay></app-tutorial-overlay>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
    }
    main {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .main-content {
      flex: 1;
      width: 100%;
    }
    .app-footer {
      padding: 1rem;
      text-align: center;
      background: #111720;
      border-top: 1px solid #232a36;
      width: 100%;
      flex-shrink: 0;
      margin-top: auto;
    }
    .app-footer a {
      text-decoration: none;
      color: #8c95a4;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition: color 0.2s;
    }
    .app-footer a:hover {
      color: #ccff00;
    }
  `]
})
export class AppComponent {
  title = 'Zummith';
  authService = inject(AuthService);
}
