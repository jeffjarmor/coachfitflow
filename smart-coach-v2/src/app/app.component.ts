import { afterNextRender, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { startCookieConsent } from './core/config/cookie-consent';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  constructor() {
    afterNextRender(() => {
      void startCookieConsent().catch(error => console.error('No se pudieron iniciar las preferencias de cookies.', error));
    });
  }
}
