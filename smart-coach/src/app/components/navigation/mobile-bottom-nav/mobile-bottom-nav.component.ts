import { Component, signal, effect, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { CoachService } from '../../../services/coach.service';
import { GymService } from '../../../services/gym.service';
import { hasGymOwnerAccess } from '../../../models/gym-coach.model';

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
        const gymPermissions = profile?.gymPermissions;
        const isGymClient = this.authService.isGymClient();
        const clientProfile = this.authService.gymClientProfile();
        const showClientPayments = clientProfile?.scope === 'gym';
        const routeLooksLikeClientPortal = this.currentRoute().startsWith('/client/');

        // Base items for all users
        let items: NavItem[] = [];

        // CLIENT PORTAL MODE
        if (isGymClient || routeLooksLikeClientPortal) {
            items = [
                { iconKey: 'home', label: 'Inicio', route: '/client/portal' },
                { iconKey: 'routines', label: 'Rutinas', route: '/client/routines' },
                { iconKey: 'measurements', label: 'Medidas', route: '/client/measurements' }
            ];
            if (showClientPayments) {
                items.push({ iconKey: 'payments', label: 'Pagos', route: '/client/payments' });
            }
            return items;
        }

        // GYM TEAM: navigation follows the permissions of the active gym.
        if (gymId && !isAdmin) {
            items = [
                { iconKey: 'home', label: 'Inicio', route: isGymOwner ? `/gym/dashboard/${gymId}` : '/dashboard' }
            ];

            items.push({ iconKey: 'clients', label: 'Clientes', route: '/clients' });
            if (isGymOwner || gymPermissions?.canCreateRoutines) {
                items.push({ iconKey: 'create', label: 'Crear', route: '/routines/new', isHighlighted: true });
            }
            if (isGymOwner || gymPermissions?.canViewPayments) {
                items.push({ iconKey: 'payments', label: 'Pagos', route: `/gym/payments/${gymId}` });
            }
            if (isGymOwner || gymPermissions?.canManageStaff) {
                items.push({ iconKey: 'staff', label: 'Personal', route: `/gym/staff/${gymId}` });
            }
            items.push({ iconKey: 'profile', label: 'Perfil', route: '/profile' });
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
        effect(() => {
            const user = this.authService.currentUser();
            const isGymClient = this.authService.isGymClient();
            const routeLooksLikeClientPortal = this.currentRoute().startsWith('/client/');

            if (!user) {
                this.coachProfile.set(null);
                return;
            }

            if (isGymClient || routeLooksLikeClientPortal) {
                this.coachProfile.set(null);
                return;
            }

            void this.loadCoachProfile();
        });

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
                let isOwner = false;
                let gymPermissions = null;
                if (profile.gymId) {
                    const [gym, gymCoach] = await Promise.all([
                        this.gymService.getGym(profile.gymId),
                        this.gymService.getGymCoach(profile.gymId, userId)
                    ]);
                    isOwner = hasGymOwnerAccess(gym, gymCoach, userId);
                    gymPermissions = gymCoach?.permissions || null;
                }

                this.coachProfile.set({ ...profile, isOwner, gymPermissions });
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
