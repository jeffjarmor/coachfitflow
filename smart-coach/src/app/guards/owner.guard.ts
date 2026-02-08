import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CoachService } from '../services/coach.service';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const ownerGuard: CanActivateFn = (route, state) => {
    const coachService = inject(CoachService);
    const router = inject(Router);
    const authService = inject(AuthService);

    const userId = authService.getCurrentUserId();
    if (!userId) {
        router.navigate(['/login']);
        return false;
    }

    // We need to check the profile directly since signal might not be populated yet upon direct navigation
    return coachService.getCoachProfile(userId).then(coach => {
        if (coach && (coach.role === 'owner' || coach.role === 'admin')) {
            return true;
        }

        // If not owner/admin, redirect to default dashboard
        router.navigate(['/dashboard']);
        return false;
    });
};
