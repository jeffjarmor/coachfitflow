import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CoachDataService, CoachProfile, TrainingSessionRecord } from '../../../core/data/coach-data.service';
import { GymContextService } from '../../gyms/gym-context.service';
import { ClientDetailComponent } from './client-detail.component';

const profile: CoachProfile = { id: 'coach', name: 'Coach', email: 'coach@example.invalid', brandColor: '',
  role: 'coach', accountType: 'independent', coachPlan: 'paid', nextPlanPaymentDate: '2099-12-31' };
function history(count: number): TrainingSessionRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${index}`, sessionDate: `2026-10-${String(28 - index).padStart(2, '0')}`,
    status: index % 2 ? 'completed' : 'in_progress',
    sets: [{ id: `set-${index}`, routineDayId: 'day', exerciseName: 'Sentadilla', exerciseOrder: 0,
      setNumber: 1, actualReps: 10, rir: 2, load: 40, loadUnit: 'kg' }]
  }));
}

describe('Client detail RIR pagination', () => {
  let fixture: ComponentFixture<ClientDetailComponent>;
  let component: ClientDetailComponent;
  let data: jasmine.SpyObj<CoachDataService>;
  const rows = history(23);

  beforeEach(async () => {
    data = jasmine.createSpyObj<CoachDataService>('CoachDataService', ['getTrainingHistory'], { currentProfile: signal(profile) });
    data.getTrainingHistory.and.resolveTo(structuredClone(rows));
    await TestBed.configureTestingModule({ imports: [ClientDetailComponent], providers: [provideRouter([]),
      { provide: AuthService, useValue: { user: signal({ id: profile.id }) } },
      { provide: CoachDataService, useValue: data },
      { provide: GymContextService, useValue: { activeGym: signal(null) } }
    ] }).compileComponents();
    fixture = TestBed.createComponent(ClientDetailComponent);
    component = fixture.componentInstance;
    component.clientId = 'client';
    component.client.set({ id: 'client', name: 'Atleta', email: 'client@example.invalid', age: 30, goal: '' });
    component.profile.set(profile); component.loading.set(false); component.activeTab.set('rir');
    await component.refreshTrainingHistory(); await settle();
  });
  afterEach(() => fixture.destroy());
  async function settle() { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); }
  function button(name: string): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('.rir-pagination button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent!.trim() === name)!;
  }
  function visibleIds(): string[] { return component.visibleRirSessions().map(session => session.id); }

  it('shows five records per page and reaches the final partial page without missing or duplicating sessions', async () => {
    expect(fixture.nativeElement.querySelectorAll('.rir-session').length).toBe(5);
    expect(button('Anterior').disabled).toBeTrue();
    expect(component.rirVisibleRange()).toBe('1–5');
    const seen = visibleIds();
    for (let page = 2; page <= 5; page++) {
      button('Siguiente').click(); await settle();
      expect(component.rirPage()).toBe(page);
      expect(document.activeElement?.id).toBe('client-rir-title');
      seen.push(...visibleIds());
    }
    expect(fixture.nativeElement.querySelectorAll('.rir-session').length).toBe(3);
    expect(component.rirVisibleRange()).toBe('21–23'); expect(button('Siguiente').disabled).toBeTrue();
    expect(seen).toEqual(rows.map(row => row.id));
    expect(data.getTrainingHistory).toHaveBeenCalledTimes(1);
  });

  it('preserves expanded sessions while moving between pages and keeps accordion controls accessible', async () => {
    component.goToRirPage(2); await settle();
    const header = fixture.nativeElement.querySelector('.rir-session-header') as HTMLButtonElement;
    expect(header.getAttribute('aria-expanded')).toBe('false');
    header.click(); await settle();
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector(`[id="${header.getAttribute('aria-controls')}"]`)).not.toBeNull();
    expect(header.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    component.goToRirPage(1); await settle(); component.goToRirPage(2); await settle();
    expect(fixture.nativeElement.querySelector('.rir-session-header').getAttribute('aria-expanded')).toBe('true');
    expect(data.getTrainingHistory).toHaveBeenCalledTimes(1);
  });

  it('supports 5, 10 and 20 records per page and restarts at page one without refetching', async () => {
    expect(component.rirPageSize()).toBe(5);
    component.goToRirPage(3); await settle();
    component.toggleRirSession('session-12');
    for (const size of [10, 20, 5]) {
      component.changeRirPageSize(size); await settle();
      expect(component.rirPageSize()).toBe(size);
      expect(component.rirPage()).toBe(1);
      expect(component.visibleRirSessions().length).toBe(size);
      expect(component.rirTotalPages()).toBe(Math.ceil(23 / size));
      expect(component.isRirSessionExpanded('session-12')).toBeTrue();
    }
    for (const invalid of [0, 1, 4, 6, Number.NaN]) component.changeRirPageSize(invalid);
    expect(component.rirPageSize()).toBe(5);
    expect(data.getTrainingHistory).toHaveBeenCalledTimes(1);
  });

  it('clamps page boundaries and ignores invalid page numbers', async () => {
    component.goToRirPage(-20); expect(component.rirPage()).toBe(1);
    component.goToRirPage(999); await settle(); expect(component.rirPage()).toBe(5);
    component.goToRirPage(Number.NaN); component.goToRirPage(1.5);
    expect(component.rirPage()).toBe(5);
  });

  it('keeps the current page and explicit closed accordion states during an automatic refresh', async () => {
    component.toggleRirSession('session-0');
    component.goToRirPage(2); await settle(); component.toggleRirSession('session-5');
    data.getTrainingHistory.and.resolveTo([...history(1).map(row => ({ ...row, id: 'new' })), ...rows]);
    await component.refreshTrainingHistory(true); await settle();
    expect(component.rirPage()).toBe(2);
    expect(component.isRirSessionExpanded('session-0')).toBeFalse();
    expect(component.isRirSessionExpanded('session-5')).toBeTrue();
  });

  it('returns to the last available page after the history shrinks and hides pagination for a short history', async () => {
    component.goToRirPage(3); await settle();
    data.getTrainingHistory.and.resolveTo(history(3));
    await component.refreshTrainingHistory(true); await settle();
    expect(component.rirPage()).toBe(1); expect(component.visibleRirSessions().length).toBe(3);
    expect(fixture.nativeElement.querySelector('.rir-pagination').hidden).toBeTrue();
    expect(fixture.nativeElement.querySelector('.rir-pagination nav')).toBeNull();
    data.getTrainingHistory.and.resolveTo([]);
    await component.refreshTrainingHistory(); await settle();
    expect(fixture.nativeElement.querySelector('.empty-state').textContent).toContain('Sin historial RIR');
    expect(component.rirVisibleRange()).toBe('0');
  });

  it('preserves the page and records when refresh fails and offers a retry without exposing the raw error', async () => {
    component.goToRirPage(2); await settle();
    data.getTrainingHistory.and.rejectWith(new Error('private backend error'));
    await component.refreshTrainingHistory(); await settle();
    expect(component.rirPage()).toBe(2); expect(visibleIds()).toEqual(rows.slice(5, 10).map(row => row.id));
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Reintentar');
    expect(fixture.nativeElement.textContent).not.toContain('private backend error');
  });

  it('discards a pending refresh for a client that is no longer being viewed', async () => {
    let complete!: (value: TrainingSessionRecord[]) => void;
    data.getTrainingHistory.and.returnValue(new Promise(resolve => { complete = resolve; }));
    const pending = component.refreshTrainingHistory();
    component.clientId = 'another-client'; component.trainingHistory.set([]);
    complete(rows); await pending; await settle();
    expect(component.trainingHistory()).toEqual([]);
  });

  it('retains the original Pro access gate', async () => {
    component.profile.set({ ...profile, coachPlan: 'standard' });
    data.getTrainingHistory.calls.reset();
    await component.refreshTrainingHistory(); await settle();
    expect(data.getTrainingHistory).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('#client-rir-panel')).toBeNull();
  });
});
