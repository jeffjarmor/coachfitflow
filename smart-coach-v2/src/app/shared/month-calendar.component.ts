import { Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-month-calendar',
  standalone: true,
  template: `
    <button class="calendar-trigger" type="button" aria-haspopup="dialog"
      [attr.aria-label]="labels().open" (click)="open(calendar)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true">
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M8 4v4m8-4v4M4 11h16" />
      </svg>
    </button>
    <dialog #calendar [attr.aria-label]="labels().title" (click)="$event.target === calendar && calendar.close()">
      <div class="calendar-content">
        <header>
          <button type="button" [attr.aria-label]="labels().previous" [disabled]="year() <= 1" (click)="year.set(year() - 1)">‹</button>
          <strong aria-live="polite">{{ year() }}</strong>
          <button type="button" [attr.aria-label]="labels().next" [disabled]="year() >= 9999" (click)="year.set(year() + 1)">›</button>
          <button type="button" [attr.aria-label]="labels().close" (click)="calendar.close()">×</button>
        </header>
        <div class="calendar-months">
          @for (month of months(); track month.value) {
            <button type="button" [attr.aria-label]="month.name" [attr.aria-pressed]="monthValue(month.value) === selected()"
              (click)="select(month.value, calendar)">{{ month.shortName }}</button>
          }
        </div>
      </div>
    </dialog>
  `,
  styles: `
    :host { position: absolute; inset-block: 0; inset-inline-end: 0; display: grid; place-items: center; }
    button { min-width: 44px; min-height: 44px; border: 0; border-radius: var(--zm-radius-control); color: var(--zm-ink); background: transparent; font: inherit; }
    button:hover:not(:disabled) { background: var(--zm-surface-soft); }
    button:focus-visible { outline: 2px solid var(--zm-accent-emphasis); outline-offset: -2px; }
    button:disabled { opacity: .45; }
    .calendar-trigger { display: grid; place-items: center; }
    .calendar-trigger svg { width: 20px; height: 20px; }
    dialog { position: fixed; inset: auto; margin: 0; width: min(288px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; border: 1px solid var(--zm-line-strong); border-radius: var(--zm-radius-control); background: var(--zm-surface); color: var(--zm-ink); box-shadow: 0 8px 24px rgb(0 0 0 / 16%); font: inherit; }
    dialog::backdrop { background: transparent; }
    .calendar-content { padding: 8px; }
    header { display: grid; grid-template-columns: 44px 1fr 44px 44px; align-items: center; text-align: center; }
    header button { font-size: var(--zm-type-body-lg-size); }
    .calendar-months { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; }
    .calendar-months button { font-size: var(--zm-type-label-size); text-transform: capitalize; }
    .calendar-months button[aria-pressed="true"] { background: var(--zm-surface-lime); color: var(--zm-accent-emphasis); font-weight: 750; }
  `
})
export class MonthCalendarComponent {
  readonly field = input.required<HTMLInputElement>();
  readonly locale = input('es-CR');
  readonly selected = signal('');
  readonly year = signal(new Date().getFullYear());
  readonly labels = computed(() => this.locale().startsWith('en')
    ? { open: 'Open calendar', title: 'Select month', previous: 'Previous year', next: 'Next year', close: 'Close calendar' }
    : { open: 'Abrir calendario', title: 'Seleccionar mes', previous: 'Año anterior', next: 'Año siguiente', close: 'Cerrar calendario' });
  readonly months = computed(() => {
    const full = new Intl.DateTimeFormat(this.locale(), { month: 'long', timeZone: 'UTC' });
    const short = new Intl.DateTimeFormat(this.locale(), { month: 'short', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(2000, index, 1));
      return { value: index + 1, name: full.format(date), shortName: short.format(date) };
    });
  });

  open(dialog: HTMLDialogElement): void {
    const field = this.field();
    if (field.disabled || field.readOnly) return;
    const selected = /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(field.value) ? field.value : '';
    this.selected.set(selected);
    this.year.set(Number(selected.slice(0, 4)) || new Date().getFullYear());
    const anchor = field.getBoundingClientRect();
    dialog.showModal();
    const { width, height } = dialog.getBoundingClientRect();
    const top = anchor.bottom + height + 16 <= window.innerHeight ? anchor.bottom + 4 : anchor.top - height - 4;
    dialog.style.top = `${Math.max(12, top)}px`;
    dialog.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12))}px`;
  }

  monthValue(month: number): string {
    return `${String(this.year()).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  }

  select(month: number, dialog: HTMLDialogElement): void {
    const field = this.field();
    field.value = this.monthValue(month);
    dialog.close();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
