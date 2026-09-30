import { useEffect, useMemo, useState } from 'react';

export type SortMode =
  'custom' | 'updated_desc' | 'updated_asc' | 'title_asc' | 'title_desc' | 'size_desc' | 'size_asc';

export interface SortableItem {
  id: string;
  title: string;
  date: string;
  size?: number;
}

const labels: Record<SortMode, string> = {
  custom: 'Свой порядок',
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

export function useCustomOrder(storageKey: string) {
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(saved) && saved.every((value) => typeof value === 'string') ? saved : [];
    } catch {
      return [];
    }
  });
  useEffect(
    () => window.localStorage.setItem(storageKey, JSON.stringify(order)),
    [order, storageKey],
  );
  return [order, setOrder] as const;
}

export function sortItems<T>(
  items: readonly T[],
  mode: SortMode,
  value: (item: T) => SortableItem,
  customOrder: readonly string[] = [],
): T[] {
  const customPositions = new Map(customOrder.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const a = value(left);
    const b = value(right);
    if (mode === 'custom') {
      const aPosition = customPositions.get(a.id);
      const bPosition = customPositions.get(b.id);
      if (aPosition === undefined && bPosition === undefined) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (aPosition === undefined) return -1;
      if (bPosition === undefined) return 1;
      return aPosition - bPosition;
    }
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

export function moveCustomItem(
  fullOrder: readonly string[],
  visibleOrder: readonly string[],
  itemId: string,
  direction: -1 | 1,
): string[] {
  const visibleIndex = visibleOrder.indexOf(itemId);
  const siblingId = visibleOrder[visibleIndex + direction];
  if (visibleIndex < 0 || siblingId === undefined) return [...fullOrder];

  const result = [...fullOrder];
  const itemIndex = result.indexOf(itemId);
  const siblingIndex = result.indexOf(siblingId);
  if (itemIndex < 0 || siblingIndex < 0) return result;
  result[itemIndex] = siblingId;
  result[siblingIndex] = itemId;
  return result;
}

export function OrderControls({
  itemLabel,
  canMoveEarlier,
  canMoveLater,
  onMove,
}: {
  itemLabel: string;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <div className="border-border mb-4 flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-fg-muted text-sm">Место в списке</span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!canMoveEarlier}
          onClick={() => onMove(-1)}
          aria-label={`Поднять «${itemLabel}» выше`}
          className="border-border bg-surface hover:bg-surface-muted focus-visible:outline-primary min-h-11 rounded-md border px-3 text-sm focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Раньше
        </button>
        <button
          type="button"
          disabled={!canMoveLater}
          onClick={() => onMove(1)}
          aria-label={`Опустить «${itemLabel}» ниже`}
          className="border-border bg-surface hover:bg-surface-muted focus-visible:outline-primary min-h-11 rounded-md border px-3 text-sm focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Позже
        </button>
      </div>
    </div>
  );
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
