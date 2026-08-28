import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CoachService } from '../services/coach.service';
import { AuthService } from '../services/auth.service';

/** Allows admins and coaches with at least one accessible gym to open the gym selector. */
export const ownerGuard: CanActivateFn = async () => {
    const coachService = inject(CoachService);
    const router = inject(Router);
    const authService = inject(AuthService);

    const userId = authService.getCurrentUserId();
    if (!userId) {
        router.navigate(['/login']);
        return false;
    }

    const coach = await coachService.getCoachProfile(userId);
    if (coach && (coach.role === 'admin' || (coach.gymIds?.length || 0) > 0)) return true;

    return router.createUrlTree(['/dashboard']);
};
