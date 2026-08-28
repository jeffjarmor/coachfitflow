import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { from } from 'rxjs';

export const authGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return from((async () => {
        // A hard refresh can begin routing before Supabase finishes restoring
        // the persisted session. Always revalidate before deciding to log out.
        await authService.waitForAuthReady(8000);
        const user = await authService.ensureSession();

        return user ? true : router.createUrlTree(['/login']);
    })());
};
