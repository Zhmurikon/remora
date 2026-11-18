import type { components } from '@remora/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../auth/auth-store';
import { achievementArtwork } from './achievement-art';
import { AchievementNoticeMotion } from './AchievementNoticeMotion';
import './achievement-celebration.css';

type Collection = components['schemas']['AchievementCollection'];

export const achievementsQueryKey = ['retention', 'achievements'] as const;

export function AchievementCelebration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const userId = useAuthStore((state) => state.user?.id);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState<{ userId: string | undefined; codes: string[] }>({
    userId,
    codes: [],
  });
  const achievements = useQuery({
    queryKey: achievementsQueryKey,
    queryFn: loadAchievements,
    enabled: authenticated,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const acknowledge = useMutation({
    mutationFn: async (_batch: { userId: string | undefined; codes: string[] }) => {
      const { error } = await api.POST('/api/v1/retention/achievements/acknowledge');
      if (error) throw new Error('Не удалось отметить достижения показанными');
    },
    onSuccess: (_, batch) => {
      if (useAuthStore.getState().user?.id !== batch.userId) return;
      queryClient.setQueryData<Collection>(achievementsQueryKey, (current) =>
        current
          ? {
              ...current,
              // Ответ старого запроса не должен убирать награды, пришедшие за это время.
              newly_unlocked: current.newly_unlocked.filter(
                (item) => !batch.codes.includes(item.code),
              ),
            }
          : current,
      );
    },
  });

  const dismissedCodes = dismissed.userId === userId ? dismissed.codes : [];
  const newlyUnlocked = (achievements.data?.newly_unlocked ?? []).filter(
    (item) => !dismissedCodes.includes(item.code),
  );
  if (!authenticated || newlyUnlocked.length === 0) return null;
  const current = newlyUnlocked[0]!;
  const artwork = achievementArtwork(current.code);

  function close(restoreFocus = true) {
    const codes = newlyUnlocked.map((item) => item.code);
    setDismissed({ userId, codes: [...new Set([...dismissedCodes, ...codes])] });
    // Закрытие не зависит от сети; неудачное подтверждение не возвращает тот же попап.
    acknowledge.mutate({ userId, codes });
    if (restoreFocus && returnFocus.current?.isConnected) {
      returnFocus.current.focus({ preventScroll: true });
    }
  }

  function openCollection() {
    close(false);
    navigate('/achievements');
  }

  return (
    <AchievementNoticeMotion key={`${userId ?? ''}:${current.code}`} artwork={artwork.src}>
      <aside
        className="achievement-notice"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Получено новое достижение"
        onFocus={(event) => {
          const previous = event.relatedTarget;
          if (previous instanceof HTMLElement && !event.currentTarget.contains(previous)) {
            returnFocus.current = previous;
          }
        }}
        onKeyDown={(event) => {
          // Escape относится к уведомлению только тогда, когда пользователь вошёл в него.
          if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
      >
        <button
          type="button"
          className="achievement-notice-close"
          aria-label="Закрыть уведомление"
          onClick={() => close()}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <h2>Новое достижение!</h2>
        <div className="achievement-notice-body">
          <div className="achievement-notice-art">
            <img src={artwork.src} width={512} height={512} alt="" data-artwork={artwork.variant} />
          </div>
          <div>
            <h3>{current.title}</h3>
            <p className="achievement-notice-description">{current.description}</p>
          </div>
        </div>
        {newlyUnlocked.length > 1 && (
          <p className="achievement-notice-extra">
            И ещё {newlyUnlocked.length - 1} в вашей коллекции
          </p>
        )}
        <button type="button" className="achievement-notice-action" onClick={openCollection}>
          Посмотреть коллекцию
        </button>
      </aside>
    </AchievementNoticeMotion>
  );
}

export async function loadAchievements(): Promise<Collection> {
  const { data, error } = await api.GET('/api/v1/retention/achievements');
  if (error || !data) throw new Error('Не удалось загрузить достижения');
  return data;
}
