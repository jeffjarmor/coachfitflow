import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CustomSelectComponent } from './custom-select.component';

describe('Custom select scrolling', () => {
  let fixture: ComponentFixture<CustomSelectComponent>;
  let component: CustomSelectComponent;
  let trigger: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CustomSelectComponent] }).compileComponents();
    fixture = TestBed.createComponent(CustomSelectComponent);
    component = fixture.componentInstance;
    component.options = Array.from({ length: 30 }, (_, index) => ({ value: String(index), label: `Ejercicio ${index + 1}` }));
    await settle();
    trigger = fixture.nativeElement.querySelector('button');
  });

  afterEach(() => fixture.destroy());

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    fixture.detectChanges();
  }

  it('keeps the options available after a queued scroll that did not move the control', async () => {
    trigger.click(); await settle();
    document.dispatchEvent(new Event('scroll'));
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const option = fixture.nativeElement.querySelectorAll('[role="option"]')[1] as HTMLElement;
    option.click(); await settle();
    expect(component.value).toBe('1');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the menu when scrolling moves its anchor', async () => {
    trigger.click(); await settle();
    const rect = trigger.getBoundingClientRect();
    spyOn(trigger, 'getBoundingClientRect').and.returnValue(DOMRect.fromRect({ x: rect.x, y: rect.y - 50, width: rect.width, height: rect.height }));
    document.dispatchEvent(new Event('scroll'));
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals keyboard choices inside the list without scrolling the page', async () => {
    trigger.click(); await settle();
    const scrollTop = window.scrollY;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    const listbox = fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
    expect(listbox.scrollTop).toBeGreaterThan(0);
    expect(window.scrollY).toBe(scrollTop);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(component.value).toBe('29');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
