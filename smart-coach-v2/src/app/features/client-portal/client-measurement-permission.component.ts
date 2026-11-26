import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CLIENT_MEASUREMENT_CONSENT_TEXT,
  ClientMeasurementConsent,
  ClientMeasurementConsentService
} from '../../core/data/client-measurement-consent.service';
import { ClientPortalContext } from './client-portal-data.service';

@Component({
  selector: 'app-client-measurement-permission',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './client-measurement-permission.component.html',
  styleUrl: './client-measurement-permission.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ClientMeasurementPermissionComponent {
  readonly context = input.required<ClientPortalContext>();
  readonly hideWhenAuthorized = input(false);
  readonly focusHeading = input(false);
  readonly returnFocusTo = input<HTMLElement>();

  private readonly service = inject(ClientMeasurementConsentService);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');
  private request = 0;

  protected readonly permission = signal<ClientMeasurementConsent | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly choice = new FormControl(false, { nonNullable: true });
  protected readonly consentText = CLIENT_MEASUREMENT_CONSENT_TEXT;

  constructor() {
    effect(() => {
      const context = this.context();
      this.permission.set(null);
      this.success.set('');
      this.saving.set(false);
      this.choice.reset(false);
      void this.load(context);
    });

    afterRenderEffect(() => {
      if (this.focusHeading()) this.heading()?.nativeElement.focus();
    });
  }

  refresh(): void {
    if (!this.saving()) void this.load(this.context());
  }

  private async load(context: ClientPortalContext): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    try {
      const permission = await this.service.get(context.clientId, context.membershipId);
      if (request === this.request) this.permission.set(permission);
    } catch {
      if (request === this.request) {
        this.permission.set(null);
        this.error.set('No pudimos consultar tu permiso. Intentá de nuevo.');
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  protected async save(action: 'authorize_online' | 'revoke'): Promise<void> {
    const current = this.permission();
    if (!current || this.saving() || this.loading()) return;
    if (action === 'authorize_online' && (!current.can_authorize_online || !this.choice.value)) return;
    if (action === 'revoke' && (!current.authorized || !current.can_revoke)) return;

    const context = this.context();
    const request = ++this.request;
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const permission = await this.service.set(context.clientId, context.membershipId, action);
      if (request !== this.request) return;

      const focusTarget = this.hideWhenAuthorized() && permission.authorized
        ? this.returnFocusTo()
        : this.heading()?.nativeElement;
      focusTarget?.focus({ preventScroll: true });
      this.permission.set(permission);
      this.choice.reset(false);
      this.success.set(permission.authorized ? 'Guardamos tu autorización.' : 'Retiramos tu autorización.');
    } catch {
      if (request === this.request) this.error.set('No pudimos guardar el cambio. Intentá de nuevo.');
    } finally {
      if (request === this.request) this.saving.set(false);
    }
  }
}
