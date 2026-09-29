import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../auth/auth-store';
import { AchievementIcon } from './AchievementIcon';

type Collection = components['schemas']['AchievementCollection'];

export const achievementsQueryKey = ['retention', 'achievements'] as const;

export function AchievementCelebration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authenticated = useAuthStore((state) => state.status === 'authenticated');
  const [dismissed, setDismissed] = useState(false);
  const achievements = useQuery({
    queryKey: achievementsQueryKey,
    queryFn: loadAchievements,
    enabled: authenticated,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const acknowledge = useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/retention/achievements/acknowledge');
      if (error) throw new Error('Не удалось отметить достижения показанными');
    },
    onSuccess: () => {
      queryClient.setQueryData<Collection>(achievementsQueryKey, (current) =>
        current ? { ...current, newly_unlocked: [] } : current,
      );
    },
  });

  const newlyUnlocked = achievements.data?.newly_unlocked ?? [];
  if (dismissed || newlyUnlocked.length === 0) return null;

  function close() {
    setDismissed(true);
    acknowledge.mutate();
  }

  function openCollection() {
    close();
    navigate('/achievements');
  }

  return (
    <aside
      className="border-accent bg-surface fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border p-5 shadow-xl"
      role="status"
      aria-live="polite"
      aria-label="Получено новое достижение"
    >
      <button
        type="button"
        className="text-fg-muted hover:bg-surface-muted focus-visible:ring-primary absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl text-xl focus-visible:outline-none focus-visible:ring-2"
        aria-label="Закрыть уведомление"
        onClick={close}
      >
        ×
      </button>
      <div className="flex gap-3 pr-9">
        <span className="bg-accent-subtle grid h-12 w-12 shrink-0 place-items-center rounded-2xl">
          <AchievementIcon unlocked />
        </span>
        <div>
          <p className="text-accent text-sm font-semibold">Новое достижение!</p>
          <h2 className="mt-1 text-lg font-semibold">{newlyUnlocked[0]?.title}</h2>
          <p className="text-fg-muted mt-1 text-sm">{newlyUnlocked[0]?.description}</p>
          {newlyUnlocked.length > 1 && (
            <p className="text-fg-subtle mt-2 text-xs">
              И ещё {newlyUnlocked.length - 1} в вашей коллекции
            </p>
          )}
        </div>
      </div>
      <Button className="mt-4" fullWidth size="sm" onClick={openCollection}>
        Посмотреть коллекцию
      </Button>
    </aside>
  );
}

export async function loadAchievements(): Promise<Collection> {
  const { data, error } = await api.GET('/api/v1/retention/achievements');
  if (error || !data) throw new Error('Не удалось загрузить достижения');
  return data;
}
