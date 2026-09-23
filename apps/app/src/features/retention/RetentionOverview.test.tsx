// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { RetentionOverview } from './RetentionOverview';

vi.mock('../../lib/api', () => ({ api: { GET: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const summary = {
  date: '2026-09-23',
  daily_goal: 20,
  reviews_today: 12,
  correct_today: 10,
  xp_today: 110,
  goal_completed: false,
  current_streak_days: 4,
  longest_streak_days: 9,
  last_active_date: '2026-09-23',
  freezes_left: 2,
  total_xp: 350,
  level: 2,
  current_level_xp: 250,
  next_level_xp: 300,
};

function renderOverview() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RetentionOverview />
    </QueryClientProvider>,
  );
}

it('показывает дневную цель, серию, уровень и активность', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/retention/summary') return { data: summary } as never;
    return {
      data: [
        {
          date: '2026-09-22',
          reviews_count: 18,
          correct_count: 15,
          xp_earned: 160,
          goal_reached_at: null,
          is_frozen: false,
        },
      ],
    } as never;
  });

  renderOverview();

  expect(await screen.findByText('Продолжайте в том же темпе')).toBeTruthy();
  expect(screen.getByLabelText('Дневная цель выполнена на 60%')).toBeTruthy();
  expect(screen.getByText('Текущая серия')).toBeTruthy();
  expect(screen.getByText('250 / 300 XP')).toBeTruthy();
  expect(await screen.findByLabelText('22 сентября 2026 г.: 18 карточек, 160 XP')).toBeTruthy();
  expect(api.GET).toHaveBeenCalledWith('/api/v1/retention/activity', {
    params: { query: { from: '2026-06-08', to: '2026-09-23' } },
  });
});

it('даёт повторить загрузку сводки после ошибки', async () => {
  vi.mocked(api.GET)
    .mockResolvedValueOnce({ error: { code: 'unavailable' } } as never)
    .mockResolvedValueOnce({ data: summary } as never)
    .mockResolvedValueOnce({ data: [] } as never);

  renderOverview();

  expect(await screen.findByText('Учебная активность недоступна')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  await waitFor(() => expect(screen.getByText('Продолжайте в том же темпе')).toBeTruthy());
});
