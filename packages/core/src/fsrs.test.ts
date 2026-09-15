import { describe, expect, it } from 'vitest';
import fixtures from './fsrs-cases.json';
import { SCHEDULER_VERSION, initialState, previewIntervals, review, type FsrsState } from './fsrs';
import { formatIntervalSeconds } from './format';
import type { CardState, Rating } from './domain';

interface FixtureState {
  state: string;
  stability: number | null;
  difficulty: number | null;
  step: number | null;
  dueAt: string;
  lastReviewedAt: string | null;
}

function toState(raw: FixtureState): FsrsState {
  return {
    state: raw.state as CardState,
    stability: raw.stability,
    difficulty: raw.difficulty,
    step: raw.step,
    dueAt: new Date(raw.dueAt),
    lastReviewedAt: raw.lastReviewedAt === null ? null : new Date(raw.lastReviewedAt),
  };
}

describe('сверка TS-порта FSRS с серверным планировщиком', () => {
  it('использует ту же версию планировщика', () => {
    expect(fixtures.schedulerVersion).toBe(SCHEDULER_VERSION);
  });

  it.each(fixtures.cases.map((item) => [item.name, item] as const))(
    'совпадает с сервером: %s',
    (_name, fixture) => {
      const state = toState(fixture.state);
      const now = new Date(fixture.now);
      const options = fixture.options;

      const previews = previewIntervals(state, now, options);
      expect(previews.map((preview) => preview.dueAt.toISOString())).toEqual(
        fixture.previews.map((preview) => new Date(preview.dueAt).toISOString()),
      );
      expect(previews.map((preview) => preview.intervalSeconds)).toEqual(
        fixture.previews.map((preview) => preview.intervalSeconds),
      );

      for (const expected of fixture.after) {
        const actual = review(state, expected.rating as Rating, now, options);
        expect(actual.state).toBe(expected.state.state);
        expect(actual.dueAt.toISOString()).toBe(new Date(expected.state.dueAt).toISOString());
        expect(actual.step).toBe(expected.state.step);
        // Стабильность и сложность — вещественные: сверяем с точностью,
        // с которой они вообще влияют на итоговый интервал.
        expectClose(actual.stability, expected.state.stability);
        expectClose(actual.difficulty, expected.state.difficulty);
      }
    },
  );
});

function expectClose(actual: number | null, expected: number | null): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  expect(actual!).toBeCloseTo(expected, 9);
}

describe('предпросмотр интервалов', () => {
  const now = new Date('2026-03-01T09:00:00Z');

  it('растёт от «не помню» к «легко»', () => {
    const intervals = previewIntervals(initialState(now), now).map(
      (preview) => preview.intervalSeconds,
    );
    expect(intervals).toEqual([...intervals].sort((left, right) => left - right));
    expect(intervals[0]).toBeLessThan(intervals[3]!);
  });

  it('учитывает целевое удержание', () => {
    const state = initialState(now);
    const relaxed = review(state, 4, now, { desiredRetention: 0.8 });
    const strict = review(state, 4, now, { desiredRetention: 0.95 });
    expect(strict.dueAt.getTime()).toBeLessThan(relaxed.dueAt.getTime());
  });

  it('не выходит за максимальный интервал', () => {
    let state = initialState(now);
    let moment = now;
    for (let index = 0; index < 12; index += 1) {
      state = review(state, 4, moment, { maximumIntervalDays: 30 });
      expect(state.dueAt.getTime() - moment.getTime()).toBeLessThanOrEqual(30 * 86_400_000);
      moment = state.dueAt;
    }
  });
});

describe('подписи интервалов на кнопках самооценки', () => {
  it.each([
    [30, '1 минута'],
    [60, '1 минута'],
    [600, '10 минут'],
    [7200, '2 часа'],
    [86_400, '1 день'],
    [86_400 * 3, '3 дня'],
    [86_400 * 11, '11 дней'],
    [86_400 * 365, '1 год'],
  ])('%i секунд → %s', (seconds, expected) => {
    expect(formatIntervalSeconds(seconds)).toBe(expected);
  });
});
