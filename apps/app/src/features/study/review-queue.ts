/**
 * Очередь неотправленных ответов.
 *
 * Правило проекта: ответы пользователя нельзя терять. Поэтому ответ сначала
 * ложится в localStorage и только потом уходит на сервер. Пока отправка не
 * подтверждена, запись живёт в очереди и переживает перезагрузку вкладки,
 * обрыв сети и закрытие ноутбука посреди сессии.
 *
 * Идемпотентность держится на `client_review_id`: повторная отправка того же
 * ответа ничего не дублирует, поэтому ретраить можно свободно.
 */

import type { components } from '@remora/api-client';
import { api } from '../../lib/api';

export type PendingReview = components['schemas']['ReviewIn'];

const STORAGE_KEY = 'remora.study.pending-reviews';
const MAX_BATCH = 100;

/** Сколько ответов копим до автоматической отправки. */
export const FLUSH_THRESHOLD = 5;

interface StoredQueue {
  sessionId: string | null;
  reviews: PendingReview[];
}

function read(): StoredQueue {
  if (typeof localStorage === 'undefined') return { sessionId: null, reviews: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessionId: null, reviews: [] };
    const parsed = JSON.parse(raw) as StoredQueue;
    if (!Array.isArray(parsed.reviews)) return { sessionId: null, reviews: [] };
    return { sessionId: parsed.sessionId ?? null, reviews: parsed.reviews };
  } catch {
    // Повреждённое хранилище не должно ронять тренировку.
    return { sessionId: null, reviews: [] };
  }
}

function write(queue: StoredQueue): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Переполненное или запрещённое хранилище — отправляем без страховки.
  }
}

export function pendingCount(): number {
  return read().reviews.length;
}

export function enqueue(review: PendingReview, sessionId: string | null): void {
  const queue = read();
  write({ sessionId: sessionId ?? queue.sessionId, reviews: [...queue.reviews, review] });
}

export interface FlushResult {
  sent: number;
  left: number;
  ok: boolean;
}

let flushInFlight: Promise<FlushResult> | null = null;

/**
 * Отправляет накопленные ответы. Параллельные вызовы схлопываются в один:
 * иначе автосброс по счётчику и сброс по выходу со страницы отправили бы
 * один и тот же батч дважды.
 *
 * Сброс флага вынесен в `finally` промиса, а не внутрь `run`: при пустой
 * очереди тело `run` отрабатывает синхронно, и сброс внутри случился бы
 * раньше присваивания — очередь после этого замерла бы навсегда.
 */
export function flush(): Promise<FlushResult> {
  flushInFlight ??= run().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

async function run(): Promise<FlushResult> {
  let queue = read();
  let sent = 0;
  while (queue.reviews.length > 0) {
    const batch = queue.reviews.slice(0, MAX_BATCH);
    const { error } = await api.POST('/api/v1/study/reviews', {
      body: { session_id: queue.sessionId, reviews: batch },
    });
    if (error) return { sent, left: queue.reviews.length, ok: false };
    // Читаем заново: пока шёл запрос, пользователь мог ответить ещё.
    const current = read();
    const remaining = current.reviews.slice(batch.length);
    write({ sessionId: current.sessionId, reviews: remaining });
    sent += batch.length;
    queue = { sessionId: current.sessionId, reviews: remaining };
  }
  return { sent, left: 0, ok: true };
}

/** Сессия завершена — привязку очереди к ней снимаем, сами ответы оставляем. */
export function detachSession(): void {
  const queue = read();
  write({ sessionId: null, reviews: queue.reviews });
}

export function clear(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
