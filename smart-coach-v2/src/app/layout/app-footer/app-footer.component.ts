import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DeveloperCreditComponent } from '../../shared/developer-credit/developer-credit.component';
import { ZUMMITH_CONTACT } from '../../core/config/contact';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink, DeveloperCreditComponent],
  templateUrl: './app-footer.component.html',
  styleUrl: './app-footer.component.scss',
  host: { '[class.client-footer]': "audience() === 'client'" }
})
export class AppFooterComponent {
  readonly contact = ZUMMITH_CONTACT;
  readonly audience = input<'coach' | 'client'>('coach');
  readonly gymId = input<string | null>(null);
  readonly workspacePath = computed(() => this.gymId() ? `/gym/${this.gymId()}` : '');
  readonly currentYear = new Date().getFullYear();
}
