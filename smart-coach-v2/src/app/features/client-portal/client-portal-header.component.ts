import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ClientPortalContext, ClientPortalDataService } from './client-portal-data.service';

@Component({
  selector: 'app-client-portal-header',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="portal-header">
      <div class="container portal-header-inner">
        <a class="portal-brand" routerLink="/client/portal" aria-label="Ir al inicio del portal">
          <img src="/brand/zummith-horizontal.svg" alt="Zummith" width="150" height="42">
        </a>
        <nav class="portal-nav" aria-label="Navegación del cliente">
          @for (item of navigation; track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.route === '/client/portal' }" ariaCurrentWhenActive="page">
              {{ item.label }}
            </a>
          }
        </nav>
        <div class="account-actions">
          <a class="account-link" routerLink="/client/profile" routerLinkActive="active" ariaCurrentWhenActive="page" [title]="displayName()">
            <strong>{{ displayName() }}</strong><small>Perfil</small>
          </a>
          <button class="logout-link" type="button" aria-label="Cerrar sesión" title="Cerrar sesión" (click)="logout()">
            <svg aria-hidden="true"><use href="/icons/tabler-fitness.svg#logout" /></svg>
          </button>
        </div>
      </div>
    </header>
    <nav class="mobile-bottom-nav" aria-label="Navegación del cliente">
      <div class="mobile-nav-items">
        @for (item of navigation; track item.route) {
          <a [routerLink]="item.route" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.route === '/client/portal' }" ariaCurrentWhenActive="page" [attr.aria-label]="item.label">
            <svg aria-hidden="true"><use [attr.href]="'/icons/tabler-fitness.svg#' + item.icon" /></svg>
            <span>{{ item.short }}</span>
          </a>
        }
      </div>
    </nav>
  `,
  styles: `
    :host { display: block; position: sticky; z-index: 20; top: 0; }
    .portal-header { box-shadow: var(--zm-shadow-nav); border-bottom: 1px solid var(--zm-line); background: var(--zm-surface); }
    .portal-header-inner { max-width: 1220px; min-height: 70px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: clamp(1rem, 2vw, 2rem); }
    .portal-brand { display: inline-flex; align-items: center; min-height: 44px; }
    .portal-brand img { width: 142px; height: auto; display: block; }
    .portal-nav { height: 70px; display: flex; align-items: stretch; gap: clamp(.85rem, 1.6vw, 1.5rem); }
    .portal-nav a { position: relative; min-height: 44px; display: inline-flex; align-items: center; gap: .5rem; color: var(--zm-muted); font-size: var(--zm-type-label-size); font-weight: 700; text-decoration: none; }
    .portal-nav a::after { content: ''; position: absolute; right: 0; bottom: -1px; left: 0; height: 2px; background: transparent; }
    .portal-nav a:hover, .portal-nav a.active { color: var(--zm-ink); }
    .portal-nav a.active::after { background: var(--zm-ink); }
    .mobile-bottom-nav { display: none; }
    .account-actions { min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 1rem; }
    .account-link { min-width: 0; min-height: 44px; display: flex; flex-direction: column; justify-content: center; color: var(--zm-ink); text-align: right; text-decoration: none; }
    .account-link strong { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--zm-type-meta-size); line-height: var(--zm-type-meta-line); font-weight: 700; }
    .account-link small { color: var(--zm-muted); font-size: var(--zm-type-caption-size); line-height: var(--zm-type-caption-line); }
    .account-link:hover, .account-link.active { text-decoration: underline; text-underline-offset: 3px; }
    .logout-link { width: 44px; height: 44px; padding: 0; border: 0; border-radius: var(--zm-radius-control); display: grid; place-items: center; flex: 0 0 auto; color: var(--zm-muted); background: transparent; }
    .logout-link:hover, .logout-link:focus-visible { color: var(--zm-ink); background: var(--zm-surface-hover); }
    svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
    .logout-link svg { stroke-width: 2.25; }
    @media (max-width: 920px) {
      .portal-header-inner { min-height: 62px; grid-template-columns: auto minmax(0, 1fr); column-gap: .75rem; row-gap: 0; }
      .portal-brand { min-height: 62px; }
      .portal-brand img { width: 128px; }
      .account-actions { grid-column: 2; grid-row: 1; gap: .25rem; }
      .account-link strong { max-width: 150px; }
      .portal-nav { display: none; }
      .mobile-bottom-nav { position: fixed; z-index: 20; inset: auto 0 0; height: var(--zm-mobile-nav-clearance); padding: .5rem max(.5rem, env(safe-area-inset-right, 0px)) calc(.5rem + env(safe-area-inset-bottom, 0px)) max(.5rem, env(safe-area-inset-left, 0px)); display: block; background: var(--zm-surface); box-shadow: 0 -6px 24px color-mix(in srgb, var(--zm-dark) 10%, transparent); }
      .mobile-nav-items { width: min(560px, 100%); height: 100%; margin-inline: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .125rem; }
      .mobile-nav-items a { min-width: 0; min-height: 44px; padding: .25rem 0; display: grid; grid-template-rows: 30px auto; align-content: center; place-items: center; gap: 0; color: var(--zm-muted); font-size: var(--zm-type-caption-size); line-height: var(--zm-type-caption-line); font-weight: 600; text-decoration: none; touch-action: manipulation; }
      .mobile-nav-items svg { width: 26px; height: 26px; stroke-width: 1.5; }
      .mobile-nav-items a:hover { color: var(--zm-ink); }
      .mobile-nav-items a.active { color: var(--zm-ink); font-weight: 700; }
      .mobile-nav-items a.active svg { stroke-width: 2.25; }
    }
    @media (max-width: 420px) {
      .portal-brand img { width: 112px; }
      .account-link strong { max-width: 110px; }
    }
  `
})
export class ClientPortalHeaderComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly portal = inject(ClientPortalDataService);
  private readonly fetchedName = signal('');

  readonly navigation = [
    { route: '/client/portal', label: 'Inicio', short: 'Inicio', icon: 'layout-dashboard' },
    { route: '/client/routines', label: 'Rutinas', short: 'Rutinas', icon: 'clipboard-check' },
    { route: '/client/measurements', label: 'Mediciones', short: 'Medidas', icon: 'ruler-measure' },
    { route: '/client/payments', label: 'Pagos', short: 'Pagos', icon: 'credit-card' },
  ];
  readonly context = input<ClientPortalContext | null>(null);
  readonly clientName = input<string | null | undefined>(null);
  readonly displayName = computed(() => this.clientName()?.trim() || this.fetchedName() || 'Mi cuenta');

  constructor() {
    effect((onCleanup) => {
      const context = this.context();
      const name = this.clientName();
      let cancelled = false;
      onCleanup(() => { cancelled = true; });
      this.fetchedName.set('');
      if (name?.trim() || !context?.available) return;
      void this.portal.getProfile(context).then(profile => {
        if (!cancelled) this.fetchedName.set(profile.name.trim());
      }).catch(() => {
        // Keep the profile link usable if the name cannot be loaded.
      });
    });
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
