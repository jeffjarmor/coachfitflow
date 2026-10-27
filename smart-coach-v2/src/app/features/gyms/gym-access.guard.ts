import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from './gym-context.service';
import { GymContext, GymPermission, GymStaffRole } from './gym.models';

async function resolveGym(route: ActivatedRouteSnapshot) {
  const auth = inject(AuthService);
  const coachData = inject(CoachDataService);
  const gyms = inject(GymContextService);
  const router = inject(Router);

  await auth.waitUntilReady();
  const userId = auth.user()?.id;
  if (!userId) return { redirect: router.createUrlTree(['/login']) };

  try {
    await auth.ensureCoachProfileForCurrentUser();
    const profile = await coachData.getProfile(userId);
    // Refresh on every protected navigation so revoked roles or permissions do
    // not remain visible from the in-memory UI context. RLS remains authoritative.
    await gyms.loadAccessibleGyms(userId, profile.role, true);
    const gymId = route.paramMap.get('gymId') || route.paramMap.get('id') || '';
    const context = gyms.activateGym(gymId, userId);
    if (!context) {
      return { redirect: router.createUrlTree(['/gyms'], { queryParams: { access: 'gym-required' } }) };
    }
    return { context };
  } catch {
    return { redirect: router.createUrlTree(['/gyms'], { queryParams: { access: 'gym-required' } }) };
  }
}

export const gymMemberGuard: CanActivateFn = async (route) => {
  const result = await resolveGym(route);
  return result.redirect || true;
};

export const gymPermissionGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const result = await resolveGym(route);
  if (result.redirect) return result.redirect;

  const permission = route.data['gymPermission'] as GymPermission | undefined;
  const roles = route.data['gymRoles'] as GymStaffRole[] | undefined;
  const context = result.context!;
  const allowed = (!permission || context.permissions[permission])
    && (!roles?.length || roles.includes(context.role));
  return allowed
    ? true
    : router.createUrlTree(gymHome(context), { queryParams: { access: 'permission-required' } });
};

export function gymHome(context: GymContext): string[] {
  return context.role === 'owner' || context.role === 'admin'
    ? ['/gym/dashboard', context.gym.id]
    : ['/gym', context.gym.id, 'clients'];
}

export const gymSelectorGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const data = inject(CoachDataService);
  const gyms = inject(GymContextService);
  const router = inject(Router);
  await auth.waitUntilReady();
  const userId = auth.user()?.id;
  if (!userId) return router.createUrlTree(['/login']);
  try {
    const profile = await data.getProfile(userId);
    const contexts = await gyms.loadAccessibleGyms(userId, profile.role, true);
    return profile.role === 'admin' || contexts.length > 0 || router.createUrlTree(['/dashboard']);
  } catch {
    // Let the selector render its recoverable loading error.
    return true;
  }
};

// Legacy entry points keep using the member's active gym, as in smart-coach.
export const activeWorkspaceGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const data = inject(CoachDataService);
  const gyms = inject(GymContextService);
  const router = inject(Router);
  await auth.waitUntilReady();
  const userId = auth.user()?.id;
  if (!userId) return router.createUrlTree(['/login']);
  try {
    const profile = await data.getProfile(userId);
    if (profile.role === 'admin') return true;
    await gyms.loadAccessibleGyms(userId, profile.role, true);
    const context = gyms.activeGym();
    if (!context) return true;
    const path = state.url.split('?')[0].split('#')[0].replace(/^\//, '').replace('exercises-astra', 'exercises');
    const target = path === 'dashboard' ? gymHome(context) : ['/gym', context.gym.id, ...path.split('/')];
    return router.createUrlTree(target, { queryParams: route.queryParams, fragment: route.fragment || undefined });
  } catch { return router.createUrlTree(['/gyms']); }
};
