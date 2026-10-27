import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SupabaseService } from '../../core/auth/supabase.service';
import { SetPasswordComponent } from './set-password.component';

describe('Password reset form parity with the original', () => {
  let fixture: ComponentFixture<SetPasswordComponent>;
  let actionAuth: { verifyOtp: jasmine.Spy; updateUser: jasmine.Spy; signOut: jasmine.Spy; dispose: jasmine.Spy };
  let originalUrl: string;
  let navigate: jasmine.Spy;

  beforeEach(async () => {
    originalUrl = window.location.href;
    window.history.replaceState({}, '', '/set-password?token_hash=local-unit-action&type=recovery');
    actionAuth = { verifyOtp: jasmine.createSpy('verifyOtp').and.resolveTo({ data: { session: { user: { id: 'recovery-account' } } }, error: null }),
      updateUser: jasmine.createSpy('updateUser').and.resolveTo({ error: null }),
      signOut: jasmine.createSpy('signOut').and.resolveTo({ error: null }), dispose: jasmine.createSpy('dispose').and.resolveTo() };
    TestBed.configureTestingModule({ imports: [SetPasswordComponent], providers: [provideRouter([]),
      { provide: SupabaseService, useValue: { createPasswordActionClient: () => ({ auth: actionAuth }) } }] });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(SetPasswordComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    window.history.replaceState({}, '', originalUrl);
  });

  async function enter(selector: string, value: string): Promise<void> {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('rejects passwords missing uppercase, lowercase or a number before updating the recovery identity', async () => {
    for (const weak of ['password1', 'PASSWORD1', 'Password']) {
      await enter('#new-password', weak);
      await enter('#password-confirmation', weak);
      await submit();
      expect(actionAuth.updateUser).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('#new-password').classList.contains('is-invalid')).toBeTrue();
    }
    expect(fixture.nativeElement.textContent).toContain('mayúscula, minúscula y número');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('requires matching strong passwords and updates only the validated isolated action client', async () => {
    await enter('#new-password', 'Segura2026');
    await enter('#password-confirmation', 'Distinta2026');
    await submit();
    expect(actionAuth.updateUser).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Las contraseñas no coinciden');
    await enter('#password-confirmation', 'Segura2026');
    await submit();
    expect(actionAuth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'local-unit-action', type: 'recovery' });
    expect(actionAuth.updateUser).toHaveBeenCalledOnceWith({ password: 'Segura2026' });
    expect(actionAuth.signOut).toHaveBeenCalledOnceWith({ scope: 'local' });
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { passwordUpdated: '1' } });
  });
});
