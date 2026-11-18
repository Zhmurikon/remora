// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { useAuthStore } from '../auth/auth-store';
import { AchievementCelebration, achievementsQueryKey } from './AchievementCelebration';

vi.mock('../../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
afterEach(() => {
  cleanup();
  useAuthStore.setState({ status: 'guest' });
  vi.clearAllMocks();
  vi.restoreAllMocks();
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
    const illustration = document.querySelector<HTMLImageElement>('.achievement-notice-art img');
    expect(illustration?.dataset.artwork).toBe('individual');
    expect(illustration?.getAttribute('src')).toContain('achievement-first-review');
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

const first = {
  code: 'first_review',
  title: 'Первый шаг',
  description: 'Ответьте на первую карточку',
};
const second = { code: 'reviews_10', title: 'Разминка', description: 'Ответьте на 20 карточек' };
const third = {
  code: 'reviews_100',
  title: 'Первая сотня',
  description: 'Ответьте на 100 карточек',
};

function renderNotice(newlyUnlocked = [first]) {
  useAuthStore.setState({ status: 'authenticated' });
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  const collection = {
    items: [],
    total_count: 20,
    unlocked_count: 3,
    newly_unlocked: newlyUnlocked,
  };
  client.setQueryData(achievementsQueryKey, collection);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/materials']}>
        <input aria-label="Поиск материалов" />
        <AchievementCelebration />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return {
    client,
    async publish(items: typeof newlyUnlocked) {
      await act(async () => {
        client.setQueryData(achievementsQueryKey, { ...collection, newly_unlocked: items });
      });
    },
  };
}

it('не забирает фокус, не блокирует ввод и закрывается Escape только из уведомления', async () => {
  vi.mocked(api.POST).mockResolvedValue({} as never);
  const { publish } = renderNotice([]);
  const user = userEvent.setup();
  const input = screen.getByRole('textbox');
  await user.click(input);
  await publish([first, second, third]);
  await screen.findByRole('status', { name: 'Получено новое достижение' });
  expect(document.activeElement).toBe(input);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('И ещё 2 в вашей коллекции')).toBeTruthy();
  await user.type(input, 'Биология');
  await user.keyboard('{Escape}');
  expect((input as HTMLInputElement).value).toBe('Биология');
  expect(screen.getByRole('status', { name: 'Получено новое достижение' })).toBeTruthy();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Закрыть уведомление' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('status', { name: 'Получено новое достижение' })).toBeNull();
  expect(document.activeElement).toBe(input);
});

it('после ошибки подтверждения скрывает закрытые награды, но показывает следующие', async () => {
  vi.mocked(api.POST).mockResolvedValue({ error: { code: 'offline' } } as never);
  const { publish } = renderNotice();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('status', { name: 'Получено новое достижение' })).toBeNull();
  await publish([first, second]);
  expect(await screen.findByRole('heading', { name: 'Разминка' })).toBeTruthy();
  expect(screen.queryByText('Первый шаг')).toBeNull();
  expect(screen.queryByText(/И ещё/)).toBeNull();
});

it('завершение старого подтверждения не стирает новое уведомление', async () => {
  let finish!: () => void;
  vi.mocked(api.POST).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({} as never);
      }),
  );
  const { publish } = renderNotice();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
  await publish([first, second]);
  await screen.findByRole('heading', { name: 'Разминка' });
  await act(async () => finish());
  expect(screen.getByRole('heading', { name: 'Разминка' })).toBeTruthy();
});

it('не показывает сохранённые в кэше награды после выхода', async () => {
  renderNotice();
  expect(screen.getByRole('status', { name: 'Получено новое достижение' })).toBeTruthy();
  await act(async () => useAuthStore.setState({ status: 'guest' }));
  expect(screen.queryByRole('status', { name: 'Получено новое достижение' })).toBeNull();
});

it('случайно выбирает Б или В для новой награды, сохраняя выбор при обновлении данных', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1);
  vi.mocked(api.POST).mockResolvedValue({} as never);
  const { publish } = renderNotice();
  const notice = () => document.querySelector<HTMLElement>('.achievement-motion')!;
  const firstNotice = notice();
  expect(firstNotice.dataset.motionVariant).toBe('b');
  vi.mocked(Math.random).mockReturnValue(0.9);
  await publish([first, second]);
  expect(notice()).toBe(firstNotice);
  expect(notice().dataset.motionVariant).toBe('b');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
  await publish([third]);
  await screen.findByRole('heading', { name: 'Первая сотня' });
  expect(notice().dataset.motionVariant).toBe('c');
  expect(screen.getByRole('heading', { name: 'Первая сотня' })).toBeTruthy();
});
