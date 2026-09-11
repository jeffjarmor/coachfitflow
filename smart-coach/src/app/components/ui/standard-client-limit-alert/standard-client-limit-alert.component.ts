import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Coach,
  STANDARD_PLAN_CLIENT_LIMIT,
  hasExceededStandardClientLimit
} from '../../../models/coach.model';
import { ProUpsellService } from '../../../services/pro-upsell.service';

@Component({
  selector: 'app-standard-client-limit-alert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './standard-client-limit-alert.component.html',
  styleUrl: './standard-client-limit-alert.component.scss'
})
export class StandardClientLimitAlertComponent {
  private proUpsellService = inject(ProUpsellService);

  coach = input<Coach | null>(null);
  clientCount = input(0);

  readonly clientLimit = STANDARD_PLAN_CLIENT_LIMIT;
  readonly shouldShow = computed(() =>
    hasExceededStandardClientLimit(this.coach(), this.clientCount())
  );
  readonly excessClientCount = computed(() =>
    Math.max(0, this.clientCount() - this.clientLimit)
  );

  contactForPro(): void {
    this.proUpsellService.open('pro', { showInstagram: true });
  }
}
