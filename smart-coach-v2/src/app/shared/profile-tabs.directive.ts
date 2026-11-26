import { afterRenderEffect, Directive, ElementRef, inject, input } from '@angular/core';

@Directive({
  selector: 'nav[profileTabs]',
  host: { '(window:resize)': 'revealActive()' }
})
export class ProfileTabsDirective {
  readonly profileTabs = input.required<string>();
  private readonly navigation: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    afterRenderEffect(() => {
      this.profileTabs();
      this.revealActive();
    });
  }

  protected revealActive(): void {
    const active = this.navigation.querySelector<HTMLElement>('a[aria-current="location"]');
    if (!active) return;

    const start = active.offsetLeft;
    const end = start + active.offsetWidth;
    const { clientWidth, scrollLeft } = this.navigation;
    this.navigation.scrollLeft = Math.max(end - clientWidth, Math.min(start, scrollLeft));
  }
}
