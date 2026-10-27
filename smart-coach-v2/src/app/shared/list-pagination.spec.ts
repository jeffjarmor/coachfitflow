import { computed, signal } from '@angular/core';
import { createListPagination } from './list-pagination';

describe('Shared list pagination', () => {
  it('visits all records in order including a partial last page without changing the source', () => {
    const source = signal(Array.from({ length: 23 }, (_, index) => index));
    const pagination = createListPagination(source);
    const seen: number[] = [];
    expect(pagination.pageSize()).toBe(5);
    for (let page = 1; page <= pagination.totalPages(); page++) {
      pagination.goToPage(page);
      seen.push(...pagination.visibleItems());
    }
    expect(seen).toEqual(source());
    expect(pagination.range()).toBe('21–23');
    expect(source().length).toBe(23);
  });

  it('searches the complete collection and resets when filters or context change', () => {
    const source = signal(Array.from({ length: 23 }, (_, index) => `Registro ${index}`));
    const query = signal('');
    const context = signal('coach');
    const filtered = computed(() => source().filter(item => item.includes(query())));
    const pagination = createListPagination(filtered, () => JSON.stringify([query(), context()]));
    pagination.goToPage(4);
    expect(pagination.page()).toBe(4);
    query.set('Registro 22');
    expect(pagination.page()).toBe(1);
    expect(pagination.visibleItems()).toEqual(['Registro 22']);
    query.set('');
    pagination.goToPage(3);
    context.set('gym');
    expect(pagination.page()).toBe(1);
  });

  it('supports the three page sizes and rejects unsupported sizes and invalid pages', () => {
    const pagination = createListPagination(() => Array.from({ length: 23 }, (_, index) => index));
    for (const size of [10, 20, 5]) {
      pagination.goToPage(2);
      pagination.changePageSize(size);
      expect(pagination.page()).toBe(1);
      expect(pagination.visibleItems().length).toBe(size);
    }
    for (const size of [0, 1, 4, 6, Number.NaN]) pagination.changePageSize(size);
    expect(pagination.pageSize()).toBe(5);
    pagination.goToPage(99);
    expect(pagination.page()).toBe(5);
    pagination.goToPage(Number.NaN); pagination.goToPage(1.5);
    expect(pagination.page()).toBe(5);
    pagination.goToPage(-1);
    expect(pagination.page()).toBe(1);
  });

  it('keeps the current page on refresh and clamps it after deleting the last page', () => {
    const source = signal(Array.from({ length: 11 }, (_, index) => index));
    const pagination = createListPagination(source);
    pagination.goToPage(3);
    source.set([...source()]);
    expect(pagination.page()).toBe(3);
    source.set(source().slice(0, 10));
    expect(pagination.page()).toBe(2);
    expect(pagination.range()).toBe('6–10');
    source.set([]);
    expect(pagination.page()).toBe(1);
    expect(pagination.totalPages()).toBe(1);
    expect(pagination.visibleItems()).toEqual([]);
    expect(pagination.range()).toBe('0');
  });

  it('keeps independent lists and complete totals intact while paginating', () => {
    const source = signal(Array.from({ length: 12 }, (_, index) => index + 1));
    const first = createListPagination(source);
    const second = createListPagination(source);
    first.goToPage(2);
    first.changePageSize(10);
    expect(second.page()).toBe(1);
    expect(second.pageSize()).toBe(5);
    expect(first.total()).toBe(12);
    expect(source().reduce((sum, value) => sum + value, 0)).toBe(78);
  });
});
