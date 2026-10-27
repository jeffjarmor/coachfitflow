import { computed, linkedSignal, signal } from '@angular/core';

export const LIST_PAGE_SIZES = [5, 10, 20] as const;

/** Paginate the complete filtered list without changing its data, order or totals. */
export function createListPagination<T>(items: () => readonly T[], filterKey: () => unknown = () => '') {
  const pageSize = signal<number>(5);
  const total = computed(() => items().length);
  const totalPages = computed(() => Math.max(1, Math.ceil(total() / pageSize())));
  const page = linkedSignal<{ key: unknown; pages: number }, number>({
    source: () => ({ key: filterKey(), pages: totalPages() }),
    computation: (current, previous) => previous && Object.is(current.key, previous.source.key)
      ? Math.max(1, Math.min(previous.value, current.pages)) : 1
  });
  const visibleItems = computed(() => {
    const start = (page() - 1) * pageSize();
    return items().slice(start, start + pageSize());
  });
  const range = computed(() => total()
    ? `${(page() - 1) * pageSize() + 1}–${Math.min(page() * pageSize(), total())}` : '0');
  return {
    pageSize, total, totalPages, page, visibleItems, range,
    goToPage(value: number): void {
      if (Number.isInteger(value)) page.set(Math.max(1, Math.min(value, totalPages())));
    },
    changePageSize(value: number): void {
      if (!LIST_PAGE_SIZES.some(size => size === value) || value === pageSize()) return;
      pageSize.set(value);
      page.set(1);
    },
    reset(): void { page.set(1); }
  };
}
