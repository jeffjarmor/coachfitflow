import { Component, computed, ElementRef, EventEmitter, forwardRef, HostListener, inject, Input, OnDestroy, Output, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export type SelectOption = unknown;

let nextSelectId = 0;

@Component({
  selector: 'app-custom-select',
  standalone: true,
  templateUrl: './custom-select.component.html',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CustomSelectComponent), multi: true }]
})
export class CustomSelectComponent implements ControlValueAccessor, OnDestroy {
  private readonly optionSource = signal<readonly SelectOption[]>([]);
  private readonly placeholderSource = signal('');
  private readonly valueKeySource = signal('value');
  private readonly labelKeySource = signal('label');
  @Input() set options(value: readonly SelectOption[]) { this.optionSource.set(value || []); }
  get options(): readonly SelectOption[] { return this.optionSource(); }
  @Input() set optionValueKey(value: string) { this.valueKeySource.set(value || 'value'); }
  get optionValueKey(): string { return this.valueKeySource(); }
  @Input() set optionLabelKey(value: string) { this.labelKeySource.set(value || 'label'); }
  get optionLabelKey(): string { return this.labelKeySource(); }
  @Input() set placeholder(value: string) { this.placeholderSource.set(value || ''); }
  get placeholder(): string { return this.placeholderSource(); }
  @Input() controlId = '';
  @Input() ariaLabel = 'Seleccionar opción';
  @Input() describedBy = '';
  @Input() invalid = false;
  @Input() compact = false;
  @Output() valueChange = new EventEmitter<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private anchorPosition: { top: number; left: number } | null = null;
  readonly uid = `custom-select-${++nextSelectId}`;
  readonly opened = signal(false);
  readonly opensUp = signal(false);
  readonly menuTop = signal<number | null>(null);
  readonly menuBottom = signal<number | null>(null);
  readonly menuLeft = signal(0);
  readonly menuWidth = signal(0);
  readonly highlighted = signal(0);
  readonly currentValue = signal('');
  readonly isDisabled = signal(false);
  readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  readonly listbox = viewChild<ElementRef<HTMLDivElement>>('listbox');
  readonly normalizedOptions = computed(() => {
    const valueKey = this.valueKeySource();
    const labelKey = this.labelKeySource();
    const entries = this.optionSource().map((option) => {
      if (typeof option === 'string' || typeof option === 'number') {
        return { value: String(option), label: String(option), disabled: false };
      }
      const fields = option as Record<string, unknown>;
      return { value: String(fields[valueKey] ?? ''), label: String(fields[labelKey] ?? ''), disabled: !!fields['disabled'] };
    });
    return this.placeholderSource() ? [{ value: '', label: this.placeholderSource(), disabled: false }, ...entries] : entries;
  });

  @Input()
  get value(): string { return this.currentValue(); }
  set value(value: string | number | null | undefined) { this.currentValue.set(value == null ? '' : String(value)); }

  @Input()
  get disabled(): boolean { return this.isDisabled(); }
  set disabled(value: boolean) { this.isDisabled.set(value); }

  get displayedLabel(): string {
    const options = this.normalizedOptions();
    return options.find((option) => option.value === this.value)?.label || options[0]?.label || this.placeholder || 'Seleccionar';
  }

  writeValue(value: string | number | null): void { this.value = value; }
  registerOnChange(fn: (value: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; }

  toggle(event?: MouseEvent): void {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.disabled) return;
    if (this.opened()) this.close();
    else this.open();
  }

  onTriggerBlur(): void { this.onTouched(); }

  choose(index: number): void {
    const option = this.normalizedOptions()[index];
    if (!option || option.disabled) return;
    const changed = this.value !== option.value;
    this.value = option.value;
    this.close();
    this.trigger()?.nativeElement.focus();
    if (changed) {
      this.onChange(option.value);
      this.valueChange.emit(option.value);
    }
  }

  onOptionPointerDown(event: PointerEvent, index: number): void {
    if (event.pointerType !== 'mouse') return;
    event.preventDefault();
    event.stopPropagation();
    // Commit on click, while the option still exists under the pointer.
  }

  onOptionClick(event: MouseEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.opened()) this.choose(index);
  }

  onKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'Tab') { this.close(); return; }
    if (key === 'Escape') { if (this.opened()) event.preventDefault(); this.close(); return; }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (this.opened()) this.choose(this.highlighted());
      else this.open();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    if (!this.opened()) { this.open(); return; }
    const length = this.normalizedOptions().length;
    if (!length) return;
    const next = key === 'Home' ? 0 : key === 'End' ? length - 1
      : Math.min(length - 1, Math.max(0, this.highlighted() + (key === 'ArrowDown' ? 1 : -1)));
    this.setHighlighted(next);
  }

  setHighlighted(index: number, scrollIntoView = true): void {
    this.highlighted.set(index);
    if (scrollIntoView) requestAnimationFrame(() => {
      const listbox = this.listbox()?.nativeElement;
      const option = listbox?.querySelector<HTMLElement>(`#${this.uid}-option-${index}`);
      if (!listbox || !option) return;
      const top = option.offsetTop;
      const bottom = top + option.offsetHeight;
      if (top < listbox.scrollTop) listbox.scrollTop = top;
      else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight;
    });
  }

  @HostListener('document:pointerdown', ['$event'])
  onOutsidePointerDown(event: PointerEvent): void {
    if (this.opened() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('window:resize')
  onWindowResize(): void { this.close(); }

  ngOnDestroy(): void { document.removeEventListener('scroll', this.onDocumentScroll, true); }

  private open(): void {
    const rect = this.trigger()?.nativeElement.getBoundingClientRect();
    if (!rect) return;
    this.anchorPosition = { top: rect.top, left: rect.left };
    const menuHeight = Math.min(this.normalizedOptions().length * 44 + 12, 240, window.innerHeight * .48);
    const spaceBelow = window.innerHeight - rect.bottom;
    const up = spaceBelow < menuHeight + 12 && rect.top > spaceBelow;
    this.opensUp.set(up);
    this.menuTop.set(up ? null : rect.bottom + 6);
    this.menuBottom.set(up ? window.innerHeight - rect.top + 6 : null);
    this.menuLeft.set(Math.max(8, rect.left));
    this.menuWidth.set(Math.min(rect.width, window.innerWidth - Math.max(8, rect.left) - 8));
    this.opened.set(true);
    document.addEventListener('scroll', this.onDocumentScroll, true);
    const selected = this.normalizedOptions().findIndex((option) => option.value === this.value);
    this.setHighlighted(Math.max(0, selected));
  }

  private close(): void {
    if (!this.opened()) return;
    this.opened.set(false);
    this.anchorPosition = null;
    document.removeEventListener('scroll', this.onDocumentScroll, true);
    this.onTouched();
  }

  private readonly onDocumentScroll = (event: Event): void => {
    if (event.target === this.listbox()?.nativeElement) return;
    const rect = this.trigger()?.nativeElement.getBoundingClientRect();
    const anchor = this.anchorPosition;
    if (rect && anchor && Math.abs(rect.top - anchor.top) < .5 && Math.abs(rect.left - anchor.left) < .5) return;
    this.close();
  };

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
}
