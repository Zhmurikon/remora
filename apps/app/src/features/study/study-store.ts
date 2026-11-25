/**
 * Локальное состояние тренировки.
 *
 * Серверу принадлежит расписание, этому стору — текущая позиция в очереди,
 * счётчики сессии и отправка ответов. Всё, что пользователь уже сделал,
 * попадает в localStorage до сетевого запроса (`review-queue`), поэтому
 * обрыв связи не стоит ни одного ответа.
 */

import type { components } from '@remora/api-client';
import type { Rating, StudyDirection, StudyMode } from '@remora/core';
import { create } from 'zustand';
import { FLUSH_THRESHOLD, enqueue, flush, pendingCount } from './review-queue';

export type QueueItem = components['schemas']['QueueItem'];
export type StudyQueue = components['schemas']['StudyQueue'];

export interface AnswerLog {
  queueIndex?: number;
  cardId: string;
  direction: StudyDirection;
  term: string;
  definition: string;
  rating: Rating;
  correct: boolean;
  /** Что ввёл пользователь — нужно для разбора ошибок. */
  typed?: string;
}

type SyncState = 'idle' | 'syncing' | 'offline';

interface StudyState {
  rewardCount: number;
  rewardStreak: number;
  mode: StudyMode | null;
  setId: string | null;
  sessionId: string | null;
  items: QueueItem[];
  /** Индекс текущей карточки в `items`. */
  index: number;
  answers: AnswerLog[];
  /** Карточки, ушедшие на повтор внутри этой же сессии. */
  requeued: QueueItem[];
  startedAt: number;
  sync: SyncState;
  pending: number;

  begin: (input: {
    mode: StudyMode;
    setId: string;
    sessionId: string | null;
    items: QueueItem[];
  }) => void;
  answer: (input: {
    item: QueueItem;
    rating: Rating;
    correct: boolean;
    typed?: string;
    durationMs: number;
    /** В сопоставлении определения можно решать в любом порядке. */
    consume?: QueueItem;
    updatesSchedule?: boolean;
    showReward?: boolean;
    /** Показать карточку ещё раз в этой же сессии (ошибка в «Заучивании»). */
    requeue?: boolean;
  }) => void;
  deferCurrent: () => void;
  goTo: (index: number) => void;
  syncNow: () => Promise<void>;
  reset: () => void;
}

const initial = {
  rewardCount: 0,
  rewardStreak: 0,
  mode: null,
  setId: null,
  sessionId: null,
  items: [] as QueueItem[],
  index: 0,
  answers: [] as AnswerLog[],
  requeued: [] as QueueItem[],
  startedAt: 0,
  sync: 'idle' as SyncState,
  pending: 0,
};

export const useStudyStore = create<StudyState>((set, get) => ({
  ...initial,

  begin: ({ mode, setId, sessionId, items }) =>
    set({
      ...initial,
      mode,
      setId,
      sessionId,
      items,
      startedAt: Date.now(),
      pending: pendingCount(),
    }),

  answer: ({
    item,
    rating,
    correct,
    typed,
    durationMs,
    updatesSchedule = true,
    showReward = true,
    requeue,
    consume,
  }) => {
    const state = get();
    let items = state.items;
    if (consume) {
      const position = items.indexOf(consume, state.index);
      if (position < 0) return;
      if (position !== state.index) {
        items = [...items];
        items.splice(position, 1);
        items.splice(state.index, 0, consume);
      }
    }
    enqueue(
      {
        client_review_id: crypto.randomUUID(),
        card_id: item.card.id,
        direction: item.direction,
        mode: state.mode ?? 'learn',
        rating,
        answer_correct: correct,
        duration_ms: Math.min(durationMs, 3_600_000),
        updates_schedule: updatesSchedule,
        reviewed_at: new Date().toISOString(),
      },
      state.sessionId,
    );

    set({
      index: state.index + 1,
      rewardCount: state.rewardCount + Number(correct && showReward),
      rewardStreak: correct ? state.rewardStreak + 1 : 0,
      pending: pendingCount(),
      answers: [
        ...state.answers,
        {
          queueIndex: state.index,
          cardId: item.card.id,
          direction: item.direction,
          term: item.card.term,
          definition: item.card.definition,
          rating,
          correct,
          typed,
        },
      ],
      // Ошибку возвращаем в конец очереди: правило режима «Заучивание» —
      // карточка не считается пройденной, пока не воспроизведена верно.
      items: requeue ? [...items, consume ?? item] : items,
      requeued: requeue ? [...state.requeued, item] : state.requeued,
    });

    if (pendingCount() >= FLUSH_THRESHOLD) void get().syncNow();
  },

  deferCurrent: () =>
    set(({ items, index }) => {
      const current = items[index];
      if (!current || index === items.length - 1) return {};
      return { items: [...items.slice(0, index), ...items.slice(index + 1), current] };
    }),

  goTo: (index) => set({ index }),

  syncNow: async () => {
    if (pendingCount() === 0) {
      set({ sync: 'idle', pending: 0 });
      return;
    }
    set({ sync: 'syncing' });
    const result = await flush();
    set({ sync: result.ok ? 'idle' : 'offline', pending: result.left });
  },

  reset: () => set({ ...initial, pending: pendingCount() }),
}));

/** Прогресс сессии: сколько карточек пройдено из запланированных. */
export function selectProgress(state: StudyState): { done: number; total: number } {
  return { done: Math.min(state.index, state.items.length), total: state.items.length };
}

export function selectCurrent(state: StudyState): QueueItem | null {
  return state.items[state.index] ?? null;
}
