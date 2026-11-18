import type { components } from '@remora/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

type Room = components['schemas']['BattleRoomOut'];
type Pending = components['schemas']['BattleAnswerIn'] & { index: number };

export function useBattleAnswer(room: Room) {
  const client = useQueryClient();
  const mine = room.participants.find((player) => player.is_current);
  const storageKey = `remora:battle-answer:${mine?.user_id}:${room.id}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Pending | null;
      return value &&
        typeof value.client_answer_id === 'string' &&
        typeof value.value === 'string' &&
        Number.isInteger(value.index) &&
        room.questions.some((q) => q.id === value.question_id)
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const queue = useRef(pending);
  const inFlight = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const currentRoom = useRef(room);
  currentRoom.current = room;
  const clear = useCallback(() => {
    queue.current = null;
    setPending(null);
    setError(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Память вкладки сохраняет состояние, если хранилище недоступно. */
    }
  }, [storageKey]);
  const send = useCallback(async () => {
    const item = queue.current;
    if (!item || inFlight.current || currentRoom.current.status !== 'active') return;
    inFlight.current = true;
    setSending(true);
    try {
      const { index: _index, ...body } = item;
      const { data, error: failure } = await api.POST('/api/v1/battles/{battle_id}/answers', {
        params: { path: { battle_id: room.id } },
        body,
      });
      if (failure || !data) throw new Error('answer');
      // Поздний ответ запроса не должен откатить более свежий polling-снимок.
      client.setQueryData<Room>(['battle', room.id], (latest) =>
        !latest || Date.parse(data.room.server_now) >= Date.parse(latest.server_now)
          ? data.room
          : latest,
      );
      clear();
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [client, room.id, clear]);
  useEffect(() => {
    if (!pending) return;
    if (
      ['finished', 'expired', 'cancelled'].includes(room.status) ||
      (mine?.answered_count ?? 0) > pending.index
    ) {
      clear();
      return;
    }
    void send();
    const interval = window.setInterval(() => void send(), 3_000);
    const online = () => void send();
    window.addEventListener('online', online);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', online);
    };
  }, [pending, room.status, mine?.answered_count, send, clear]);
  const choose = useCallback(
    (questionId: string, value: string, index: number) => {
      if (queue.current || inFlight.current) return;
      const next: Pending = {
        question_id: questionId,
        value,
        index,
        client_answer_id: crypto.randomUUID(),
      };
      queue.current = next;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
      setPending(next);
      setError(false);
    },
    [storageKey],
  );
  return { pending, sending, error, storageError, choose, retry: () => void send() };
}
