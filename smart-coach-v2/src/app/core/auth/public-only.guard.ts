import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const publicOnlyGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.waitUntilReady();
  await auth.ensureSession();
  return auth.isAuthenticated() ? router.createUrlTree([await auth.homePath()]) : true;
};
