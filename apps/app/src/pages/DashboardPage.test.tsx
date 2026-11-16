// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { DashboardPage, mergeRecentSets } from './DashboardPage';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn() } }));
vi.mock('../features/auth/auth-store', () => ({
  useAuthStore: (select: (state: { user: { username: string } }) => unknown) =>
    select({ user: { username: 'Ученик' } }),
}));
vi.mock('../features/retention/RetentionOverview', () => ({
  RetentionOverview: () => null,
}));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('показывает сохранённые наборы, когда собственных нет', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/sets') return { data: [], response: new Response() } as never;
    if (path === '/api/v1/library/sets') {
      return {
        data: [
          {
            id: 'saved-set',
            title: 'Сохранённый набор',
            cards_count: 12,
            saved_at: '2026-10-02T00:00:00Z',
          },
        ],
        response: new Response(),
      } as never;
    }
    return { data: [], response: new Response() } as never;
  });

  mount();

  const setLink = await screen.findByRole('link', { name: 'Сохранённый набор' });
  expect(setLink.getAttribute('href')).toBe('/sets/saved-set');
  expect(screen.getByText('набор').nextElementSibling?.textContent).toBe('1');
  expect(screen.queryByText('Здесь появятся ваши наборы')).toBeNull();
});

it('объединяет наборы без дублей и ставит свежие выше', () => {
  const merged = mergeRecentSets(
    [
      {
        id: 'owned',
        title: 'Свой',
        cards_count: 3,
        updated_at: '2026-10-01T00:00:00Z',
      },
    ],
    [
      {
        id: 'saved',
        title: 'Сохранённый',
        cards_count: 4,
        saved_at: '2026-10-02T00:00:00Z',
      },
      {
        id: 'owned',
        title: 'Дубль',
        cards_count: 3,
        saved_at: '2026-10-03T00:00:00Z',
      },
    ],
  );

  expect(merged.map((item) => item.id)).toEqual(['saved', 'owned']);
  expect(merged[1]?.title).toBe('Свой');
});

it('показывает доступный список при ошибке второго запроса и восстанавливает его по кнопке', async () => {
  let libraryUnavailable = true;
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/library/sets' && libraryUnavailable) return { error: {} } as never;
    if (path === '/api/v1/sets')
      return {
        data: [
          {
            id: 'empty',
            title: 'Пустой набор',
            cards_count: 0,
            updated_at: '2026-11-10T10:00:00Z',
          },
        ],
      } as never;
    if (path === '/api/v1/library/sets')
      return {
        data: [
          {
            id: 'recent',
            title: 'Свежий набор',
            cards_count: 5,
            saved_at: '2026-11-16T10:00:00Z',
          },
        ],
      } as never;
    return { data: [] } as never;
  });
  mount();
  const alert = await screen.findByRole('alert');
  expect(screen.getByRole('link', { name: 'Пустой набор' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Учить' }).hasAttribute('disabled')).toBe(true);
  libraryUnavailable = false;
  await userEvent.click(within(alert).getByRole('button', { name: 'Повторить' }));
  const study = await screen.findByRole('link', { name: 'Учить: Свежий набор' });
  expect(study.getAttribute('href')).toBe('/sets/recent/learn');
  expect(
    within(screen.getByRole('article')).getByRole('link', { name: 'Свежий набор' }),
  ).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('отличает загрузку от пустого списка и позволяет повторно запросить прогноз', async () => {
  let finishSets!: (value: never) => void;
  let forecastUnavailable = true;
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/sets')
      return await new Promise<never>((resolve) => {
        finishSets = resolve;
      });
    if (path === '/api/v1/study/forecast')
      return forecastUnavailable
        ? ({ error: {} } as never)
        : ({ data: [{ count: 4 }, { count: 8 }] } as never);
    return { data: [] } as never;
  });
  mount();
  expect(screen.getByRole('status').textContent).toContain('Загружаем наборы');
  expect(screen.queryByRole('button', { name: 'Создать набор' })).toBeNull();
  finishSets({ data: [] } as never);
  await screen.findByRole('button', { name: 'Создать набор' });
  forecastUnavailable = false;
  await userEvent.click(
    within(await screen.findByRole('alert')).getByRole('button', { name: 'Повторить' }),
  );
  expect(await screen.findByText('12')).toBeTruthy();
  expect(screen.getByText('4')).toBeTruthy();
});
