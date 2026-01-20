import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: '/dashboard',
        pathMatch: 'full'
    },
    {
        path: 'login',
        loadComponent: () => import('./pages/auth/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'signup',
        loadComponent: () => import('./pages/auth/signup/signup.component').then(m => m.SignupComponent)
    },
    {
        path: 'dashboard',
        loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent),
        canActivate: [authGuard]
    },
    {
        path: 'clients',
        loadComponent: () => import('./pages/clients/client-list/client-list.component').then(m => m.ClientListComponent),
        canActivate: [authGuard]
    },
    {
        path: 'clients/new',
        loadComponent: () => import('./pages/clients/client-form/client-form.component').then(m => m.ClientFormComponent),
        canActivate: [authGuard]
    },
    {
        path: 'clients/:id/edit',
        loadComponent: () => import('./pages/clients/client-form/client-form.component').then(m => m.ClientFormComponent),
        canActivate: [authGuard]
    },
    {
        path: 'clients/:id',
        loadComponent: () => import('./pages/clients/client-detail/client-detail.component').then(m => m.ClientDetailComponent),
        canActivate: [authGuard]
    },
    {
        path: 'exercises',
        loadComponent: () => import('./pages/exercises/exercise-library/exercise-library.component').then(m => m.ExerciseLibraryComponent),
        canActivate: [authGuard]
    },
    {
        path: 'exercises/new',
        loadComponent: () => import('./pages/exercises/exercise-form/exercise-form.component').then(m => m.ExerciseFormComponent),
        canActivate: [authGuard]
    },
    {
        path: 'exercises/:id/edit',
        loadComponent: () => import('./pages/exercises/exercise-form/exercise-form.component').then(m => m.ExerciseFormComponent),
        canActivate: [authGuard]
    },
    {
        path: 'exercises/admin',
        loadComponent: () => import('./pages/exercises/global-exercise-admin/global-exercise-admin.component').then(m => m.GlobalExerciseAdminComponent),
        canActivate: [authGuard]
    },
    {
        path: 'seed-exercises',
        loadComponent: () => import('./pages/seed-exercises/seed-exercises.component').then(m => m.SeedExercisesComponent),
        canActivate: [authGuard]
    },
    {
        path: 'routines/new',
        loadComponent: () => import('./pages/routines/routine-wizard/routine-wizard.component').then(m => m.RoutineWizardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'routines/:id',
        loadComponent: () => import('./pages/routines/routine-detail/routine-detail.component').then(m => m.RoutineDetailComponent),
        canActivate: [authGuard]
    },
    {
        path: 'admin/coaches',
        loadComponent: () => import('./pages/admin/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: 'admin/coaches/:id',
        loadComponent: () => import('./pages/admin/admin-coach-detail/admin-coach-detail.component').then(m => m.AdminCoachDetailComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: 'admin/coaches/:id/clients',
        loadComponent: () => import('./pages/admin/coach-clients/coach-clients.component').then(m => m.CoachClientsComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: 'admin/clients',
        loadComponent: () => import('./pages/admin/admin-clients/admin-clients.component').then(m => m.AdminClientsComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: 'admin/clients/:coachId/:clientId',
        loadComponent: () => import('./pages/admin/admin-client-detail/admin-client-detail.component').then(m => m.AdminClientDetailComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: 'admin/clients/:coachId/:clientId/routine/new',
        loadComponent: () => import('./pages/routines/routine-wizard/routine-wizard.component').then(m => m.RoutineWizardComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: 'admin/clients/:coachId/:clientId/edit',
        loadComponent: () => import('./pages/clients/client-form/client-form.component').then(m => m.ClientFormComponent),
        canActivate: [authGuard, adminGuard]
    },
    {
        path: '**',
        redirectTo: '/dashboard'
    }
];
