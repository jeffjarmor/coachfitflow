import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { showPreferences } from 'vanilla-cookieconsent';
import { ZUMMITH_CONTACT } from '../core/config/contact';

@Component({
  selector: 'app-legal-links',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav aria-label="Enlaces legales y soporte">
      <a routerLink="/terminos">Términos del servicio</a>
      <a routerLink="/privacidad">Aviso de privacidad</a>
      <button type="button" aria-haspopup="dialog" (click)="showCookiePreferences()">Cookies</button>
      <a [href]="supportUrl" target="_blank" rel="noopener noreferrer">Soporte</a>
    </nav>
  `,
  styles: `
    nav {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: .25rem 1.5rem;
    }

    a, button {
      padding-block: .375rem;
      color: inherit;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: var(--zm-link-underline-offset);
    }

    button {
      padding-inline: 0;
      border: 0;
      background: transparent;
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
    }
  `
})
export class LegalLinksComponent {
  readonly supportUrl = ZUMMITH_CONTACT.instagramUrl;
  protected readonly showCookiePreferences = showPreferences;
}
