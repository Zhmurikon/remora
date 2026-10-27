import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { PlansPage } from './PlansPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('показывает версии тарифов и открывает поиск диагностики пользователя', async () => {
  const user = userEvent.setup();
  const get = vi.spyOn(api, 'GET').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/plans') {
      return {
        data: {
          catalog_version: 3,
          source: 'app/config/plans.yaml',
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              code: 'plus',
              version: 3,
              name: 'Plus',
              price_month: 29900,
              price_year: 249900,
              effective_from: '2026-10-01T00:00:00Z',
              features: { 'ai.generation': true },
              limits: { 'courses.total': null },
              active_subscriptions: 18,
              matches_catalog: true,
            },
          ],
        },
      } as never;
    }
    return {
      data: {
        items: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            email: 'student@example.com',
            username: 'student',
            display_name: 'Ирина',
            role: 'user',
            status: 'active',
            email_verified: true,
            created_at: '2026-10-01T00:00:00Z',
            last_active_at: null,
            sets_count: 0,
            courses_count: 0,
            reviews_count: 0,
          },
        ],
        total: 1,
        offset: 0,
        limit: 10,
      },
    } as never;
  });

  renderPage();

  expect(await screen.findByRole('heading', { name: 'Plus' })).toBeInTheDocument();
  expect(screen.getByText('Синхронизирован')).toBeInTheDocument();
  expect(screen.getByText('Активных подписок: 18')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Имя, почта или UUID'), 'student');
  await user.click(screen.getByRole('button', { name: 'Найти' }));

  expect(await screen.findByText('Ирина')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Открыть права/ })).toHaveAttribute(
    'href',
    '/users/22222222-2222-4222-8222-222222222222',
  );
  expect(get).toHaveBeenCalledWith('/api/v1/admin/users', {
    params: { query: { query: 'student', offset: 0, limit: 10 } },
  });
});
