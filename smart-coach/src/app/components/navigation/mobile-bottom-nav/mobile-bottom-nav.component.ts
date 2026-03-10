import { Component, signal, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';

interface NavItem {
    iconKey: 'home' | 'routines' | 'measurements' | 'payments' | 'clients' | 'staff' | 'profile' | 'create' | 'exercises' | 'admin';
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
    private gymService = inject(GymService);

    currentRoute = signal<string>('');
    coachProfile = signal<any>(null);

    navItems = computed(() => {
        const profile = this.coachProfile();
        const isAdmin = this.authService.isAdmin();
        const gymId = profile?.gymId;
        const isGymOwner = profile?.isOwner || false;
        const isGymClient = this.authService.isGymClient();

        // Base items for all users
        let items: NavItem[] = [];

        // CLIENT PORTAL MODE
        if (isGymClient) {
            items = [
                { iconKey: 'home', label: 'Inicio', route: '/client/portal' },
                { iconKey: 'routines', label: 'Rutinas', route: '/client/routines' },
                { iconKey: 'measurements', label: 'Medidas', route: '/client/measurements' },
                { iconKey: 'payments', label: 'Pagos', route: '/client/payments' }
            ];
            return items;
        }

        // GYM OWNER: specific navigation
        if (isGymOwner && !isAdmin) {
            items = [
                { iconKey: 'home', label: 'Inicio', route: '/gym/dashboard' },
                { iconKey: 'clients', label: 'Clientes', route: '/clients' },
                { iconKey: 'payments', label: 'Pagos', route: `/gym/payments/${gymId}` },
                { iconKey: 'staff', label: 'Personal', route: `/gym/staff/${gymId}` },
                { iconKey: 'profile', label: 'Perfil', route: '/profile' }
            ];
        } else {
            // Independent coach, gym trainer, or admin — full navigation
            items = [
                { iconKey: 'home', label: 'Inicio', route: '/dashboard' },
                { iconKey: 'clients', label: 'Clientes', route: '/clients' },
                { iconKey: 'create', label: 'Crear', route: '/routines/new', isHighlighted: true },
                { iconKey: 'exercises', label: 'Ejercicios', route: '/exercises' },
                { iconKey: 'profile', label: 'Perfil', route: '/profile' }
            ];

            // Admin button only for actual admins
            if (isAdmin) {
                items.push({ iconKey: 'admin', label: 'Admin', route: '/admin/coaches' });
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
                let isOwner = profile.role === 'owner';

                // If the global profile doesn't say owner, check the specific gym membership
                if (!isOwner && profile.gymId) {
                    const gymCoach = await this.gymService.getGymCoach(profile.gymId, userId);
                    if (gymCoach && gymCoach.role === 'owner') {
                        isOwner = true;
                    }
                }

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
