import { describe, expect, it } from 'vitest';
import { closestDropEdge, moveCustomItem, moveCustomItemTo, sortItems } from './ListSort';

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

  it('переносит карточку до или после цели drag-and-drop', () => {
    expect(moveCustomItemTo(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a']);
    expect(moveCustomItemTo(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b']);
  });

  it('выбирает ближайшую грань карточки в двумерной сетке', () => {
    const bounds = { top: 100, right: 300, bottom: 300, left: 100 };
    expect(closestDropEdge(bounds, 105, 200)).toBe('left');
    expect(closestDropEdge(bounds, 295, 200)).toBe('right');
    expect(closestDropEdge(bounds, 200, 105)).toBe('top');
    expect(closestDropEdge(bounds, 200, 295)).toBe('bottom');
  });
});
