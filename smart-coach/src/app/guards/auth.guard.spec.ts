import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';
import { publicOnlyGuard } from './public-only.guard';

@Component({ standalone: true, template: 'Privado' })
class PrivateTestComponent {}

@Component({ standalone: true, template: 'Login' })
class LoginTestComponent {}

@Component({ standalone: true, template: 'Dashboard' })
class DashboardTestComponent {}

describe('authentication routing on session restore', () => {
    let router: Router;
    let authService: {
        waitForAuthReady: jasmine.Spy;
        ensureSession: jasmine.Spy;
        getCurrentUserId: jasmine.Spy;
        isClientPortalUser: jasmine.Spy;
    };

    beforeEach(async () => {
        authService = {
            waitForAuthReady: jasmine.createSpy().and.resolveTo(),
            ensureSession: jasmine.createSpy(),
            getCurrentUserId: jasmine.createSpy(),
            isClientPortalUser: jasmine.createSpy().and.returnValue(false)
        };

        await TestBed.configureTestingModule({
            providers: [
                provideRouter([
                    { path: 'private', component: PrivateTestComponent, canActivate: [authGuard] },
                    { path: 'login', component: LoginTestComponent, canActivate: [publicOnlyGuard] },
                    { path: 'dashboard', component: DashboardTestComponent }
                ]),
                { provide: AuthService, useValue: authService }
            ]
        }).compileComponents();
        router = TestBed.inject(Router);
    });

    it('keeps a protected route when Supabase restores the persisted user', async () => {
        authService.ensureSession.and.resolveTo({ id: 'gym-owner-id' });
        authService.getCurrentUserId.and.returnValue('gym-owner-id');
        const harness = await RouterTestingHarness.create();

        const component = await harness.navigateByUrl('/private', PrivateTestComponent);

        expect(component).toBeInstanceOf(PrivateTestComponent);
        expect(router.url).toBe('/private');
        expect(authService.waitForAuthReady).toHaveBeenCalled();
        expect(authService.ensureSession).toHaveBeenCalled();
    });

    it('redirects an authenticated user away from the login route', async () => {
        authService.ensureSession.and.resolveTo({ id: 'gym-owner-id' });
        authService.getCurrentUserId.and.returnValue('gym-owner-id');
        const harness = await RouterTestingHarness.create();

        const component = await harness.navigateByUrl('/login', DashboardTestComponent);

        expect(component).toBeInstanceOf(DashboardTestComponent);
        expect(router.url).toBe('/dashboard');
    });
});
