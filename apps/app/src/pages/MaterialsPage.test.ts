import { describe, expect, it } from 'vitest';
import { aggregateStats, learningStatus } from '../features/materials/materials-progress';

const stats = (overrides: Record<string, unknown> = {}) => ({
  set_id: crypto.randomUUID(),
  cards_total: 10,
  mastered_count: 6,
  learning_count: 2,
  not_started_count: 2,
  mastery_percent: 60,
  due_now: 0,
  last_studied_at: '2026-10-01T10:00:00Z',
  distribution: { new: 2, learning: 2, review: 6, relearning: 0 },
  problem_cards: [],
  forecast: [],
  ...overrides,
});

describe('индикатор освоения материалов', () => {
  it('агрегирует прогресс курса по числу карточек, а не среднему процентов', () => {
    const result = aggregateStats([
      stats({ cards_total: 10, mastered_count: 10, mastery_percent: 100 }),
      stats({ cards_total: 30, mastered_count: 0, mastery_percent: 0, due_now: 7 }),
    ]);

    expect(result.masteryPercent).toBe(25);
    expect(result.cardsTotal).toBe(40);
    expect(result.dueNow).toBe(7);
  });

  it('ставит срочное повторение выше низкого процента освоения', () => {
    expect(
      learningStatus({
        cardsTotal: 30,
        masteredCount: 25,
        masteryPercent: 83,
        dueNow: 4,
        lastStudiedAt: '2026-10-01T10:00:00Z',
      }),
    ).toEqual({ kind: 'urgent', label: '4 на повторение' });
  });

  it('отличает новый материал от проседающего', () => {
    expect(
      learningStatus({
        cardsTotal: 12,
        masteredCount: 0,
        masteryPercent: 0,
        dueNow: 0,
        lastStudiedAt: null,
      }).kind,
    ).toBe('new');
    expect(
      learningStatus({
        cardsTotal: 12,
        masteredCount: 4,
        masteryPercent: 33,
        dueNow: 0,
        lastStudiedAt: '2026-10-01T10:00:00Z',
      }).kind,
    ).toBe('weak');
  });
});
