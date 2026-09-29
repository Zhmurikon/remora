// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { AchievementsPage } from './AchievementsPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('показывает открытые достижения и прогресс закрытых', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: {
      unlocked_count: 1,
      total_count: 2,
      newly_unlocked: [],
      items: [
        {
          code: 'first_review',
          title: 'Первый шаг',
          description: 'Ответьте на первую карточку',
          category: 'Обучение',
          icon: 'spark',
          unlocked: true,
          unlocked_at: '2026-09-29T00:00:00Z',
          seen: true,
          progress: 1,
          target: 1,
        },
        {
          code: 'reviews_10',
          title: 'Разминка',
          description: 'Ответьте на 10 карточек',
          category: 'Обучение',
          icon: 'cards',
          unlocked: false,
          unlocked_at: null,
          seen: false,
          progress: 4,
          target: 10,
        },
      ],
    },
  } as never);

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AchievementsPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Достижения' })).toBeTruthy();
  expect(screen.getByText('1', { selector: 'p' })).toBeTruthy();
  expect(screen.getByText('Получено')).toBeTruthy();
  expect(screen.getByText('4 из 10')).toBeTruthy();
  await waitFor(() => expect(api.GET).toHaveBeenCalledWith('/api/v1/retention/achievements'));
});
