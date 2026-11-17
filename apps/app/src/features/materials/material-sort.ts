import { useState } from 'react';
import { sortItems } from '../library/ListSort';
import type { MaterialProgress } from './materials-progress';

export const materialSortLabels = {
  recent: 'Недавно изученные',
  custom: 'Своя сортировка',
  updated_desc: 'Сначала новые',
  updated_asc: 'Сначала старые',
};
type MaterialSort = keyof typeof materialSortLabels;

export function useMaterialSort(tab: 'courses' | 'sets') {
  const key = 'remora:materials:sort:' + tab;
  const [mode, setMode] = useState<MaterialSort>(() => {
    const saved = localStorage.getItem(key);
    return saved && Object.hasOwn(materialSortLabels, saved) ? (saved as MaterialSort) : 'recent';
  });
  function select(value: string) {
    if (Object.hasOwn(materialSortLabels, value)) {
      localStorage.setItem(key, value);
      setMode(value as MaterialSort);
    }
  }
  return [mode, select] as const;
}

export function sortMaterials<
  T extends { id: string; title: string; orderDate: string; addedAt: string },
>(
  items: T[],
  mode: MaterialSort,
  order: string[],
  progress: ReadonlyMap<string, Pick<MaterialProgress, 'lastStudiedAt'>>,
) {
  const sorted = sortItems(
    items,
    mode === 'recent' ? 'updated_desc' : mode,
    (item) => ({
      id: item.id,
      title: item.title,
      date: mode === 'custom' ? item.orderDate : item.addedAt,
    }),
    order,
  );
  if (mode !== 'recent') return sorted;
  function lastStudy(id: string) {
    const date = progress.get(id)?.lastStudiedAt;
    return date ? Date.parse(date) : -Infinity;
  }
  // При равной дате занятия сохраняем порядок добавления в библиотеку.
  return sorted.sort((a, b) => {
    const left = lastStudy(a.id);
    const right = lastStudy(b.id);
    return left === right ? 0 : right - left;
  });
}
