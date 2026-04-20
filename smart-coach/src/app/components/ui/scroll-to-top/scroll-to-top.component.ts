import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
    selector: 'app-scroll-to-top',
    standalone: true,
    imports: [CommonModule],
    template: `
        <button 
            *ngIf="showButton()"
            class="scroll-to-top-fab"
            (click)="scrollToTop()"
            aria-label="Volver arriba">
            ↑
        </button>
    `,
    styles: [`
        @import 'styles/variables';

        .scroll-to-top-fab {
            position: fixed;
            bottom: calc(70px + env(safe-area-inset-bottom, 0px)); // Same height as tutorial button
            right: 16px; // Right side
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, $primary-500, $primary-600);
            color: #0b0e14;
            font-size: 20px;
            font-weight: bold;
            border: 2px solid rgba(11, 14, 20, 0.18);
            box-shadow:
                0 10px 24px rgba(0, 0, 0, 0.24),
                0 0 0 3px rgba($primary-500, 0.18);
            cursor: pointer;
            z-index: 998;
            transition: all 0.3s ease;
            display: none;

            // Show only on mobile
            @media (max-width: 768px) {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            &:hover {
                transform: scale(1.05) translateY(-2px);
                box-shadow:
                    0 14px 28px rgba(0, 0, 0, 0.28),
                    0 0 0 4px rgba($primary-500, 0.22);
            }

            &:active {
                transform: scale(0.95);
            }

            // Animation
            animation: fadeInUp 0.3s ease;
        }

        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
    `]
})
export class ScrollToTopComponent {
    private router = inject(Router);
    showButton = signal(false);

    constructor() {
        // Listen to scroll events
        if (typeof window !== 'undefined') {
            window.addEventListener('scroll', () => this.onScroll());
        }

        // Reset on route change
        this.router.events.pipe(
            filter(event => event instanceof NavigationEnd)
        ).subscribe(() => {
            this.showButton.set(false);
        });
    }

    private onScroll(): void {
        const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
        this.showButton.set(scrollPosition > 300);
    }

    scrollToTop(): void {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
}
