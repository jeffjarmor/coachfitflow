import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { from } from 'rxjs';

/**
 * Protects routes that are only accessible to client-portal users.
 * Waits for Supabase auth state to fully resolve before deciding.
 */
export const gymClientGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return from((async () => {
        const blockedLoginTree = () => router.createUrlTree(
            ['/login'],
            { queryParams: { blocked: 'coach-subscription-pending' } }
        );

        // 1) Wait for initial auth bootstrap on hard refresh.
        await authService.waitForAuthReady(8000);
        await authService.ensureSession();

        // 2) If there is no auth user, redirect to login.
        if (!authService.getCurrentUserId()) {
            return router.createUrlTree(['/login']);
        }

        // 3) If profile already resolved as client-portal user, allow immediately.
        if (authService.isClientPortalUser()) {
            if (authService.isClientPortalAccessBlocked()) {
                await authService.clearBlockedClientPortalSession();
                return blockedLoginTree();
            }
            return true;
        }

        // 4) Give profile resolution a short window (DB + RLS + network on refresh).
        const timeoutAt = Date.now() + 4000;
        while (Date.now() < timeoutAt) {
            await new Promise((resolve) => setTimeout(resolve, 120));
            if (authService.isClientPortalUser()) {
                if (authService.isClientPortalAccessBlocked()) {
                    await authService.clearBlockedClientPortalSession();
                    return blockedLoginTree();
                }
                return true;
            }
        }

        // 5) Auth exists but not a client-portal profile.
        return router.createUrlTree(['/login']);
    })());
};
