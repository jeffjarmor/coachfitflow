import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ClientRecord, CoachDataService } from '../../../core/data/coach-data.service';
import { AdminClientDetailComponent } from '../../admin/admin-client-detail.component';
import { AdminClientDetail, AdminDataService } from '../../admin/admin-data.service';
import { GymContextService } from '../../gyms/gym-context.service';
import { GymPaymentsService } from '../../gyms/gym-payments.service';
import { ClientFormComponent } from './client-form.component';

const client: ClientRecord = { id: 'client', name: 'Ana Mora', email: 'ana@example.invalid', phone: '88881111',
  birthDate: '1992-06-15', age: 34, weight: 72.4, height: 175.3, goal: 'Seguimiento', notes: 'Control anterior' };
const detail: AdminClientDetail = { client: { ...client, contextKey: 'independent:client', coachId: 'coach', coachName: 'Entrenador',
  phone: client.phone!, birthDate: client.birthDate!, weight: client.weight!, height: client.height!, notes: client.notes!,
  address: null, createdAt: null, scope: 'independent', gymId: null, gymName: null, membershipId: null,
  subscriptionStatus: null, portalStatus: null, routineCount: 0, measurementCount: 0 }, routines: [], measurements: [] };

for (const surface of ['coach', 'admin'] as const) {
  describe(`${surface} client physical inputs through Angular`, () => {
    let fixture: ComponentFixture<ClientFormComponent | AdminClientDetailComponent>;
    let update: jasmine.Spy;

    beforeEach(async () => {
      update = jasmine.createSpy('updateClient').and.resolveTo();
      const coachData = { getClient: jasmine.createSpy().and.resolveTo(client), updateClient: update,
        getClientMeasurements: jasmine.createSpy().and.resolveTo([]), currentProfile: signal(null) };
      const adminData = { getClientDetail: jasmine.createSpy().and.resolveTo(detail), listCoaches: jasmine.createSpy().and.resolveTo([]), updateClient: update };
      await TestBed.configureTestingModule({ imports: [ClientFormComponent, AdminClientDetailComponent], providers: [
        provideRouter([]), { provide: AuthService, useValue: { user: signal({ id: 'coach' }) } },
        { provide: CoachDataService, useValue: coachData }, { provide: AdminDataService, useValue: adminData },
        { provide: GymContextService, useValue: { activeGym: signal(null) } }, { provide: GymPaymentsService, useValue: {} }
      ] }).compileComponents();
      const route = TestBed.inject(ActivatedRoute);
      spyOn(route.snapshot.paramMap, 'get').and.callFake(key => key === 'id' || key === 'clientId' ? 'client' : key === 'coachId' ? 'coach' : null);
      spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      fixture = surface === 'coach' ? TestBed.createComponent(ClientFormComponent) : TestBed.createComponent(AdminClientDetailComponent);
      await settle();
      if (surface === 'admin') {
        (fixture.componentInstance as AdminClientDetailComponent).startEditing();
        await settle();
      }
    });

    afterEach(() => fixture.destroy());

    async function settle() {
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    }
    function input(key: string): HTMLInputElement {
      return fixture.nativeElement.querySelector(`input[formcontrolname="${key}"]`);
    }
    async function fill(key: string, value: string) {
      const element = input(key);
      expect(element).withContext(key).not.toBeNull();
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
      await settle();
    }
    async function submit() {
      const form = input('weight').closest('form')!;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();
    }
    function payload() { return update.calls.mostRecent().args[surface === 'coach' ? 2 : 1]; }

    it('saves international phone formats without losing the country code or separators', async () => {
      for (const phone of ['88887777', '+506 8888 7777', '+1 (212) 555-0123', '+34 612 345 678']) {
        if (surface === 'admin') { (fixture.componentInstance as AdminClientDetailComponent).startEditing(); await settle(); }
        await fill('phone', phone); await submit();
        expect(update).withContext(phone).toHaveBeenCalled();
        expect(payload().phone).withContext(phone).toBe(phone);
      }
      expect(update).toHaveBeenCalledTimes(4);
    });

    it('rejects malformed phone numbers and still allows clearing the optional field', async () => {
      for (const phone of ['abc12345678', '++50688887777', '---', '+1234567890123456']) {
        await fill('phone', phone); await submit();
        expect(update).withContext(phone).not.toHaveBeenCalled();
        expect(fixture.componentInstance.form.controls.phone.invalid).toBeTrue();
      }
      await fill('phone', ''); await submit();
      expect(update).toHaveBeenCalledTimes(1);
      expect(payload().phone).toBe('');
    });

    it('saves changed decimal numbers and then permits clearing both optional metrics', async () => {
      await fill('weight', '73.6'); await fill('height', '176.4');
      await submit();
      expect(update).toHaveBeenCalledTimes(1);
      expect(payload()).toEqual(jasmine.objectContaining({ weight: 73.6, height: 176.4 }));

      if (surface === 'admin') { (fixture.componentInstance as AdminClientDetailComponent).startEditing(); await settle(); }
      await fill('weight', ''); await fill('height', '');
      await submit();
      expect(update).toHaveBeenCalledTimes(2);
      expect(payload()).toEqual(jasmine.objectContaining({ weight: null, height: null }));
      expect(fixture.componentInstance.error()).toBe('');
    });

    it('rejects out-of-range metrics and identifies the invalid inputs', async () => {
      await fill('weight', '19'); await fill('height', '301');
      await submit();
      expect(update).not.toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain('El peso debe estar entre 20 y 500 kg.');
      expect(fixture.nativeElement.textContent).toContain('La altura debe estar entre 50 y 300 cm.');
    });

    it('keeps a failed numeric draft available and retries those values without losing other fields', async () => {
      await fill('weight', '74.2'); await fill('height', '');
      update.and.rejectWith(new Error('connection interrupted'));
      await submit();
      expect(update).toHaveBeenCalledTimes(1);
      expect(input('weight').value).toBe('74.2');
      expect(input('height').value).toBe('');
      expect(fixture.componentInstance.error()).toContain('No pudimos guardar');
      const first = payload();
      update.and.resolveTo();
      if (surface === 'coach') {
        const retry: HTMLButtonElement = fixture.nativeElement.querySelector('[role="alert"] button');
        expect(retry.textContent).toContain('Reintentar guardado');
        retry.click();
        await settle();
      } else {
        await submit();
      }
      expect(update).toHaveBeenCalledTimes(2);
      expect(payload()).toEqual(first);
      expect(payload()).toEqual(jasmine.objectContaining({ name: client.name, email: client.email, weight: 74.2, height: null }));
    });
  });
}
