import { DEFAULT_BRAND_COLOR } from '../../core/data/branding';
import { Component, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PendingChangesAware } from '../../core/auth/pending-changes.guard';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from './gym-context.service';
import { GymOnboardingService } from './gym-onboarding.service';

interface StoredDraft {
  requestId: string;
  step: number;
  value: ReturnType<GymOnboardingComponent['form']['getRawValue']>;
}

@Component({
  selector: 'app-gym-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './gym-onboarding.component.html',
  styleUrl: './gym-onboarding.component.scss'
})
export class GymOnboardingComponent implements OnInit, OnDestroy, PendingChangesAware {
  readonly defaultBrandColor = DEFAULT_BRAND_COLOR;
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);
  private readonly onboarding = inject(GymOnboardingService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly step = signal(1);
  readonly error = signal('');
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    phone: ['', Validators.maxLength(40)],
    address: ['', Validators.maxLength(300)],
    brandColor: [DEFAULT_BRAND_COLOR, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]]
  });

  private requestId: string = crypto.randomUUID();
  private storageKey = '';
  private formSubscription?: Subscription;
  private allowNavigation = false;

  async ngOnInit(): Promise<void> {
    await this.auth.waitUntilReady();
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.error.set('Tu sesión terminó. Inicia sesión nuevamente para crear el gimnasio.');
      this.loading.set(false);
      return;
    }

    this.storageKey = `zummith:gym-onboarding:${userId}`;
    try {
      await this.auth.ensureCoachProfileForCurrentUser();
      const profile = await this.coachData.getProfile(userId);
      const stored = this.readDraft();
      if (stored) {
        this.requestId = stored.requestId;
        this.step.set(stored.step === 2 ? 2 : 1);
        this.form.reset(stored.value);
        this.form.markAsDirty();
      } else {
        this.form.reset({
          name: '',
          email: profile.email || '',
          phone: profile.phone || '',
          address: '',
          brandColor: profile.brandColor || DEFAULT_BRAND_COLOR
        });
        this.form.markAsPristine();
      }
      this.formSubscription = this.form.valueChanges.subscribe(() => this.persistDraft());
    } catch {
      this.error.set('No pudimos preparar el formulario. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.formSubscription?.unsubscribe();
  }

  continueToReview(): void {
    const controls = [this.form.controls.name, this.form.controls.email, this.form.controls.phone];
    controls.forEach((control) => control.markAsTouched());
    if (controls.some((control) => control.invalid)) return;
    this.error.set('');
    this.step.set(2);
    this.persistDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  returnToDetails(): void {
    this.step.set(1);
    this.error.set('');
    this.persistDraft();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.error.set('Tu sesión terminó. Inicia sesión nuevamente para crear el gimnasio.');
      return;
    }

    this.submitting.set(true);
    this.error.set('');
    try {
      const created = await this.onboarding.create(this.requestId, this.form.getRawValue());
      const profile = await this.coachData.getProfile(userId);
      await this.gyms.loadAccessibleGyms(userId, profile.role, true);
      if (!this.gyms.activateGym(created.id, userId)) throw new Error('Gym context unavailable');
      this.clearDraft();
      this.allowNavigation = true;
      await this.router.navigate(['/gym/dashboard', created.id], {
        queryParams: { created: '1' }
      });
    } catch (error) {
      this.error.set(this.creationError(error));
      this.persistDraft();
    } finally {
      this.submitting.set(false);
    }
  }

  canDeactivate(): boolean {
    return this.allowNavigation || !this.form.dirty
      || window.confirm('Tienes un gimnasio sin terminar. ¿Quieres salir y conservar el borrador?');
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.form.dirty || this.allowNavigation) return;
    event.preventDefault();
  }

  private persistDraft(): void {
    if (!this.storageKey || !this.form.dirty) return;
    try {
      const draft: StoredDraft = {
        requestId: this.requestId,
        step: this.step(),
        value: this.form.getRawValue()
      };
      sessionStorage.setItem(this.storageKey, JSON.stringify(draft));
    } catch {
      // The active form remains available if session storage is unavailable.
    }
  }

  private readDraft(): StoredDraft | null {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredDraft;
      if (!parsed.requestId || !parsed.value) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private clearDraft(): void {
    try { sessionStorage.removeItem(this.storageKey); } catch { /* Nothing to clear. */ }
  }

  private creationError(error: unknown): string {
    const message = String((error as { message?: string } | null)?.message || '').toLocaleLowerCase('es');
    if (message.includes('invalid gym email')) return 'Revisa el correo del gimnasio antes de continuar.';
    if (message.includes('coach profile not found')) return 'Tu perfil todavía no está listo. Recarga la página e inténtalo nuevamente.';
    if (message.includes('not authenticated')) return 'Tu sesión terminó. Inicia sesión nuevamente para continuar.';
    if (message.includes('unique') || message.includes('access code')) return 'No pudimos reservar un código único. Inténtalo nuevamente.';
    return 'No pudimos crear el gimnasio. El borrador sigue guardado; revisa tu conexión y reintenta.';
  }
}
