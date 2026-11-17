import { describe, expect, it } from 'vitest';
import { sortMaterials } from '../features/materials/material-sort';
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
      stats({ cards_total: 10, mastered_count: 10, learning_count: 0, mastery_percent: 100 }),
      stats({
        cards_total: 30,
        mastered_count: 0,
        learning_count: 5,
        mastery_percent: 0,
        due_now: 7,
      }),
    ]);

    expect(result.masteryPercent).toBe(25);
    expect(result.studiedPercent).toBe(37.5);
    expect(result.cardsTotal).toBe(40);
    expect(result.dueNow).toBe(7);
  });

  it('ставит срочное повторение выше низкого процента освоения', () => {
    expect(
      learningStatus({
        cardsTotal: 30,
        masteredCount: 25,
        learningCount: 3,
        studiedCount: 28,
        studiedPercent: 93,
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
        learningCount: 0,
        studiedCount: 0,
        studiedPercent: 0,
        masteryPercent: 0,
        dueNow: 0,
        lastStudiedAt: null,
      }).kind,
    ).toBe('new');
    expect(
      learningStatus({
        cardsTotal: 12,
        masteredCount: 4,
        learningCount: 2,
        studiedCount: 6,
        studiedPercent: 50,
        masteryPercent: 33,
        dueNow: 0,
        lastStudiedAt: '2026-10-01T10:00:00Z',
      }).kind,
    ).toBe('weak');
  });

  it('показывает первый проход как прогресс, не выдавая его за закрепление', () => {
    const result = aggregateStats([
      stats({ mastered_count: 0, learning_count: 10, not_started_count: 0, mastery_percent: 0 }),
    ]);

    expect(result.studiedPercent).toBe(100);
    expect(result.masteryPercent).toBe(0);
    expect(learningStatus(result)).toEqual({ kind: 'learning', label: 'Закрепляем' });
  });
});

it('сортирует по последнему занятию, добавлению или ручному порядку', () => {
  const items = [
    { id: 'a', title: 'Первый', addedAt: '2026-01-01', orderDate: '2026-06-01' },
    { id: 'b', title: 'Второй', addedAt: '2026-02-01', orderDate: '2026-02-01' },
    { id: 'c', title: 'Третий', addedAt: '2026-03-01', orderDate: '2026-03-01' },
  ];
  const progress = new Map([
    [
      'a',
      aggregateStats([
        stats({ last_studied_at: '2026-04-01T18:00:00+10:00' }),
        stats({ last_studied_at: '2026-04-01T10:00:00Z' }),
      ]),
    ],
    ['c', aggregateStats([stats({ last_studied_at: '2026-04-01T09:00:00Z' })])],
  ]);
  const ordered = (mode: Parameters<typeof sortMaterials>[1]) =>
    sortMaterials(items, mode, ['b', 'a', 'c'], progress).map((item) => item.id);
  expect(ordered('recent')).toEqual(['a', 'c', 'b']);
  expect(ordered('custom')).toEqual(['b', 'a', 'c']);
  expect(ordered('updated_desc')).toEqual(['c', 'b', 'a']);
  expect(ordered('updated_asc')).toEqual(['a', 'b', 'c']);
});
