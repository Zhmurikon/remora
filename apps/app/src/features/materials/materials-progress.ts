import type { components } from '@remora/api-client';

type SetStats = components['schemas']['SetStats'];

export type MaterialProgress = {
  cardsTotal: number;
  masteredCount: number;
  masteryPercent: number;
  dueNow: number;
  lastStudiedAt: string | null;
  loading?: boolean;
};

export function aggregateStats(stats: Array<SetStats | undefined>): MaterialProgress {
  const available = stats.filter((item): item is SetStats => Boolean(item));
  if (available.length === 0) {
    return {
      cardsTotal: 0,
      masteredCount: 0,
      masteryPercent: 0,
      dueNow: 0,
      lastStudiedAt: null,
      loading: stats.length > 0,
    };
  }
  const cardsTotal = available.reduce((sum, item) => sum + item.cards_total, 0);
  const masteredCount = available.reduce((sum, item) => sum + item.mastered_count, 0);
  const dueNow = available.reduce((sum, item) => sum + item.due_now, 0);
  const latest =
    available
      .map((item) => item.last_studied_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  return {
    cardsTotal,
    masteredCount,
    masteryPercent: cardsTotal ? (masteredCount / cardsTotal) * 100 : 0,
    dueNow,
    lastStudiedAt: latest,
    loading: available.length < stats.length,
  };
}

export function learningStatus(progress: MaterialProgress): {
  kind: 'urgent' | 'weak' | 'good' | 'new';
  label: string;
} {
  if (progress.loading) return { kind: 'new', label: 'Считаем прогресс' };
  if (progress.dueNow > 0) return { kind: 'urgent', label: `${progress.dueNow} на повторение` };
  if (progress.cardsTotal === 0 || !progress.lastStudiedAt) {
    return { kind: 'new', label: 'Не начат' };
  }
  if (progress.masteryPercent < 60) return { kind: 'weak', label: 'Требует внимания' };
  return { kind: 'good', label: 'Идёт хорошо' };
}
