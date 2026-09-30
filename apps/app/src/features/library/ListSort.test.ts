import { describe, expect, it } from 'vitest';
import { moveCustomItem, sortItems } from './ListSort';

const items = [
  { title: 'Бета 10', date: '2026-01-01T00:00:00Z', size: 2 },
  { title: 'Альфа', date: '2026-03-01T00:00:00Z', size: 7 },
  { title: 'Бета 2', date: '2026-02-01T00:00:00Z', size: 4 },
];
const value = (item: (typeof items)[number]) => ({ ...item, id: item.title });

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

  it('ставит новые элементы перед сохранённым ручным порядком', () => {
    expect(
      sortItems(items, 'custom', value, ['Бета 10', 'Альфа']).map((item) => item.title),
    ).toEqual(['Бета 2', 'Бета 10', 'Альфа']);
  });

  it('меняет местами соседей в отфильтрованном списке, не теряя скрытые элементы', () => {
    expect(moveCustomItem(['a', 'hidden', 'b'], ['a', 'b'], 'b', -1)).toEqual(['b', 'hidden', 'a']);
  });
});
