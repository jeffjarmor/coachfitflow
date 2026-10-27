import { DEFAULT_BRAND_COLOR } from '../../core/data/branding';
import { ZUMMITH_CONTACT } from '../../core/config/contact';

import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { GymContextService } from '../gyms/gym-context.service';
import { GymStaffService } from '../gyms/gym-staff.service';
import { GymContext } from '../gyms/gym.models';
import { AuthService } from '../../core/auth/auth.service';
import { CoachDataService, CoachProfile } from '../../core/data/coach-data.service';
import { isPaidPlanCurrent } from '../../core/data/plan-access';
import { fadeOutModal } from '../../shared/modal-motion';

const MAX_LOGO_SIZE = 5 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss'
})
export class ProfileComponent implements OnInit, OnDestroy {
  readonly contact = ZUMMITH_CONTACT;
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly gyms = inject(GymContextService);
  private readonly staff = inject(GymStaffService);
  readonly affiliations = this.gyms.gyms;
  readonly leaving = signal(false);
  readonly leaveTarget = signal<GymContext | null>(null);
  private successTimer?: ReturnType<typeof setTimeout>;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly profile = signal<CoachProfile | null>(null);
  readonly logoPreview = signal<string | null>(null);
  readonly deleteDialogOpen = signal(false);

  selectedLogo: File | null = null;

  readonly profileForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: [{ value: '', disabled: true }],
    phone: [''],
    brandColor: [DEFAULT_BRAND_COLOR, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]]
  });

  get name() { return this.profileForm.controls.name; }
  get brandColor() { return this.profileForm.controls.brandColor; }

  get canSave(): boolean {
    return this.profileForm.valid && !this.saving() && (this.profileForm.dirty || !!this.selectedLogo);
  }

  get canDeleteAccount(): boolean {
    const profile = this.profile();
    return profile?.accountType === 'independent' && profile.role === 'coach';
  }

  get planLabel(): string {
    return this.profile()?.coachPlan === 'paid' ? 'Plan Pro' : 'Plan Estándar';
  }

  get planDescription(): string {
    if (this.profile()?.coachPlan !== 'paid') {
      return 'Tu espacio para organizar clientes, rutinas, ejercicios y mediciones.';
    }
    return this.isSubscriptionPending
      ? 'Tu renovación está pendiente. Algunas funciones Pro permanecen pausadas.'
      : 'Tus funciones Pro están activas para este periodo.';
  }

  get isSubscriptionPending(): boolean {
    const profile = this.profile();
    if (!profile || profile.accountType !== 'independent' || profile.coachPlan !== 'paid') return false;
    if (!profile.nextPlanPaymentDate) return true;
    return !isPaidPlanCurrent(profile.nextPlanPaymentDate);
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  ngOnDestroy(): void {
    if (this.successTimer) clearTimeout(this.successTimer);
  }

  async load(): Promise<void> {
    const coachId = this.auth.user()?.id;
    if (!coachId) {
      this.error.set('No encontramos una sesión activa. Inicia sesión nuevamente.');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      const profile = await this.coachData.getProfile(coachId);
      this.profile.set(profile);
      await this.gyms.loadAccessibleGyms(coachId, profile.role, true);
      this.logoPreview.set(profile.logoUrl || null);
      this.selectedLogo = null;
      this.profileForm.reset({
        name: profile.name,
        email: profile.email,
        phone: profile.phone || '',
        brandColor: profile.brandColor || DEFAULT_BRAND_COLOR
      });
      this.profileForm.markAsPristine();
    } catch {
      this.error.set('No pudimos cargar tu perfil. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  async leaveGym(): Promise<void> {
    const context = this.leaveTarget();
    const userId = this.auth.user()?.id;
    if (!context || !userId || this.leaving() || context.role === 'owner' || context.role === 'admin') return;
    this.leaving.set(true);
    this.error.set('');
    try {
      await this.staff.remove(context.gym.id, userId);
      this.leaveTarget.set(null);
      await this.load();
      this.success.set('Saliste del gimnasio. Tus otras afiliaciones se conservan.');
    } catch {
      this.error.set('No pudimos completar la salida. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.leaving.set(false);
    }
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
      this.error.set('Usa una imagen PNG, JPG o WebP.');
      input.value = '';
      return;
    }

    if (file.size > MAX_LOGO_SIZE) {
      this.error.set('El logo debe pesar menos de 5 MB.');
      input.value = '';
      return;
    }

    this.error.set('');
    this.success.set('');
    this.selectedLogo = file;
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const coachId = this.auth.user()?.id;
    if (!coachId) {
      this.error.set('Tu sesión terminó. Inicia sesión nuevamente para guardar.');
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      let logoUrl: string | undefined;
      if (this.selectedLogo) {
        logoUrl = await this.coachData.uploadCoachLogo(coachId, this.selectedLogo);
      }

      const formValue = this.profileForm.getRawValue();
      const updatedProfile = await this.coachData.updateProfile(coachId, {
        name: formValue.name,
        phone: formValue.phone,
        brandColor: formValue.brandColor.toUpperCase(),
        ...(logoUrl ? { logoUrl } : {})
      });

      this.profile.set(updatedProfile);
      this.logoPreview.set(updatedProfile.logoUrl || null);
      this.selectedLogo = null;
      this.profileForm.patchValue({ brandColor: updatedProfile.brandColor });
      this.profileForm.markAsPristine();
      this.success.set('Tus cambios se guardaron correctamente.');
      if (this.successTimer) clearTimeout(this.successTimer);
      this.successTimer = setTimeout(() => this.success.set(''), 4000);
    } catch {
      this.error.set('No pudimos guardar los cambios. Revisa tu conexión e inténtalo nuevamente.');
    } finally {
      this.saving.set(false);
    }
  }

  openDeleteDialog(): void {
    this.deleteDialogOpen.set(true);
  }

  closeDeleteDialog(): void {
    if (!this.deleting()) this.deleteDialogOpen.set(false);
  }

  async deleteAccount(modal?: HTMLElement): Promise<void> {
    if (!this.canDeleteAccount || this.deleting()) return;

    this.deleting.set(true);
    this.error.set('');
    try {
      await this.coachData.deleteCurrentCoachAccount();
      await fadeOutModal(modal);
      await this.auth.signOut();
      await this.router.navigateByUrl('/');
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code;
      this.error.set(code === '23503'
        ? 'Hay clientes o trabajo compartidos con un gimnasio u otro entrenador. Resuelve esos vínculos antes de eliminar tu cuenta para conservar sus datos.'
        : code === 'ACCOUNT_DELETION_INCOMPLETE'
          ? 'Tu cuenta sigue activa, pero algunos archivos se retiraron. Contacta a soporte antes de volver a intentar el borrado.'
        : code === 'PGRST202' || code === '42883'
          ? 'La eliminación de cuenta aún no está habilitada en este entorno. Contacta a soporte para gestionar la solicitud.'
        : 'No pudimos eliminar la cuenta. Inténtalo nuevamente o contacta a soporte.');
      this.deleteDialogOpen.set(false);
    } finally {
      this.deleting.set(false);
    }
  }
}
