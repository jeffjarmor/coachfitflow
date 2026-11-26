import { ViewportScroller } from '@angular/common';
import { afterNextRender, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { LegalLinksComponent } from '../../shared/legal-links.component';
import { privacyNotice, termsOfService } from './legal-documents';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LegalLinksComponent],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss'
})
export class LegalPageComponent {
  private readonly route = inject(ActivatedRoute);
  protected readonly document = this.route.snapshot.data['legalDocument'] === 'privacy' ? privacyNotice : termsOfService;

  constructor() {
    const scroller = inject(ViewportScroller);
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      this.route.fragment.pipe(takeUntilDestroyed(destroyRef)).subscribe(fragment => {
        if (fragment === 'cookies') {
          scroller.scrollToAnchor(fragment, { behavior: 'instant' });
        } else {
          scroller.scrollToPosition([0, 0], { behavior: 'instant' });
        }
      });
    });
  }
}
