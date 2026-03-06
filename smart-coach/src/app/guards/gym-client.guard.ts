import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { from } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

/**
 * Protects routes that are only accessible to gym clients.
 * Waits for Firebase auth state to fully resolve before deciding.
 */
export const gymClientGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // If already resolved and is a gym client — allow immediately
    if (authService.isGymClient()) return true;

    // Wait for Firebase auth user$ to emit, then check result
    return authService.user$.pipe(
        take(1),
        switchMap(user => {
            if (!user) {
                return [router.createUrlTree(['/login'])];
            }
            // Auth user exists — check if gym client profile loaded
            if (authService.isGymClient()) {
                return [true];
            }
            // Wait a tick for async profile resolution in case it's still loading
            return from(new Promise<boolean | ReturnType<Router['createUrlTree']>>(resolve => {
                setTimeout(() => {
                    resolve(authService.isGymClient() ? true : router.createUrlTree(['/login']));
                }, 1500);
            }));
        }),
        map(result => result)
    );
};
