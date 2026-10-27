import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from './gym-context.service';
import { GymContext } from './gym.models';
import { GymSettingsComponent } from './gym-settings.component';
import { GymSettingsService } from './gym-settings.service';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1GgAAAAASUVORK5CYII=';
const initialContext: GymContext = {
  gym: { id: 'gym', name: 'Gimnasio inicial', accessCode: 'TEST12', brandColor: '#CCFF00' }, role: 'owner', roleLabel: 'Dueño', primaryOwner: true,
  permissions: { canEditClients: true, canCreateRoutines: true, canViewPayments: true, canManageStaff: true, canManageSettings: true }
};

describe('Gym settings upload and confirmed-save failures', () => {
  let fixture: ComponentFixture<GymSettingsComponent>;
  let component: GymSettingsComponent;
  let settings: jasmine.SpyObj<GymSettingsService>;
  let coachData: jasmine.SpyObj<CoachDataService>;
  let gyms: jasmine.SpyObj<GymContextService>;
  const activeGym = signal(initialContext);

  beforeEach(async () => {
    activeGym.set({ ...initialContext, gym: { ...initialContext.gym } });
    settings = jasmine.createSpyObj<GymSettingsService>('GymSettingsService', ['uploadLogo', 'update', 'removeLogo']);
    settings.uploadLogo.and.resolveTo(`${png}#uploaded`);
    settings.removeLogo.and.resolveTo();
    settings.update.and.callFake(async (_id, input) => { activeGym.set({ ...activeGym(), gym: { ...activeGym().gym, ...input } }); });
    coachData = jasmine.createSpyObj<CoachDataService>('CoachDataService', ['getProfile']);
    coachData.getProfile.and.resolveTo({ id: 'owner', name: 'Dueño', email: 'owner@example.invalid', brandColor: '#CCFF00', role: 'owner', accountType: 'gym', coachPlan: 'standard' });
    gyms = jasmine.createSpyObj<GymContextService>('GymContextService', ['loadAccessibleGyms', 'activateGym'], { activeGym });
    gyms.loadAccessibleGyms.and.resolveTo([initialContext]); gyms.activateGym.and.callFake(() => activeGym());
    await TestBed.configureTestingModule({ imports: [GymSettingsComponent], providers: [
      provideRouter([]), { provide: AuthService, useValue: { user: signal({ id: 'owner' }) } },
      { provide: CoachDataService, useValue: coachData }, { provide: GymContextService, useValue: gyms },
      { provide: GymSettingsService, useValue: settings }
    ] }).compileComponents();
    spyOn(TestBed.inject(ActivatedRoute).snapshot.paramMap, 'get').and.callFake(key => key === 'id' ? 'gym' : null);
    fixture = TestBed.createComponent(GymSettingsComponent); component = fixture.componentInstance; await settle();
  });

  async function settle(): Promise<void> { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  async function editAndChooseLogo(): Promise<File> {
    const name = fixture.nativeElement.querySelector('#gym-name') as HTMLInputElement;
    name.value = 'Gimnasio actualizado'; name.dispatchEvent(new Event('input', { bubbles: true }));
    const file = new File([Uint8Array.from(atob(png.split(',')[1]), character => character.charCodeAt(0))], 'logo.png', { type: 'image/png' });
    const files = new DataTransfer(); files.items.add(file);
    const input = fixture.nativeElement.querySelector('#gym-logo') as HTMLInputElement;
    input.files = files.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(); return file;
  }
  async function submit(): Promise<void> {
    fixture.nativeElement.querySelector('#gym-settings-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  }

  it('starts with black when the gym has no saved color and keeps an explicitly selected color', async () => {
    activeGym.set({ ...initialContext, gym: { ...initialContext.gym, brandColor: null } });
    component.loadFromContext(); await settle();
    expect(component.form.controls.brandColor.value).toBe('#000000');
    activeGym.set({ ...initialContext, gym: { ...initialContext.gym, brandColor: '#126C50' } });
    component.loadFromContext(); await settle();
    expect(component.form.controls.brandColor.value).toBe('#126C50');
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('never removes a logo already referenced by a confirmed update when refreshing the page context fails', async () => {
    await editAndChooseLogo(); coachData.getProfile.and.rejectWith(new Error('refresh connection interrupted'));
    await submit();
    expect(settings.update).toHaveBeenCalledWith('gym', jasmine.objectContaining({ name: 'Gimnasio actualizado', logoUrl: `${png}#uploaded` }));
    expect(settings.removeLogo).not.toHaveBeenCalled();
    expect(component.logoPreview()).toBe(`${png}#uploaded`);
    expect(component.selectedLogo).toBeNull();
    expect(component.canSave).toBeFalse();
    expect((fixture.nativeElement.querySelector('#gym-name') as HTMLInputElement).value).toBe('Gimnasio actualizado');
    expect(component.error()).toContain('quedó guardada');
  });

  it('removes only an uncommitted upload and preserves the entered form and selected file for a genuine save retry', async () => {
    const file = await editAndChooseLogo(); settings.update.and.rejectWith(new Error('update connection interrupted'));
    await submit();
    expect(settings.removeLogo).toHaveBeenCalledOnceWith('gym', `${png}#uploaded`);
    expect(component.selectedLogo).toBe(file);
    expect(component.canSave).toBeTrue();
    expect((fixture.nativeElement.querySelector('#gym-name') as HTMLInputElement).value).toBe('Gimnasio actualizado');
    expect(component.saving()).toBeFalse();
    settings.uploadLogo.and.resolveTo(`${png}#retry`);
    settings.update.and.callFake(async (_id, input) => { activeGym.set({ ...activeGym(), gym: { ...activeGym().gym, ...input } }); });
    await submit();
    expect(settings.uploadLogo.calls.count()).toBe(2);
    expect(settings.update).toHaveBeenCalledWith('gym', jasmine.objectContaining({ name: 'Gimnasio actualizado', logoUrl: `${png}#retry` }));
    expect(component.selectedLogo).toBeNull();
    expect(component.error()).toBe('');
    expect(component.notice()).toContain('quedó actualizada');
  });
});
