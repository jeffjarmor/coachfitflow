import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, map, take, skipWhile } from 'rxjs';

export const authGuard = (): Observable<boolean | UrlTree> => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.user$.pipe(
        take(1),
        map(user => {
            if (user) {
                return true;
            }
            return router.createUrlTree(['/login']);
        })
    );
};
