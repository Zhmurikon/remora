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
  expect(
    (await screen.findByRole('progressbar', { name: 'Прогресс коллекции' })).getAttribute(
      'aria-valuenow',
    ),
  ).toBe('1');
  expect(screen.getByRole('link', { name: 'Обучение 1 из 2' }).getAttribute('href')).toBe(
    '#achievement-category-0',
  );
  expect(screen.getByText('Получено')).toBeTruthy();
  expect(screen.getByText('4 из 10')).toBeTruthy();
  await waitFor(() => expect(api.GET).toHaveBeenCalledWith('/api/v1/retention/achievements'));
});

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AchievementsPage />
    </QueryClientProvider>,
  );
}

it('повторяет неудавшийся запрос и показывает пустую коллекцию без деления на ноль', async () => {
  vi.mocked(api.GET)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({
      data: { unlocked_count: 0, total_count: 0, items: [], newly_unlocked: [] },
    } as never);
  renderPage();
  expect(await screen.findByRole('alert')).toBeTruthy();
  const { default: userEvent } = await import('@testing-library/user-event');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByRole('heading', { name: 'Достижений пока нет' })).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('0 из 0');
  expect(screen.getByText('0%')).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Категории достижений' })).toBeNull();
  expect(api.GET).toHaveBeenCalledTimes(2);
});

it('сохраняет полученную награду при уменьшении метрики и показывает нулевой прогресс другой', async () => {
  const item = {
    code: 'sets_1',
    title: 'Автор набора',
    description: 'Создайте первый набор',
    category: 'Творчество',
    icon: 'edit',
    progress: 0,
    target: 1,
    unlocked: true,
    seen: true,
    unlocked_at: '2026-09-29T00:00:00Z',
  };
  vi.mocked(api.GET).mockResolvedValue({
    data: {
      unlocked_count: 1,
      total_count: 2,
      newly_unlocked: [],
      items: [
        item,
        {
          ...item,
          code: 'import_1',
          title: 'Быстрый старт',
          description: 'Завершите первый импорт',
          unlocked: false,
          unlocked_at: null,
        },
      ],
    },
  } as never);
  const { container } = renderPage();
  expect(await screen.findByText('Получено')).toBeTruthy();
  expect(screen.queryByRole('progressbar', { name: 'Прогресс: Автор набора' })).toBeNull();
  expect(
    screen
      .getByRole('progressbar', { name: 'Прогресс: Быстрый старт' })
      .getAttribute('aria-valuenow'),
  ).toBe('0');
  expect(screen.getByText('0 из 1')).toBeTruthy();
  const illustrations = container.querySelectorAll('.achievement-illustration img');
  expect(illustrations.length).toBe(2);
  expect(illustrations[0]?.getAttribute('src')).toBe(illustrations[1]?.getAttribute('src'));
});

it('сохраняет заголовок и доступное состояние загрузки', () => {
  vi.mocked(api.GET).mockReturnValue(new Promise(() => {}));
  renderPage();
  expect(screen.getByRole('heading', { name: 'Достижения' })).toBeTruthy();
  expect(screen.getByLabelText('Загрузка достижений').getAttribute('aria-busy')).toBe('true');
});
