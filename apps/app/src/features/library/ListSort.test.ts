import { describe, expect, it } from 'vitest';
import { sortItems } from './ListSort';

const items = [
  { title: 'Бета 10', date: '2026-01-01T00:00:00Z', size: 2 },
  { title: 'Альфа', date: '2026-03-01T00:00:00Z', size: 7 },
  { title: 'Бета 2', date: '2026-02-01T00:00:00Z', size: 4 },
];
const value = (item: (typeof items)[number]) => item;

describe('сортировка списков', () => {
  it('сортирует по дате в обе стороны', () => {
    expect(sortItems(items, 'updated_desc', value).map((item) => item.title)).toEqual([
      'Альфа',
      'Бета 2',
      'Бета 10',
    ]);
    expect(sortItems(items, 'updated_asc', value).map((item) => item.title)).toEqual([
      'Бета 10',
      'Бета 2',
      'Альфа',
    ]);
  });

  it('учитывает русский алфавит, числа и размер', () => {
    expect(sortItems(items, 'title_asc', value).map((item) => item.title)).toEqual([
      'Альфа',
      'Бета 2',
      'Бета 10',
    ]);
    expect(sortItems(items, 'size_desc', value).map((item) => item.size)).toEqual([7, 4, 2]);
  });
});
