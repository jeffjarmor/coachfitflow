import { DEFAULT_BRAND_COLOR } from '../../core/data/branding';
import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PendingChangesAware } from '../../core/auth/pending-changes.guard';
import { CoachDataService } from '../../core/data/coach-data.service';
import { GymContextService } from './gym-context.service';
import { GymSettingsService } from './gym-settings.service';

const MAX_LOGO_SIZE = 4 * 1024 * 1024;
const ACCEPTED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-gym-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './gym-settings.component.html',
  styleUrl: './gym-settings.component.scss'
})
export class GymSettingsComponent implements OnInit, PendingChangesAware {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly coachData = inject(CoachDataService);
  private readonly gyms = inject(GymContextService);
  private readonly settingsData = inject(GymSettingsService);
  private readonly fb = inject(FormBuilder);

  readonly gymId = this.route.snapshot.paramMap.get('id') || '';
  readonly context = this.gyms.activeGym;
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly rotating = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly logoPreview = signal<string | null>(null);
  readonly rotateDialogOpen = signal(false);
  readonly copied = signal(false);
  readonly hasLogoChange = signal(false);
  selectedLogo: File | null = null;
  private originalLogoUrl: string | null = null;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    phone: ['', Validators.maxLength(40)],
    address: ['', Validators.maxLength(300)],
    brandColor: [DEFAULT_BRAND_COLOR, [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)]]
  });

  get canSave(): boolean {
    return this.form.valid && !this.saving() && (this.form.dirty || this.hasLogoChange());
  }

  async ngOnInit(): Promise<void> {
    this.loadFromContext();
  }

  loadFromContext(): void {
    const gym = this.context()?.gym;
    if (!gym || gym.id !== this.gymId) {
      this.error.set('No pudimos cargar la configuración. Vuelve al resumen y reintenta.');
      this.loading.set(false);
      return;
    }
    this.originalLogoUrl = gym.logoUrl || null;
    this.logoPreview.set(this.originalLogoUrl);
    this.selectedLogo = null;
    this.hasLogoChange.set(false);
    this.form.reset({
      name: gym.name,
      email: gym.email || '',
      phone: gym.phone || '',
      address: gym.address || '',
      brandColor: gym.brandColor || DEFAULT_BRAND_COLOR
    });
    this.form.markAsPristine();
    this.loading.set(false);
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
      this.error.set('El logo debe pesar menos de 4 MB.');
      input.value = '';
      return;
    }
    this.error.set('');
    this.notice.set('');
    this.selectedLogo = file;
    this.hasLogoChange.set(true);
    const reader = new FileReader();
    reader.onload = () => this.logoPreview.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.selectedLogo = null;
    this.logoPreview.set(null);
    this.hasLogoChange.set(!!this.originalLogoUrl);
    this.notice.set('El logo se retirará cuando guardes los cambios.');
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    let uploadedUrl: string | null = null;
    let updated = false;
    try {
      if (this.selectedLogo) uploadedUrl = await this.settingsData.uploadLogo(this.gymId, this.selectedLogo);
      const value = this.form.getRawValue();
      const nextLogoUrl = uploadedUrl || (this.logoPreview() ? this.originalLogoUrl : null);
      await this.settingsData.update(this.gymId, {
        ...value,
        logoUrl: nextLogoUrl,
        brandColor: value.brandColor.toUpperCase()
      });
      updated = true;

      const previousLogoUrl = this.originalLogoUrl;
      // The update has committed. Keep its logo referenced even if refreshing
      // the context fails, and do not present the upload as an unsaved retry.
      this.originalLogoUrl = nextLogoUrl;
      this.logoPreview.set(nextLogoUrl);
      this.selectedLogo = null;
      this.hasLogoChange.set(false);
      this.form.markAsPristine();
      await this.refreshContext();
      this.loadFromContext();
      this.notice.set('La información del gimnasio quedó actualizada.');
      if (previousLogoUrl && previousLogoUrl !== nextLogoUrl) {
        try { await this.settingsData.removeLogo(this.gymId, previousLogoUrl); } catch { /* Best-effort old file cleanup. */ }
      }
    } catch (error) {
      if (uploadedUrl && !updated) {
        try { await this.settingsData.removeLogo(this.gymId, uploadedUrl); } catch { /* Preserve the original error. */ }
      }
      this.error.set(updated
        ? 'La configuración quedó guardada, pero no pudimos actualizar la vista. Recarga la página antes de hacer más cambios.'
        : this.settingsError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async copyAccessCode(): Promise<void> {
    const code = this.context()?.gym.accessCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
      window.setTimeout(() => this.copied.set(false), 2200);
    } catch {
      this.notice.set(`Código actual: ${code}`);
    }
  }

  async confirmRotateCode(): Promise<void> {
    if (this.rotating()) return;
    this.rotating.set(true);
    this.error.set('');
    try {
      const code = await this.settingsData.rotateAccessCode(this.gymId);
      await this.refreshContext();
      this.rotateDialogOpen.set(false);
      this.notice.set(`Código renovado: ${code}. El código anterior dejó de funcionar.`);
    } catch {
      this.error.set('No pudimos renovar el código. Revisa tu conexión e inténtalo nuevamente.');
      this.rotateDialogOpen.set(false);
    } finally {
      this.rotating.set(false);
    }
  }

  canDeactivate(): boolean {
    return (!this.form.dirty && !this.hasLogoChange())
      || window.confirm('Tienes cambios sin guardar. ¿Quieres salir de configuración?');
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.form.dirty && !this.hasLogoChange()) return;
    event.preventDefault();
  }

  private async refreshContext(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Not authenticated');
    const profile = await this.coachData.getProfile(userId);
    await this.gyms.loadAccessibleGyms(userId, profile.role, true);
    if (!this.gyms.activateGym(this.gymId, userId)) throw new Error('Gym access unavailable');
  }

  private settingsError(error: unknown): string {
    const message = String((error as { message?: string } | null)?.message || '').toLocaleLowerCase('es');
    if (message.includes('owner access required') || message.includes('permission denied')) {
      return 'Tu acceso cambió y ya no permite modificar este gimnasio. Vuelve al resumen para continuar.';
    }
    if (message.includes('invalid gym email')) return 'Revisa el correo del gimnasio e inténtalo nuevamente.';
    if (message.includes('payload too large') || message.includes('maximum allowed size')) return 'El logo supera el tamaño permitido de 4 MB.';
    return 'No pudimos guardar la configuración. Revisa los datos y vuelve a intentarlo.';
  }
}
