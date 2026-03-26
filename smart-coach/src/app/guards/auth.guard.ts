import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, combineLatest, filter, map, take } from 'rxjs';

export const authGuard = (): Observable<boolean | UrlTree> => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return combineLatest([authService.user$, authService.authReady$]).pipe(
        filter(([, authReady]) => authReady),
        take(1),
        map(([user]) => {
            if (user) {
                return true;
            }
            return router.createUrlTree(['/login']);
        })
    );
};
