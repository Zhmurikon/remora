import { useEffect, useMemo, useState } from 'react';

export type SortMode =
  'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc' | 'size_desc' | 'size_asc';

export interface SortableItem {
  title: string;
  date: string;
  size?: number;
}

const labels: Record<SortMode, string> = {
  updated_desc: 'Сначала новые',
  updated_asc: 'Сначала старые',
  title_asc: 'По названию: А—Я',
  title_desc: 'По названию: Я—А',
  size_desc: 'Сначала большие',
  size_asc: 'Сначала маленькие',
};

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

export function useListSort(storageKey: string, initial: SortMode = 'updated_desc') {
  const [mode, setMode] = useState<SortMode>(() => {
    const saved = window.localStorage.getItem(storageKey);
    return saved && saved in labels ? (saved as SortMode) : initial;
  });
  useEffect(() => window.localStorage.setItem(storageKey, mode), [mode, storageKey]);
  return [mode, setMode] as const;
}

export function sortItems<T>(
  items: readonly T[],
  mode: SortMode,
  value: (item: T) => SortableItem,
): T[] {
  return [...items].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (mode === 'title_asc') return collator.compare(a.title, b.title);
    if (mode === 'title_desc') return collator.compare(b.title, a.title);
    if (mode === 'size_desc')
      return (b.size ?? 0) - (a.size ?? 0) || collator.compare(a.title, b.title);
    if (mode === 'size_asc')
      return (a.size ?? 0) - (b.size ?? 0) || collator.compare(a.title, b.title);
    const difference = new Date(a.date).getTime() - new Date(b.date).getTime();
    return mode === 'updated_asc' ? difference : -difference;
  });
}

export function ListSort({
  value,
  onChange,
  label = 'Сортировка',
  includeSize = true,
}: {
  value: SortMode;
  onChange: (mode: SortMode) => void;
  label?: string;
  includeSize?: boolean;
}) {
  const id = useMemo(
    () => `sort-${label.toLocaleLowerCase('ru').replaceAll(/[^а-яa-z0-9]+/g, '-')}`,
    [label],
  );
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-fg-muted text-sm">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as SortMode)}
        className="border-border bg-surface text-fg focus-visible:outline-primary min-h-11 rounded-md border px-3 text-sm focus-visible:outline focus-visible:outline-2"
      >
        {(Object.entries(labels) as Array<[SortMode, string]>)
          .filter(([mode]) => (includeSize ? true : !mode.startsWith('size_')))
          .map(([mode, text]) => (
            <option key={mode} value={mode}>
              {text}
            </option>
          ))}
      </select>
    </div>
  );
}
