import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { PendingChangesAware } from '../../core/auth/pending-changes.guard';
import { localCalendarDate } from '../../core/data/plan-access';
import {
  ClientPortalContext,
  ClientPortalDataService,
  ClientPortalMeasurement,
  ClientPortalProfile
} from './client-portal-data.service';
import { ClientPortalHeaderComponent } from './client-portal-header.component';
import { AppFooterComponent } from '../../layout/app-footer/app-footer.component';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ClientPortalHeaderComponent, AppFooterComponent],
  templateUrl: './client-profile.component.html',
  styleUrl: './client-profile.component.scss'
})
export class ClientProfileComponent implements OnInit, PendingChangesAware {
  private readonly auth = inject(AuthService);
  private readonly portal = inject(ClientPortalDataService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly context = signal<ClientPortalContext | null>(null);
  readonly profile = signal<ClientPortalProfile | null>(null);
  readonly latestMeasurement = signal<ClientPortalMeasurement | null>(null);
  readonly maxBirthDate = localCalendarDate();

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: [{ value: '', disabled: true }],
    phone: ['', Validators.maxLength(50)],
    birthDate: [''],
    address: ['', Validators.maxLength(500)],
    notes: ['', Validators.maxLength(2000)]
  });

  ngOnInit(): void { void this.load(); }

  get canSave(): boolean { return this.form.valid && this.form.dirty && !this.saving(); }

  async load(): Promise<void> {
    const userId = this.auth.user()?.id;
    if (!userId) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const context = this.portal.initialContext(userId, await this.portal.listContexts(userId));
      if (!context) { this.error.set('No encontramos un perfil de cliente activo para esta cuenta.'); return; }
      this.context.set(context);
      const [profile, measurements] = await Promise.all([
        this.portal.getProfile(context), this.portal.getMeasurements(context)
      ]);
      this.profile.set(profile);
      this.latestMeasurement.set(measurements[0] ?? null);
      this.resetForm(profile);
    } catch {
      this.error.set('No pudimos cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.');
    } finally { this.loading.set(false); }
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.form.valid || !this.context()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const value = this.form.getRawValue();
      await this.portal.updateProfile(this.context()!, {
        name: value.name.trim(), phone: value.phone.trim(), birthDate: value.birthDate || this.profile()?.birthDate || null,
        address: this.profile()?.address || '', notes: value.notes.trim()
      });
      const profile = await this.portal.getProfile(this.context()!);
      this.profile.set(profile);
      this.resetForm(profile);
      this.success.set('Tus datos personales se guardaron correctamente.');
    } catch {
      this.error.set('No pudimos guardar tus cambios. Revisa los datos e inténtalo de nuevo.');
    } finally { this.saving.set(false); }
  }

  cancel(): void {
    const profile = this.profile();
    if (profile) this.resetForm(profile);
    this.success.set('');
    this.error.set('');
  }

  async requestPasswordReset(event: Event): Promise<void> {
    event.preventDefault();
    const email = this.auth.user()?.email;
    if (!email || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await this.auth.requestPasswordReset(email);
      this.success.set('Revisa tu correo. Te enviamos un enlace para cambiar tu contraseña.');
    } catch {
      this.error.set('No pudimos enviar el enlace. Inténtalo nuevamente.');
    } finally { this.saving.set(false); }
  }

  canDeactivate(): boolean {
    return !this.form.dirty || typeof window === 'undefined'
      || window.confirm('Tienes cambios sin guardar. ¿Quieres salir de esta página?');
  }

  formatDate(value: string | null): string {
    if (!value) return 'Sin registrar';
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
      : 'Sin registrar';
  }

  formatMonth(value: string): string {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(date)
      : 'Fecha no disponible';
  }

  formatValue(value: number | null, unit: string): string {
    return value == null ? 'Sin registrar' : `${new Intl.NumberFormat('es-CR', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
  }

  private resetForm(profile: ClientPortalProfile): void {
    this.form.reset({
      name: profile.name, email: profile.email, phone: profile.phone || '', birthDate: profile.birthDate || '',
      address: profile.address || '', notes: profile.notes || ''
    });
    this.form.markAsPristine();
  }
}
