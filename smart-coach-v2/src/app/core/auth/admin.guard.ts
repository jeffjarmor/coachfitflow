import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CoachDataService } from '../data/coach-data.service';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const data = inject(CoachDataService);
  const router = inject(Router);

  await auth.waitUntilReady();
  const userId = auth.user()?.id;
  if (!userId) return router.createUrlTree(['/login']);

  try {
    await auth.ensureCoachProfileForCurrentUser();
    const profile = await data.getProfile(userId);
    return profile.role === 'admin'
      ? true
      : router.createUrlTree(['/dashboard'], { queryParams: { access: 'admin-required' } });
  } catch {
    return router.createUrlTree(['/dashboard'], { queryParams: { access: 'admin-required' } });
  }
};
