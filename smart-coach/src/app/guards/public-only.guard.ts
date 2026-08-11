import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const publicOnlyGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return from((async () => {
        await authService.waitForAuthReady(8000);
        await authService.ensureSession();

        if (!authService.getCurrentUserId()) {
            return true;
        }

        return router.createUrlTree([
            authService.isClientPortalUser() ? '/client/portal' : '/dashboard'
        ]);
    })());
};
