import { Component, signal, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';

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
    private coachService = inject(CoachService);

    currentRoute = signal<string>('');
    coachProfile = signal<any>(null);

    navItems = computed(() => {
        const profile = this.coachProfile();
        const isAdmin = this.authService.isAdmin();
        const gymId = profile?.gymId;
        const isGymOwner = profile?.isOwner || false;

        // Base items for all users
        let items: NavItem[] = [];

        // STRICT GYM MODE: Gym trainers see limited navigation
        if (gymId && !isGymOwner && !isAdmin) {
            // Gym trainer (not owner) - limited navigation
            items = [
                { icon: '🏠', label: 'Inicio', route: '/dashboard' },
                { icon: '💪', label: 'Ejercicios', route: '/exercises' },
                { icon: '👤', label: 'Perfil', route: '/profile' }
            ];
        } else {
            // Independent coach or gym owner - full navigation
            items = [
                { icon: '🏠', label: 'Inicio', route: '/dashboard' },
                { icon: '👥', label: 'Clientes', route: '/clients' },
                { icon: '✨', label: 'Crear', route: '/routines/new', isHighlighted: true },
                { icon: '💪', label: 'Ejercicios', route: '/exercises' },
                { icon: '👤', label: 'Perfil', route: '/profile' }
            ];



            // Add Admin panel for admins
            if (isAdmin) {
                items.push({ icon: '🛡️', label: 'Admin', route: '/admin/coaches' });
            }
        }

        return items;
    });

    constructor() {
        // Load coach profile on initialization
        this.loadCoachProfile();

        // Track current route for active state
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe((event: any) => {
                this.currentRoute.set(event.url);
            });

        // Set initial route
        this.currentRoute.set(this.router.url);
    }

    async loadCoachProfile() {
        const userId = this.authService.getCurrentUserId();
        if (!userId) return;

        try {
            const profile = await this.coachService.getCoachProfile(userId);
            if (profile) {
                // Check if user is gym owner
                const isOwner = profile.role === 'owner' || profile.accountType === 'gym';
                this.coachProfile.set({ ...profile, isOwner });
            }
        } catch (error) {
            console.error('Error loading coach profile for navigation:', error);
        }
    }

    isActive(route: string): boolean {
        const current = this.currentRoute();
        // Check if current route starts with the nav route
        return current === route || current.startsWith(route + '/');
    }
}
