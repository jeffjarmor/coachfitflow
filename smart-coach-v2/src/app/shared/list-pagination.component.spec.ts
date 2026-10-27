import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListPaginationComponent } from './list-pagination.component';

describe('Shared pagination controls', () => {
  let fixture: ComponentFixture<ListPaginationComponent>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ListPaginationComponent] }).compileComponents();
    fixture = TestBed.createComponent(ListPaginationComponent);
    fixture.componentRef.setInput('total', 12);
    fixture.componentRef.setInput('page', 1);
    fixture.componentRef.setInput('pageSize', 5);
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());
  function button(text: string): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent!.trim() === text)!;
  }

  it('disables boundaries and emits a page change through the native button', () => {
    const change = jasmine.createSpy('pageChange');
    fixture.componentInstance.pageChange.subscribe(change);
    expect(button('Anterior').disabled).toBeTrue();
    button('Siguiente').click();
    expect(change).toHaveBeenCalledOnceWith(2);
    fixture.componentRef.setInput('page', 3); fixture.detectChanges();
    expect(button('Siguiente').disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('11–12');
  });

  it('hides the whole component until there are more items than the minimum page size', () => {
    for (const total of [0, 1, 4, 5]) {
      fixture.componentRef.setInput('total', total); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('nav')).toBeNull();
      expect(fixture.nativeElement.hidden).toBeTrue();
    }
    fixture.componentRef.setInput('total', 6); fixture.detectChanges();
    expect(fixture.nativeElement.hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('nav')).not.toBeNull();
  });

  it('keeps the selector available when a larger selected page size fits all records', () => {
    fixture.componentRef.setInput('total', 6);
    fixture.componentRef.setInput('pageSize', 20); fixture.detectChanges();
    expect(fixture.nativeElement.hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role="combobox"]')).not.toBeNull();
    expect(button('Anterior').disabled).toBeTrue();
    expect(button('Siguiente').disabled).toBeTrue();
  });

  it('changes quantity through the keyboard-operated selector and blocks changes while disabled', () => {
    const change = jasmine.createSpy('pageSizeChange');
    fixture.componentInstance.pageSizeChange.subscribe(change);
    const select = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLElement;
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fixture.detectChanges();
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); fixture.detectChanges();
    expect(change).toHaveBeenCalledOnceWith(10);
    fixture.componentRef.setInput('disabled', true); fixture.detectChanges();
    expect(button('Siguiente').disabled).toBeTrue();
    fixture.componentInstance.changePageSize(20);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('associates a unique visible label with each selector and announces the range', () => {
    const select = fixture.nativeElement.querySelector('[role="combobox"]') as HTMLElement;
    expect(fixture.nativeElement.querySelector(`label[for="${select.id}"]`)).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="status"]').getAttribute('aria-live')).toBe('polite');
    const other = TestBed.createComponent(ListPaginationComponent);
    expect(other.componentInstance.selectId).not.toBe(fixture.componentInstance.selectId);
    other.destroy();
  });
});
