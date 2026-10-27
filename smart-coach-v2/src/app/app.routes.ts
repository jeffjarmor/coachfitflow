import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { adminGuard } from './core/auth/admin.guard';
import { publicOnlyGuard } from './core/auth/public-only.guard';
import { pendingChangesGuard } from './core/auth/pending-changes.guard';
import { clientPortalGuard } from './features/client-portal/client-portal.guard';
import { activeWorkspaceGuard, gymSelectorGuard, gymMemberGuard, gymPermissionGuard } from './features/gyms/gym-access.guard';

export const routes: Routes = [
  { path: 'landing-nueva', redirectTo: '', pathMatch: 'full' },
  { path: 'forgot-password', redirectTo: 'login?recovery=1', pathMatch: 'full' },
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then((m) => m.LandingComponent),
    canActivate: [publicOnlyGuard],
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [publicOnlyGuard]
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/signup/signup.component').then((m) => m.SignupComponent),
    canActivate: [publicOnlyGuard]
  },
  {
    path: 'set-password',
    loadComponent: () => import('./features/set-password/set-password.component').then((m) => m.SetPasswordComponent)
  },
  {
    path: 'client/portal',
    canActivate: [clientPortalGuard],
    loadComponent: () => import('./features/client-portal/client-portal.component').then((m) => m.ClientPortalComponent)
  },
  {
    path: 'client/routines/:id',
    canActivate: [clientPortalGuard],
    loadComponent: () => import('./features/client-portal/client-routine-detail.component').then((m) => m.ClientRoutineDetailComponent)
  },
  {
    path: 'client/routines',
    canActivate: [clientPortalGuard],
    loadComponent: () => import('./features/client-portal/client-routines.component').then((m) => m.ClientRoutinesComponent)
  },
  {
    path: 'client/measurements',
    canActivate: [clientPortalGuard],
    loadComponent: () => import('./features/client-portal/client-measurements.component').then((m) => m.ClientMeasurementsComponent)
  },
  {
    path: 'client/payments',
    canActivate: [clientPortalGuard],
    loadComponent: () => import('./features/client-portal/client-payments.component').then((m) => m.ClientPaymentsComponent)
  },
  {
    path: 'client/profile',
    canActivate: [clientPortalGuard],
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./features/client-portal/client-profile.component').then((m) => m.ClientProfileComponent)
  },
  {
    path: '',
    loadComponent: () => import('./layout/coach-shell/coach-shell.component').then((m) => m.CoachShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'gyms',
        canActivate: [gymSelectorGuard],
        loadComponent: () => import('./features/gyms/gym-list.component').then((m) => m.GymListComponent)
      },
      {
        path: 'gym/onboarding',
        canActivate: [adminGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/gyms/gym-onboarding.component').then((m) => m.GymOnboardingComponent)
      },
      {
        path: 'gym/join',
        loadComponent: () => import('./features/gyms/gym-join.component').then((m) => m.GymJoinComponent)
      },
      {
        path: 'gym/dashboard',
        redirectTo: 'gyms',
        pathMatch: 'full'
      },
      {
        path: 'gym/dashboard/:id',
        canActivate: [gymPermissionGuard],
        data: { gymPermission: 'canManageSettings' },
        loadComponent: () => import('./features/gyms/gym-dashboard.component').then((m) => m.GymDashboardComponent)
      },
      {
        path: 'gym/payments/:id',
        canActivate: [gymPermissionGuard],
        data: { gymPermission: 'canViewPayments' },
        loadComponent: () => import('./features/gyms/gym-payments.component').then((m) => m.GymPaymentsComponent)
      },
      {
        path: 'gym/staff/:id',
        canActivate: [gymPermissionGuard],
        data: { gymPermission: 'canManageStaff' },
        loadComponent: () => import('./features/gyms/gym-staff.component').then((m) => m.GymStaffComponent)
      },
      {
        path: 'gym/settings/:id',
        canActivate: [gymPermissionGuard],
        canDeactivate: [pendingChangesGuard],
        data: { gymPermission: 'canManageSettings' },
        loadComponent: () => import('./features/gyms/gym-settings.component').then((m) => m.GymSettingsComponent)
      },
      {
        path: 'gym/:gymId/clients/new',
        canActivate: [gymPermissionGuard],
        data: { gymPermission: 'canEditClients' },
        loadComponent: () => import('./features/clients/client-form/client-form.component').then((m) => m.ClientFormComponent)
      },
      {
        path: 'gym/:gymId/clients/:id/edit',
        canActivate: [gymPermissionGuard],
        data: { gymPermission: 'canEditClients', profileEdit: true },
        loadComponent: () => import('./features/clients/client-detail/client-detail.component').then((m) => m.ClientDetailComponent)
      },
      {
        path: 'gym/:gymId/clients/:id',
        canActivate: [gymMemberGuard],
        loadComponent: () => import('./features/clients/client-detail/client-detail.component').then((m) => m.ClientDetailComponent)
      },
      {
        path: 'gym/:gymId/clients',
        canActivate: [gymMemberGuard],
        loadComponent: () => import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
        data: { kind: 'clients' }
      },
      {
        path: 'gym/:gymId/routines/new',
        canActivate: [gymPermissionGuard],
        canDeactivate: [pendingChangesGuard],
        data: { gymPermission: 'canCreateRoutines' },
        loadComponent: () => import('./features/routines/routine-builder.component').then((m) => m.RoutineBuilderComponent)
      },
      {
        path: 'gym/:gymId/routines/:id',
        canActivate: [gymMemberGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/routines/routine-builder.component').then((m) => m.RoutineBuilderComponent)
      },
      {
        path: 'gym/:gymId/routines',
        canActivate: [gymMemberGuard],
        loadComponent: () => import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
        data: { kind: 'routines' }
      },
      {
        path: 'gym/:gymId/competitor/new',
        canActivate: [gymPermissionGuard],
        canDeactivate: [pendingChangesGuard],
        data: { gymPermission: 'canCreateRoutines' },
        loadComponent: () => import('./features/competitor/competitor-sheet.component').then((m) => m.CompetitorSheetComponent)
      },
      {
        path: 'gym/:gymId/competitor/:id/edit',
        canActivate: [gymPermissionGuard],
        canDeactivate: [pendingChangesGuard],
        data: { gymPermission: 'canCreateRoutines' },
        loadComponent: () => import('./features/competitor/competitor-sheet.component').then((m) => m.CompetitorSheetComponent)
      },
      {
        path: 'gym/:gymId/exercises/new',
        canActivate: [gymMemberGuard],
        data: { astra: true },
        loadComponent: () => import('./features/exercises-astra/exercise-form-astra.component').then((m) => m.ExerciseFormAstraComponent)
      },
      {
        path: 'gym/:gymId/exercises/:id/edit',
        canActivate: [gymMemberGuard],
        data: { astra: true },
        loadComponent: () => import('./features/exercises-astra/exercise-form-astra.component').then((m) => m.ExerciseFormAstraComponent)
      },
      {
        path: 'gym/:gymId/exercises',
        canActivate: [gymMemberGuard],
        data: {},
        loadComponent: () => import('./features/exercises-astra/exercises-astra.component').then((m) => m.ExercisesAstraComponent)
      },
      {
        path: 'gym/:gymId/measurements',
        canActivate: [gymMemberGuard],
        data: { kind: 'measurements' },
        loadComponent: () => import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent)
      },
      {
        path: 'dashboard',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'clients/new',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/clients/client-form/client-form.component').then((m) => m.ClientFormComponent)
      },
      {
        path: 'clients/:id/edit',
        canActivate: [activeWorkspaceGuard],
        data: { profileEdit: true },
        loadComponent: () => import('./features/clients/client-detail/client-detail.component').then((m) => m.ClientDetailComponent)
      },
      {
        path: 'clients/:id',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/clients/client-detail/client-detail.component').then((m) => m.ClientDetailComponent)
      },
      {
        path: 'clients',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
        data: { kind: 'clients' }
      },
      {
        path: 'routines',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
        data: { kind: 'routines' }
      },
      {
        path: 'routines/new',
        canActivate: [activeWorkspaceGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/routines/routine-builder.component').then((m) => m.RoutineBuilderComponent)
      },
      {
        path: 'routines/:id',
        canActivate: [activeWorkspaceGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/routines/routine-builder.component').then((m) => m.RoutineBuilderComponent)
      },
      {
        path: 'competitor/new',
        canActivate: [activeWorkspaceGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/competitor/competitor-sheet.component').then((m) => m.CompetitorSheetComponent)
      },
      {
        path: 'competitor/:id/edit',
        canActivate: [activeWorkspaceGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/competitor/competitor-sheet.component').then((m) => m.CompetitorSheetComponent)
      },
      {
        path: 'admin',
        pathMatch: 'full',
        redirectTo: 'admin/coaches'
      },
      {
        path: 'admin/announcements',
        canActivate: [adminGuard],
        canDeactivate: [pendingChangesGuard],
        loadComponent: () => import('./features/admin/admin-announcements.component').then((m) => m.AdminAnnouncementsComponent)
      },
      {
        path: 'admin/activity',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-activity.component').then((m) => m.AdminActivityComponent)
      },
      {
        path: 'admin/maintenance',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-maintenance.component').then((m) => m.AdminMaintenanceComponent)
      },
      {
        path: 'admin/coaches',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-coaches.component').then((m) => m.AdminCoachesComponent)
      },
      {
        path: 'admin/coaches/:id/clients',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-clients.component').then((m) => m.AdminClientsComponent)
      },
      {
        path: 'admin/coaches/:id',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-coach-detail.component').then((m) => m.AdminCoachDetailComponent)
      },
      {
        path: 'admin/clients',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-clients.component').then((m) => m.AdminClientsComponent)
      },
      {
        path: 'admin/clients/:coachId/:clientId/routine/new',
        canActivate: [adminGuard],
        canDeactivate: [pendingChangesGuard],
        data: { adminContext: true },
        loadComponent: () => import('./features/routines/routine-builder.component').then((m) => m.RoutineBuilderComponent)
      },
      {
        path: 'admin/clients/:coachId/:clientId/routine/:id',
        canActivate: [adminGuard],
        canDeactivate: [pendingChangesGuard],
        data: { adminContext: true },
        loadComponent: () => import('./features/routines/routine-builder.component').then((m) => m.RoutineBuilderComponent)
      },
      {
        path: 'admin/clients/:coachId/:clientId/edit',
        canActivate: [adminGuard],
        canDeactivate: [pendingChangesGuard],
        data: { editMode: true },
        loadComponent: () => import('./features/admin/admin-client-detail.component').then((m) => m.AdminClientDetailComponent)
      },
      {
        path: 'admin/clients/:coachId/:clientId',
        canActivate: [adminGuard],
        loadComponent: () => import('./features/admin/admin-client-detail.component').then((m) => m.AdminClientDetailComponent)
      },
      {
        path: 'exercises/admin',
        data: { adminView: 'catalog' },
        canActivate: [adminGuard],
        loadComponent: () => import('./features/global-exercises/global-exercise-admin.component').then((m) => m.GlobalExerciseAdminComponent)
      },
      {
        path: 'seed-exercises',
        data: { adminView: 'seed' },
        canActivate: [adminGuard],
        loadComponent: () => import('./features/global-exercises/global-exercise-admin.component').then((m) => m.GlobalExerciseAdminComponent)
      },
      {
        path: 'exercises-astra/new',
        canActivate: [activeWorkspaceGuard],
        data: { astra: true, libraryRoute: '/exercises' },
        loadComponent: () => import('./features/exercises-astra/exercise-form-astra.component').then((m) => m.ExerciseFormAstraComponent)
      },
      {
        path: 'exercises-astra/:id/edit',
        canActivate: [activeWorkspaceGuard],
        data: { astra: true, libraryRoute: '/exercises' },
        loadComponent: () => import('./features/exercises-astra/exercise-form-astra.component').then((m) => m.ExerciseFormAstraComponent)
      },
      {
        path: 'exercises-astra',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/exercises-astra/exercises-astra.component').then((m) => m.ExercisesAstraComponent)
      },
      {
        path: 'exercises/new',
        canActivate: [activeWorkspaceGuard],
        data: { astra: true, libraryRoute: '/exercises' },
        loadComponent: () => import('./features/exercises-astra/exercise-form-astra.component').then((m) => m.ExerciseFormAstraComponent)
      },
      {
        path: 'exercises/:id/edit',
        canActivate: [activeWorkspaceGuard],
        data: { astra: true, libraryRoute: '/exercises' },
        loadComponent: () => import('./features/exercises-astra/exercise-form-astra.component').then((m) => m.ExerciseFormAstraComponent)
      },
      {
        path: 'exercises',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/exercises-astra/exercises-astra.component').then((m) => m.ExercisesAstraComponent)
      },
      {
        path: 'measurements',
        canActivate: [activeWorkspaceGuard],
        loadComponent: () => import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
        data: { kind: 'measurements' }
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
