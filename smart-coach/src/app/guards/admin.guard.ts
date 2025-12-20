import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { toObservable } from '@angular/core/rxjs-interop';
import { map, filter, take } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // If we already know the user is an admin, allow access
    if (authService.isAdmin()) {
        return true;
    }

    // If loading, wait for it to finish
    if (authService.loading()) {
        return toObservable(authService.loading).pipe(
            filter(loading => !loading),
            take(1),
            map(() => {
                if (authService.isAdmin()) {
                    return true;
                } else {
                    router.navigate(['/dashboard']);
                    return false;
                }
            })
        );
    }

    // If not loading and not admin, redirect
    router.navigate(['/dashboard']);
    return false;
};
