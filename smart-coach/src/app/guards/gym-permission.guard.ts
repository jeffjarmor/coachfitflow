import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { CoachService } from '../services/coach.service';
import { GymService } from '../services/gym.service';
import { hasGymOwnerAccess } from '../models/gym-coach.model';

type GymPermission = 'canEditClients' | 'canCreateRoutines' | 'canViewPayments' | 'canManageStaff';

async function currentUserId(authService: AuthService): Promise<string | null> {
    const immediate = authService.getCurrentUserId();
    if (immediate) return immediate;
    const user = await firstValueFrom(authService.user$.pipe(take(1)));
    return (user as any)?.id || null;
}

function permissionGuard(permission: GymPermission, requireRouteGym = false): CanActivateFn {
    return async (route) => {
        const authService = inject(AuthService);
        const coachService = inject(CoachService);
        const gymService = inject(GymService);
        const router = inject(Router);
        const userId = await currentUserId(authService);
        if (!userId) return router.createUrlTree(['/login']);

        try {
            const coach = await coachService.getCoachProfile(userId);
            if (coach?.role === 'admin') return true;

            const gymId = requireRouteGym ? route.paramMap.get('id') : coach?.gymId;
            if (!gymId) {
                // Independent coaches retain their existing feature access.
                return requireRouteGym ? router.createUrlTree(['/dashboard']) : true;
            }

            const [gym, staff] = await Promise.all([
                gymService.getGym(gymId),
                gymService.getGymCoach(gymId, userId)
            ]);
            if (hasGymOwnerAccess(gym, staff, userId) || staff?.permissions?.[permission]) return true;
        } catch (error) {
            console.error(`Gym permission guard (${permission}) error:`, error);
        }

        return router.createUrlTree(['/dashboard']);
    };
}

export const gymPaymentsGuard = permissionGuard('canViewPayments', true);
export const gymStaffGuard = permissionGuard('canManageStaff', true);
export const gymClientEditGuard = permissionGuard('canEditClients');
export const gymRoutineCreateGuard = permissionGuard('canCreateRoutines');
