/**
 * Очередь ответов — место, где нарушается правило «ответы нельзя терять».
 * Поэтому здесь проверяется не счастливый путь, а поведение при обрыве сети,
 * параллельных отправках и повреждённом localStorage.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('../../lib/api', () => ({ api: { POST: post } }));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, String(value)),
  };
}

const { clear, detachSession, enqueue, flush, pendingCount } = await import('./review-queue');

function review(id: string) {
  return {
    client_review_id: id,
    card_id: '11111111-1111-1111-1111-111111111111',
    direction: 'term_to_def' as const,
    mode: 'learn' as const,
    rating: 3,
    answer_correct: true,
    duration_ms: 1000,
    reviewed_at: '2026-03-01T09:00:00.000Z',
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  post.mockReset();
  clear();
});

describe('очередь неотправленных ответов', () => {
  it('копит ответы и переживает перезагрузку вкладки', () => {
    enqueue(review('a'), 'session-1');
    enqueue(review('b'), 'session-1');
    expect(pendingCount()).toBe(2);
  });

  it('отправляет всё накопленное и очищает очередь', async () => {
    post.mockResolvedValue({ data: { accepted: [], duplicates: [], rejected: [], states: [] } });
    enqueue(review('a'), 'session-1');
    enqueue(review('b'), 'session-1');

    const result = await flush();

    expect(result).toEqual({ sent: 2, left: 0, ok: true });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[1].body.session_id).toBe('session-1');
    expect(pendingCount()).toBe(0);
  });

  it('при ошибке сети сохраняет ответы для следующей попытки', async () => {
    post.mockResolvedValue({ error: { code: 'NETWORK' } });
    enqueue(review('a'), 'session-1');

    const failed = await flush();
    expect(failed.ok).toBe(false);
    expect(pendingCount()).toBe(1);

    post.mockResolvedValue({ data: {} });
    const retried = await flush();
    expect(retried).toEqual({ sent: 1, left: 0, ok: true });
    expect(pendingCount()).toBe(0);
  });

  it('не отправляет один батч дважды при параллельных вызовах', async () => {
    // Автосброс по счётчику и сброс при уходе со страницы легко совпадают.
    post.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: {} }), 20)),
    );
    enqueue(review('a'), 'session-1');

    const [first, second] = await Promise.all([flush(), flush()]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(pendingCount()).toBe(0);
  });

  it('не теряет ответы, добавленные во время отправки', async () => {
    let release: (value: unknown) => void = () => {};
    post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    post.mockResolvedValue({ data: {} });
    enqueue(review('a'), 'session-1');

    const inFlight = flush();
    enqueue(review('b'), 'session-1');
    release({ data: {} });
    await inFlight;

    expect(pendingCount()).toBe(0);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]?.[1].body.reviews[0].client_review_id).toBe('b');
  });

  it('переживает повреждённое хранилище', async () => {
    localStorage.setItem('remora.study.pending-reviews', '{не json');
    expect(pendingCount()).toBe(0);
    await expect(flush()).resolves.toEqual({ sent: 0, left: 0, ok: true });
  });

  it('продолжает отправлять после сброса пустой очереди', async () => {
    // Пустой сброс отрабатывает синхронно и раньше ронял флаг single-flight:
    // после него очередь замирала и ответы не уходили уже никогда.
    post.mockResolvedValue({ data: {} });
    await flush();

    enqueue(review('a'), 'session-1');
    const result = await flush();

    expect(result).toEqual({ sent: 1, left: 0, ok: true });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('после завершения сессии оставляет ответы, но снимает привязку', async () => {
    post.mockResolvedValue({ data: {} });
    enqueue(review('a'), 'session-1');
    detachSession();
    expect(pendingCount()).toBe(1);

    await flush();
    expect(post.mock.calls[0]?.[1].body.session_id).toBeNull();
  });
});
