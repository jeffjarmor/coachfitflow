import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, CoachProfile } from '../../core/data/coach-data.service';
import { GymContextService } from '../gyms/gym-context.service';
import { CompetitorDataService } from './competitor-data.service';
import { createCompetitorSheet } from './competitor.models';
import { CompetitorPdfService } from './competitor-pdf.service';
import { CompetitorSheetComponent } from './competitor-sheet.component';

describe('Competitor form text values and save/export recovery', () => {
  const profile: CoachProfile = { id: 'competitor-form-coach', name: 'Entrenador', email: 'coach@example.invalid',
    brandColor: '', role: 'coach', accountType: 'independent', coachPlan: 'standard' };
  let fixture: ComponentFixture<CompetitorSheetComponent>;
  let component: CompetitorSheetComponent;
  let data: jasmine.SpyObj<CompetitorDataService>;
  let pdf: jasmine.SpyObj<CompetitorPdfService>;
  let navigate: jasmine.Spy;

  beforeEach(async () => {
    data = jasmine.createSpyObj<CompetitorDataService>('CompetitorDataService', ['getClients', 'saveSheet']);
    data.getClients.and.resolveTo([{ id: 'client', name: 'Atleta', email: 'client@example.invalid' }]);
    data.saveSheet.and.resolveTo('saved-sheet');
    pdf = jasmine.createSpyObj<CompetitorPdfService>('CompetitorPdfService', ['download']);
    pdf.download.and.resolveTo();
    await TestBed.configureTestingModule({ imports: [CompetitorSheetComponent], providers: [provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ id: profile.id }), waitUntilReady: () => Promise.resolve() } },
      { provide: CoachDataService, useValue: { currentProfile: signal(profile), getProfile: () => Promise.resolve(profile) } },
      { provide: GymContextService, useValue: { activeGym: signal(null) } },
      { provide: CompetitorDataService, useValue: data }, { provide: CompetitorPdfService, useValue: pdf }
    ] }).compileComponents();
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CompetitorSheetComponent);
    component = fixture.componentInstance;
    await settle();
    const sheet = createCompetitorSheet('client', 'Atleta');
    Object.assign(sheet, { mesocycleTitle: 'Acumulación', macrocycleTitle: 'Temporada', frequencyText: '3 veces',
      splitText: 'Full body', trainingDaysText: 'Lunes, miércoles y viernes' });
    component.sheet.set(sheet);
    component.openBlocks.set({ A: 0 });
    component.step.set(2);
    await settle();
  });

  afterEach(() => {
    fixture?.destroy();
    const key = `zummith:competitor-draft:${profile.id}:independent:unassigned`;
    localStorage.removeItem(key); localStorage.removeItem(`${key}:step`);
  });
  async function settle(): Promise<void> { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function button(text: string): HTMLButtonElement {
    const result = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(item => item.textContent?.trim() === text);
    if (!result) throw new Error(`Missing competitor action: ${text}`);
    return result;
  }
  async function fill(input: HTMLInputElement, value: string): Promise<void> {
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true })); await settle();
  }

  it('keeps series notation, repetition ranges, zero text and fractional rest text as strings', async () => {
    expect(fixture.nativeElement.querySelector('input[type="number"]')).toBeNull();
    const inputs = fixture.nativeElement.querySelectorAll('.microcycle-grid section:first-child input');
    await fill(inputs[0], '0'); await fill(inputs[1], '8-12'); await fill(inputs[2], '1.5 min');
    component.step.set(component.totalSteps()); await settle();
    button('Guardar hoja').click(); await settle();
    expect(data.saveSheet).toHaveBeenCalledTimes(1);
    const block = data.saveSheet.calls.mostRecent().args[0].workouts[0].blocks[0];
    expect(block.microcycles[0]).toEqual({ series: '0', reps: '8-12' });
    expect(block.rest[0]).toBe('1.5 min');
    expect(component.error()).toBe('');
  });

  it('blocks an empty microcycle value without a conversion exception and preserves the entered text', async () => {
    const input = fixture.nativeElement.querySelector('.microcycle-grid section:first-child input') as HTMLInputElement;
    await fill(input, '');
    button('Continuar').click(); await settle();
    expect(component.step()).toBe(2);
    expect(input.value).toBe('');
    expect(fixture.nativeElement.querySelector('#competitor-validation')?.textContent).toContain('series');
    expect(data.saveSheet).not.toHaveBeenCalled();
  });

  it('retains the complete draft after a backend failure and retries the same sheet', async () => {
    const input = fixture.nativeElement.querySelector('.microcycle-grid section:first-child input') as HTMLInputElement;
    await fill(input, '3x');
    component.step.set(component.totalSteps()); await settle();
    const expected = structuredClone(component.sheet());
    data.saveSheet.and.rejectWith(new Error('private backend detail'));
    button('Guardar hoja').click(); await settle();
    expect(component.sheet()).toEqual(expected);
    expect(component.dirty()).toBeTrue();
    expect(component.saving()).toBeFalse();
    expect(component.error()).toContain('Tu borrador sigue disponible');
    expect(fixture.nativeElement.textContent).not.toContain('private backend detail');
    expect(navigate).not.toHaveBeenCalled();
    data.saveSheet.and.resolveTo('saved-sheet');
    button('Guardar hoja').click(); await settle();
    expect(data.saveSheet).toHaveBeenCalledTimes(2);
    expect(component.sheet().id).toBe('saved-sheet');
    expect(component.error()).toBe('');
  });

  it('keeps a successful save visible when PDF generation fails and retries export without a second database save', async () => {
    component.step.set(component.totalSteps()); await settle();
    pdf.download.and.rejectWith(new Error('private PDF error'));
    button('Guardar y descargar').click(); await settle();
    expect(data.saveSheet).toHaveBeenCalledTimes(1);
    expect(component.sheet().id).toBe('saved-sheet');
    expect(component.saving()).toBeFalse();
    expect(component.generatingPdf()).toBeFalse();
    expect(component.error()).toContain('No pudimos generar el PDF');
    expect(component.notice()).toContain('guard');
    expect(component.notice()).not.toContain('PDF se descargó');
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('No pudimos generar el PDF');

    pdf.download.and.resolveTo();
    button('Descargar PDF').click(); await settle();
    expect(pdf.download).toHaveBeenCalledTimes(2);
    expect(data.saveSheet).toHaveBeenCalledTimes(1);
    expect(component.error()).toBe('');
    expect(component.notice()).toContain('PDF de competidor se descargó');
  });
});
