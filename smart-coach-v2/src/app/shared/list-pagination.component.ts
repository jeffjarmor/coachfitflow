import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CustomSelectComponent } from './custom-select.component';
import { LIST_PAGE_SIZES } from './list-pagination';

let nextPaginationId = 0;

@Component({
  selector: 'app-list-pagination',
  standalone: true,
  imports: [CustomSelectComponent],
  templateUrl: './list-pagination.component.html',
  styleUrl: './list-pagination.component.scss',
  host: { '[hidden]': '!isVisible()' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListPaginationComponent {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly label = input('Paginación de registros');
  readonly targetId = input('');
  readonly disabled = input(false);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
  readonly pageSizes = LIST_PAGE_SIZES;
  readonly isVisible = computed(() => this.total() > this.pageSizes[0]);
  readonly selectId = `list-page-size-${++nextPaginationId}`;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  readonly range = computed(() => this.total()
    ? `${(this.page() - 1) * this.pageSize() + 1}–${Math.min(this.page() * this.pageSize(), this.total())}` : '0');

  changePage(value: number): void {
    if (this.disabled() || !Number.isInteger(value) || value < 1 || value > this.totalPages() || value === this.page()) return;
    this.pageChange.emit(value);
    if (this.targetId()) requestAnimationFrame(() => {
      const target = document.getElementById(this.targetId());
      target?.scrollIntoView({ block: 'start', behavior: 'instant' });
      target?.focus({ preventScroll: true });
    });
  }

  changePageSize(value: number): void {
    if (!this.disabled() && this.pageSizes.some(size => size === value)) this.pageSizeChange.emit(value);
  }
}
