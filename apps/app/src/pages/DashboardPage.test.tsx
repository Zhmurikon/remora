// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
  expect(screen.getByText('Наборов').parentElement?.textContent).toBe('Наборов1');
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
