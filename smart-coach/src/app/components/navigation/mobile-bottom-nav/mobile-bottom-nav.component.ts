import { Component, signal, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';

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
    private authService = inject(AuthService);

    currentRoute = signal<string>('');

    navItems = computed(() => {
        const items: NavItem[] = [
            { icon: '🏠', label: 'Inicio', route: '/dashboard' },
            { icon: '👥', label: 'Clientes', route: '/clients' },
            { icon: '✨', label: 'Crear', route: '/routines/new', isHighlighted: true },
            { icon: '💪', label: 'Ejercicios', route: '/exercises' },
            { icon: '👤', label: 'Perfil', route: '/profile' }
        ];

        if (this.authService.isAdmin()) {
            items.push({ icon: '🛡️', label: 'Admin', route: '/admin/coaches' });
        }

        return items;
    });

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
