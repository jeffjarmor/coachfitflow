import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { CoachService } from '../services/coach.service';
import { GymService } from '../services/gym.service';
import { hasGymOwnerAccess } from '../models/gym-coach.model';

/**
 * Allows access only to gym owner (or admin) for a specific gym route `:id`.
 */
export const gymOwnerGuard: CanActivateFn = async (route) => {
    const authService = inject(AuthService);
    const coachService = inject(CoachService);
    const gymService = inject(GymService);
    const router = inject(Router);

    let userId = authService.getCurrentUserId();
    if (!userId) {
        const user = await firstValueFrom(authService.user$.pipe(take(1)));
        userId = (user as any)?.id || null;
    }
    const gymId = route.paramMap.get('id');

    if (!userId) {
        router.navigate(['/login']);
        return false;
    }

    if (!gymId) {
        router.navigate(['/dashboard']);
        return false;
    }

    try {
        const [coach, gym, staffMember] = await Promise.all([
            coachService.getCoachProfile(userId),
            gymService.getGym(gymId),
            gymService.getGymCoach(gymId, userId)
        ]);

        const isAdmin = coach?.role === 'admin';
        const isOwner = hasGymOwnerAccess(gym, staffMember, userId);

        if (isAdmin || isOwner) {
            return true;
        }

        router.navigate(['/dashboard']);
        return false;
    } catch (error) {
        console.error('gymOwnerGuard error:', error);
        router.navigate(['/dashboard']);
        return false;
    }
};
