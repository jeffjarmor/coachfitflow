import { Component, signal, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

interface NavItem {
    icon: string;
    label: string;
    route: string;
    isHighlighted?: boolean;
}

@Component({
    selector: 'app-mobile-bottom-nav',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './mobile-bottom-nav.component.html',
    styleUrls: ['./mobile-bottom-nav.component.scss']
})
export class MobileBottomNavComponent {
    private router = inject(Router);

    currentRoute = signal<string>('');

    navItems: NavItem[] = [
        { icon: '🏠', label: 'Inicio', route: '/dashboard' },
        { icon: '👥', label: 'Clientes', route: '/clients' },
        { icon: '✨', label: 'Crear', route: '/routines/new', isHighlighted: true },
        { icon: '💪', label: 'Ejercicios', route: '/exercises' },
        { icon: '👤', label: 'Perfil', route: '/profile' }
    ];

    constructor() {
        // Track current route for active state
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe((event: any) => {
                this.currentRoute.set(event.url);
            });

        // Set initial route
        this.currentRoute.set(this.router.url);
    }

    isActive(route: string): boolean {
        const current = this.currentRoute();
        // Check if current route starts with the nav route
        return current === route || current.startsWith(route + '/');
    }
}
