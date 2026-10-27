import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ClientMeasurement, ClientRecord, CoachDataService, CoachProfile } from '../../../core/data/coach-data.service';
import { GymContextService } from '../../gyms/gym-context.service';
import { ClientDetailComponent } from './client-detail.component';

const client: ClientRecord = {
  id: 'client', name: 'Cliente de mediciones', email: 'client@example.invalid', age: 32,
  weight: 72.4, height: 175.3, goal: 'Seguimiento corporal'
};
const profile: CoachProfile = {
  id: 'coach', name: 'Entrenador', email: 'coach@example.invalid', brandColor: '',
  role: 'coach', accountType: 'independent', coachPlan: 'standard'
};

describe('Client measurement form DOM regression', () => {
  let fixture: ComponentFixture<ClientDetailComponent>;
  let component: ClientDetailComponent;
  let data: jasmine.SpyObj<CoachDataService>;

  beforeEach(async () => {
    data = jasmine.createSpyObj<CoachDataService>('CoachDataService', ['saveClientMeasurement'], {
      currentProfile: signal(profile)
    });
    data.saveClientMeasurement.and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [ClientDetailComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ id: profile.id }) } },
        { provide: CoachDataService, useValue: data },
        { provide: GymContextService, useValue: { activeGym: signal(null) } }
      ]
    }).compileComponents();
    // The real router's empty root route prevents constructor-driven loading;
    // RouterLink still gets a valid ActivatedRoute snapshot.
    expect(TestBed.inject(ActivatedRoute).snapshot.paramMap.get('id')).toBeNull();
    fixture = TestBed.createComponent(ClientDetailComponent);
    component = fixture.componentInstance;
    spyOn(component, 'loadRelated').and.resolveTo();
    component.clientId = client.id;
    component.client.set(client);
    component.profile.set(profile);
    component.loading.set(false);
    component.activeTab.set('measurements');
    await settle();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function button(root: ParentNode, text: string): HTMLButtonElement {
    const match = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent?.trim() === text);
    if (!match) throw new Error(`Missing measurement button: ${text}`);
    return match;
  }

  function form(): HTMLFormElement {
    return fixture.nativeElement.querySelector('.editor-dialog form');
  }

  function input(key: string): HTMLInputElement | HTMLTextAreaElement {
    const selector = key === 'notes' ? '[formcontrolname="notes"]' : `#measurement-${key}`;
    const control = form().querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    if (!control) throw new Error(`Missing measurement input: ${key}`);
    return control;
  }

  function fill(key: string, value: string): void {
    const control = input(key);
    control.value = value;
    // Exercise Angular's NumberValueAccessor rather than patching FormControls
    // with strings, which hid the production regression in earlier UI tests.
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();
  }

  async function openNew(): Promise<void> {
    button(fixture.nativeElement.querySelector('#client-measurements-panel'), 'Nueva medición').click();
    await settle();
  }

  async function submit(): Promise<void> {
    button(form(), 'Guardar medición').click();
    await settle();
  }

  it('submits real numeric inputs, cleared optional nulls and meaningful zeros without a string conversion error', async () => {
    await openNew();
    for (const [key, value] of Object.entries({
      weight: '79.6', height: '176.3', bodyFatPercentage: '19.3', muscleMass: '51.7',
      visceralFat: '0', metabolicAge: '34', calories: '0', boneMass: '3.4', waterPercentage: '0',
      calf: '37.2', thigh: '55.3', hips: '99.4', waist: '83.5', chest: '102.6', arms: '33.7',
      notes: 'Valores escritos en el formulario'
    })) fill(key, value);
    fill('muscleMass', '');
    expect(component.measurementForm.controls.bodyFatPercentage.value).toBe(19.3);
    expect(component.measurementForm.controls.muscleMass.value).toBeNull();
    expect(button(form(), 'Guardar medición').disabled).toBeFalse();

    await submit();

    expect(data.saveClientMeasurement).toHaveBeenCalledOnceWith(client.id, jasmine.objectContaining({
      weight: 79.6, height: 176.3, bodyFatPercentage: 19.3, muscleMass: null,
      visceralFat: 0, metabolicAge: 34, calories: 0, boneMass: 3.4, waterPercentage: 0,
      calf: 37.2, thigh: 55.3, hips: 99.4, waist: 83.5, chest: 102.6, arms: 33.7,
      notes: 'Valores escritos en el formulario'
    }), undefined, undefined);
    expect(component.editor()).toBeNull();
    expect(component.notice()).toContain('La medición quedó guardada');
  });

  it('edits a historical record without replacing its hidden date, legacy legs or existing zeros', async () => {
    const legacy: ClientMeasurement = {
      id: 'historical-measurement', date: '2024-02-03', weight: 79.6, height: 176.3, bmi: 25.6,
      legs: 63.2, bodyFatPercentage: 0, visceralFat: 0, waterPercentage: 0, notes: 'Original'
    };
    component.measurements.set([legacy]);
    await settle();
    button(fixture.nativeElement.querySelector('#client-measurements-panel'), 'Editar').click();
    await settle();
    expect(form().querySelector('input[type="date"], #measurement-date, #measurement-legs, [formcontrolname="legs"]')).toBeNull();
    expect(input('bodyFatPercentage').value).toBe('0');
    fill('weight', '81.2');
    fill('notes', 'Actualización del control histórico');

    await submit();

    expect(data.saveClientMeasurement).toHaveBeenCalledOnceWith(client.id, jasmine.objectContaining({
      date: '2024-02-03', legs: 63.2, weight: 81.2, bodyFatPercentage: 0, visceralFat: 0,
      waterPercentage: 0, notes: 'Actualización del control histórico'
    }), legacy.id, undefined);
    expect(legacy.date).toBe('2024-02-03');
    expect(legacy.weight).toBe(79.6);
  });

  it('enforces original ranges, exposes field errors and rejects invalid submissions before calling the service', async () => {
    await openNew();
    fill('weight', '20'); fill('height', '100');
    expect(button(form(), 'Guardar medición').disabled).toBeFalse();
    fill('weight', '300'); fill('height', '250');
    expect(button(form(), 'Guardar medición').disabled).toBeFalse();
    const invalid = {
      weight: '19.9', height: '250.1', bodyFatPercentage: '100.1', muscleMass: '-1',
      visceralFat: '-1', metabolicAge: '9', calories: '-1', boneMass: '-1', waterPercentage: '100.1',
      calf: '-1', thigh: '-1', hips: '-1', waist: '-1', chest: '-1', arms: '-1'
    };
    for (const [key, value] of Object.entries(invalid)) {
      fill(key, value);
      expect(input(key).getAttribute('aria-invalid')).withContext(key).toBe('true');
      const errorId = input(key).getAttribute('aria-describedby');
      expect(form().querySelector(`#${errorId}`)?.textContent?.trim()).withContext(key).toBeTruthy();
    }
    expect(button(form(), 'Guardar medición').disabled).toBeTrue();
    // Keyboard/programmatic submits must also be rejected by the form handler.
    form().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(data.saveClientMeasurement).not.toHaveBeenCalled();
    expect(component.editor()).toBe('measurement');
  });

  it('retains a failed numeric draft with an inline error and submits the same values on an explicit retry', async () => {
    await openNew();
    fill('weight', '82.4'); fill('height', '175.3');
    fill('bodyFatPercentage', '18.7'); fill('notes', 'Conservar hasta guardar');
    data.saveClientMeasurement.and.rejectWith(new Error('private backend detail'));

    await submit();

    expect(data.saveClientMeasurement).toHaveBeenCalledTimes(1);
    const firstArguments = data.saveClientMeasurement.calls.argsFor(0);
    expect(component.editor()).toBe('measurement');
    expect(input('weight').value).toBe('82.4');
    expect(input('bodyFatPercentage').value).toBe('18.7');
    expect(input('notes').value).toBe('Conservar hasta guardar');
    expect(form().querySelector('[role="alert"]')?.textContent).toContain('Tus datos siguen en el formulario');
    expect(form().textContent).not.toContain('private backend detail');
    expect(button(form(), 'Guardar medición').disabled).toBeFalse();
    expect(component.loadRelated).not.toHaveBeenCalled();

    data.saveClientMeasurement.and.resolveTo();
    await submit();

    expect(data.saveClientMeasurement).toHaveBeenCalledTimes(2);
    expect(data.saveClientMeasurement.calls.argsFor(1)).toEqual(firstArguments);
    expect(component.loadRelated).toHaveBeenCalledTimes(1);
    expect(component.editor()).toBeNull();
    expect(component.measurementSaveError()).toBe('');
  });
});
