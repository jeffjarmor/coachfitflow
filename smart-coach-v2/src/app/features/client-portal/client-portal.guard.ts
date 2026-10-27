import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClientPortalDataService } from './client-portal-data.service';

export const clientPortalGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const portal = inject(ClientPortalDataService);
  const router = inject(Router);
  await auth.waitUntilReady();

  const userId = auth.user()?.id;
  if (!userId) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });

  try {
    const contexts = await portal.listContexts(userId);
    if (!contexts.length) return router.createUrlTree(['/dashboard']);
    if (portal.initialContext(userId, contexts)) return true;

    await auth.signOut();
    return router.createUrlTree(['/login'], { queryParams: { blocked: 'coach-subscription-pending' } });
  } catch {
    // Keep the portal available so its retry state can explain a transient data error.
    return true;
  }
};
