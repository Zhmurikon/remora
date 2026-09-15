/**
 * Загрузка очереди и жизненный цикл сессии для любого режима обучения.
 *
 * Здесь же — восстановление: если пользователь ушёл с вкладки посреди
 * тренировки, сервер вернёт ту же незавершённую сессию, а неотправленные
 * ответы уйдут из локальной очереди при первом же синхронном моменте.
 */

import type { StudyMode } from '@remora/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { detachSession, flush } from './review-queue';
import { useStudyStore } from './study-store';

export type StudyScope = 'due' | 'all' | 'hard' | 'new';
export type StudyDirectionMode = 'term_to_def' | 'def_to_term' | 'both';

export interface StudySessionOptions {
  setId: string;
  mode: StudyMode;
  scope?: StudyScope;
  direction?: StudyDirectionMode;
  shuffle?: boolean;
  /** «Карточки» по умолчанию не пишут в расписание — это просмотр, не повторение. */
  trackProgress?: boolean;
}

export function useStudySession({
  setId,
  mode,
  scope = 'due',
  direction = 'term_to_def',
  shuffle = true,
  trackProgress = true,
}: StudySessionOptions) {
  const begin = useStudyStore((state) => state.begin);
  const reset = useStudyStore((state) => state.reset);
  const startedFor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['study', 'queue', setId, mode, scope, direction, shuffle, trackProgress],
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    queryFn: async () => {
      const session = trackProgress
        ? await api.POST('/api/v1/study/sessions', {
            body: { set_id: setId, mode, config: { scope, direction } },
          })
        : null;
      const { data, error } = await api.GET('/api/v1/study/sets/{set_id}/queue', {
        params: { path: { set_id: setId }, query: { mode, scope, direction, shuffle } },
      });
      if (error || !data) throw new Error('Не удалось загрузить карточки');
      return { queue: data, sessionId: session?.data?.id ?? null };
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const key = `${setId}:${mode}:${scope}:${direction}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    begin({
      mode,
      setId,
      sessionId: query.data.sessionId,
      items: query.data.queue.items,
    });
  }, [begin, direction, mode, query.data, scope, setId]);

  useEffect(() => () => reset(), [reset]);

  // Уход со страницы — последний шанс отдать ответы. sendBeacon не годится:
  // запросу нужен заголовок авторизации, поэтому просто пробуем отправить.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return query;
}

/** Завершает сессию на сервере, предварительно отдав всё, что не ушло. */
export async function finishSession(sessionId: string | null): Promise<void> {
  await flush();
  if (sessionId) {
    await api.POST('/api/v1/study/sessions/{session_id}/finish', {
      params: { path: { session_id: sessionId } },
    });
  }
  detachSession();
}
