import { CustomSelectComponent } from '../../../shared/custom-select.component';
import { internationalPhoneValidator } from '../../../shared/phone-number';

import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GymContextService } from '../../gyms/gym-context.service';
import { GymPaymentsService } from '../../gyms/gym-payments.service';
import { GymMembershipPlan } from '../../gyms/gym-payments.models';
import { AuthService } from '../../../core/auth/auth.service';
import { ClientInput, CoachDataService } from '../../../core/data/coach-data.service';
import { hasActiveIndependentPro, localCalendarDate } from '../../../core/data/plan-access';

@Component({
  selector: 'app-client-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, CustomSelectComponent],
  templateUrl: './client-form.component.html',
  styleUrl: './client-form.component.scss'
})
export class ClientFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly data = inject(CoachDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gyms = inject(GymContextService);
  private readonly payments = inject(GymPaymentsService);
  readonly membershipOptions = computed(() => this.membershipPlans().map(plan => ({value:plan.id,label:`${plan.name} · ${plan.price} ${plan.currency}`})));
  readonly membershipPlans = signal<GymMembershipPlan[]>([]);
  readonly canManageMembership = computed(() => ['admin', 'owner'].includes(this.gyms.activeGym()?.role || ''));

  readonly clientId = this.route.snapshot.paramMap.get('id');
  readonly gymId = this.route.snapshot.paramMap.get('gymId') || '';
  readonly editing = !!this.clientId;
  readonly embedded = input(false);
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  readonly loading = signal(this.editing);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly saveFailed = signal(false);
  readonly loaded = signal(!this.editing);
  readonly initialMeasurements = signal<Pick<ClientInput, 'weight' | 'height'> | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/^[\p{L}\s'-]+$/u)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', internationalPhoneValidator],
    address: [''],
    birthDate: ['', Validators.required],
    goal: [''],
    notes: [''],
    membershipPlanId: ['']
  });

  constructor() {
    if (this.clientId) void this.loadClient();
  }

  async ngOnInit(): Promise<void> {
    if (this.gymId && this.canManageMembership()) {
      try { this.membershipPlans.set((await this.payments.load(this.gymId)).plans.filter(plan => plan.active)); }
      catch { this.error.set('No pudimos cargar las membresías. Inténtalo nuevamente antes de guardar.'); }
    }
  }

  async loadClient(): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId || !this.clientId) return;
    this.loading.set(true);
    this.error.set('');
    this.saveFailed.set(false);
    this.loaded.set(false);
    try {
      const client = await this.data.getClient(this.clientId, coachId, this.gymId || undefined);
      this.form.patchValue({
        name: client.name,
        email: client.email,
        phone: client.phone || '',
        address: client.address || '',
        birthDate: client.birthDate || '',
        goal: client.goal,
        notes: client.notes || '',
        membershipPlanId: client.membershipPlanId || ''
      });
      this.initialMeasurements.set({ weight: client.weight, height: client.height });
      this.form.markAsPristine();
      this.loaded.set(true);
    } catch {
      this.error.set('No pudimos cargar este cliente. Vuelve a la lista e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving() || !this.loaded()) {
      this.form.markAllAsTouched();
      return;
    }
    const coachId = this.auth.user()?.id;
    if (!coachId) return;
    this.saving.set(true);
    this.error.set('');
    this.saveFailed.set(false);
    try {
      const value = this.form.getRawValue();
      const input: ClientInput = {
        name: value.name,
        email: value.email,
        phone: value.phone,
        address: value.address,
        birthDate: value.birthDate,
        goal: value.goal,
        notes: value.notes,
        ...(this.gymId && this.canManageMembership() ? { membershipPlanId: value.membershipPlanId || null } : {})
      };
      if (this.clientId) {
        await this.data.updateClient(this.clientId, coachId, input, this.gymId || undefined);
        if (this.embedded()) {
          this.saved.emit();
        } else {
          await this.router.navigate(this.clientRoute(this.clientId), { queryParams: { result: 'updated' } });
        }
      } else {
        const id = await this.data.createClient(coachId, input, this.gymId || undefined);
        let portalInvite: 'sent' | 'rate-limited' | 'failed' | undefined;
        try {
          if (this.gymId) {
            await this.auth.inviteGymClient(this.gymId, id, input.email);
            portalInvite = 'sent';
          } else {
            const profile = await this.data.getProfile(coachId);
            if (this.hasActiveIndependentPro(profile)) {
            await this.auth.inviteIndependentClient(coachId, id, input.email);
            portalInvite = 'sent';
            }
          }
        } catch (inviteError) {
          portalInvite = (inviteError as { code?: string })?.code === 'INVITE_RATE_LIMIT'
            ? 'rate-limited'
            : 'failed';
        }
        await this.router.navigate(this.clientRoute(id), {
          queryParams: { result: 'created', ...(portalInvite ? { portalInvite } : {}) }
        });
      }
    } catch (error) {
      this.saveFailed.set(true);
      const message = error instanceof Error ? error.message : '';
      this.error.set(message.includes('correo ya está registrado')
        ? message
        : 'No pudimos guardar el cliente. Revisa los datos e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  isMinorBirthDate(birthDate: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
    const today = localCalendarDate();
    const adultBirthDate = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
    return birthDate > adultBirthDate && birthDate <= today;
  }

  clientsRoute(): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients'] : ['/clients'];
  }

  clientRoute(clientId: string): string[] {
    return this.gymId ? ['/gym', this.gymId, 'clients', clientId] : ['/clients', clientId];
  }

  private hasActiveIndependentPro(profile: { accountType: string; coachPlan: string; nextPlanPaymentDate?: string | null }): boolean {
    return hasActiveIndependentPro(profile);
  }
}
