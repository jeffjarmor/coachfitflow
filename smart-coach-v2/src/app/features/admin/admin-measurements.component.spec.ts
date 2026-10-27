import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgForm, NgModel } from '@angular/forms';
import { ClientMeasurement, CoachDataService } from '../../core/data/coach-data.service';
import { AdminMeasurementsComponent } from './admin-measurements.component';

describe('Admin measurement capture through the real form', () => {
  let fixture: ComponentFixture<AdminMeasurementsComponent>;
  let component: AdminMeasurementsComponent;
  let data: jasmine.SpyObj<CoachDataService>;

  beforeEach(async () => {
    data = jasmine.createSpyObj<CoachDataService>('CoachDataService', ['getClientMeasurements', 'saveClientMeasurement']);
    data.getClientMeasurements.and.resolveTo([]);
    data.saveClientMeasurement.and.resolveTo();
    TestBed.configureTestingModule({ imports: [AdminMeasurementsComponent], providers: [{ provide: CoachDataService, useValue: data }] });
    fixture = TestBed.createComponent(AdminMeasurementsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('clientId', 'selected-client');
    fixture.componentRef.setInput('gymId', 'selected-gym');
    fixture.detectChanges();
    await fixture.whenStable();
    component.edit();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => fixture.destroy());

  function inputFor(name: string): HTMLInputElement | HTMLTextAreaElement {
    const field = fixture.debugElement.queryAll(By.directive(NgModel))
      .find(element => element.injector.get(NgModel).name === name);
    if (!field) throw new Error(`The ${name} field must be rendered`);
    return field.nativeElement;
  }

  async function enter(name: string, value: string): Promise<void> {
    // Dynamic [name] configures NgModel, without guaranteeing a native name
    // attribute. Locate the actual control registered with Angular's form.
    const input = inputFor(name);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function ngForm(): NgForm {
    return fixture.debugElement.query(By.directive(NgForm)).injector.get(NgForm);
  }

  it('sends numeric optional values, preserves zero and converts a cleared number to null in the selected gym context', async () => {
    expect(data.getClientMeasurements).toHaveBeenCalledWith('selected-client', 'selected-gym');
    await enter('weight', '68.5');
    await enter('height', '172.5');
    await enter('bodyFatPercentage', '0');
    await enter('calories', '0');
    await enter('calf', '36.4');
    await enter('muscleMass', '32.5');
    await enter('muscleMass', '');
    expect(ngForm().valid).toBeTrue();
    await submit();
    expect(data.saveClientMeasurement).toHaveBeenCalledTimes(1);
    const [clientId, payload, measurementId, gymId] = data.saveClientMeasurement.calls.mostRecent().args;
    expect([clientId, measurementId, gymId]).toEqual(['selected-client', undefined, 'selected-gym']);
    expect(payload).toEqual(jasmine.objectContaining({ weight: 68.5, height: 172.5, bodyFatPercentage: 0, calories: 0, calf: 36.4, muscleMass: null }));
    expect(typeof payload.calf).toBe('number');
    expect(component.editing()).toBeFalse();
  });

  it('keeps the historical date and legacy legs value when editing without exposing either as a capture field', async () => {
    const measurement: ClientMeasurement = { id: 'historical-measurement', date: '2024-03-12', weight: 76, height: 174,
      bmi: 25.1, legs: 57.5, thigh: 54, calf: 35, notes: 'Control anterior' };
    component.edit(measurement);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const renderedControls = fixture.debugElement.queryAll(By.directive(NgModel))
      .map(element => element.injector.get(NgModel).name);
    expect(renderedControls).not.toContain('date');
    expect(renderedControls).not.toContain('legs');
    await enter('weight', '75.2');
    await enter('thigh', '53.5');
    await submit();
    expect(data.saveClientMeasurement).toHaveBeenCalledWith('selected-client', jasmine.objectContaining({
      date: '2024-03-12', legs: 57.5, weight: 75.2, thigh: 53.5, calf: 35
    }), 'historical-measurement', 'selected-gym');
  });

  it('rejects original out-of-range values through NgForm and shows the corresponding field messages', async () => {
    await enter('weight', '70');
    await enter('height', '170');
    for (const scenario of [
      { field: 'weight', invalid: '19', valid: '70', error: 'entre 20 y 300 kg' },
      { field: 'height', invalid: '251', valid: '170', error: 'entre 100 y 250 cm' },
      { field: 'bodyFatPercentage', invalid: '101', valid: '0', error: 'entre 0 y 100' },
      { field: 'metabolicAge', invalid: '9', valid: '10', error: 'entre 10 y 100 años' },
      { field: 'waist', invalid: '-1', valid: '0', error: 'igual o mayor que 0 cm' }
    ]) {
      await enter(scenario.field, scenario.invalid);
      expect(ngForm().invalid).withContext(scenario.field).toBeTrue();
      await submit();
      expect(data.saveClientMeasurement).not.toHaveBeenCalled();
      const error = fixture.nativeElement.querySelector(`#admin-measurement-${scenario.field}-error`);
      expect(error?.textContent).withContext(scenario.field).toContain(scenario.error);
      expect(inputFor(scenario.field).getAttribute('aria-invalid')).toBe('true');
      await enter(scenario.field, scenario.valid);
      expect(ngForm().valid).withContext(`Corrected ${scenario.field}`).toBeTrue();
    }
  });

  it('retains the entered draft after a save failure and retries the same values successfully', async () => {
    data.saveClientMeasurement.and.rejectWith(new Error('connection interrupted'));
    const changed = spyOn(component.changed, 'emit');
    await enter('weight', '72.4');
    await enter('height', '168');
    await enter('waterPercentage', '0');
    await enter('notes', 'Seguimiento de esta semana');
    await submit();
    const firstPayload = data.saveClientMeasurement.calls.mostRecent().args[1];
    expect(component.editing()).toBeTrue();
    expect(component.saving()).toBeFalse();
    expect(component.draft).toEqual(jasmine.objectContaining({ weight: 72.4, height: 168, waterPercentage: 0, notes: 'Seguimiento de esta semana' }));
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('No pudimos guardar la medición');
    expect(inputFor('weight').value).toBe('72.4');
    expect(changed).not.toHaveBeenCalled();
    data.saveClientMeasurement.and.resolveTo();
    await submit();
    expect(data.saveClientMeasurement).toHaveBeenCalledTimes(2);
    expect(data.saveClientMeasurement.calls.mostRecent().args[1]).toEqual(firstPayload);
    expect(component.error()).toBe('');
    expect(component.editing()).toBeFalse();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
