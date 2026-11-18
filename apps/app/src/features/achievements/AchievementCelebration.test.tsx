// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuthStore } from '../auth/auth-store';
import { AchievementCelebration } from './AchievementCelebration';

vi.mock('../../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
afterEach(() => {
  cleanup();
  useAuthStore.setState({ status: 'guest' });
  vi.clearAllMocks();
});

function Location() {
  return <output aria-label="Текущий маршрут">{useLocation().pathname}</output>;
}

it.each(['Посмотреть коллекцию', 'Закрыть уведомление'])(
  '%s отмечает показанное достижение и закрывает уведомление',
  async (action) => {
    useAuthStore.setState({ status: 'authenticated' });
    vi.mocked(api.GET).mockResolvedValue({
      data: {
        items: [],
        total_count: 20,
        unlocked_count: 1,
        newly_unlocked: [
          { code: 'first_review', title: 'Первый шаг', description: 'Ответьте на первую карточку' },
        ],
      },
    } as never);
    vi.mocked(api.POST).mockResolvedValue({} as never);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={['/materials']}>
          <AchievementCelebration />
          <Location />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('status', { name: 'Получено новое достижение' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: action }));
    await waitFor(() =>
      expect(api.POST).toHaveBeenCalledWith('/api/v1/retention/achievements/acknowledge'),
    );
    expect(screen.queryByRole('status', { name: 'Получено новое достижение' })).toBeNull();
    expect(screen.getByLabelText('Текущий маршрут').textContent).toBe(
      action === 'Посмотреть коллекцию' ? '/achievements' : '/materials',
    );
  },
);
