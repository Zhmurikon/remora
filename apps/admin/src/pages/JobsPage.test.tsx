import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { JobsPage } from './JobsPage';

test('показывает ошибочные операции и открывает защищённый повтор', async () => {
  vi.spyOn(api, 'GET').mockResolvedValue({
    data: {
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'export',
          status: 'failed',
          user_id: '22222222-2222-4222-8222-222222222222',
          username: 'student',
          email: 'student@example.com',
          label: 'Полный экспорт аккаунта',
          progress: 5,
          error: 'Экспорт не завершён',
          created_at: '2026-10-28T00:00:00Z',
          started_at: '2026-10-28T00:01:00Z',
          finished_at: '2026-10-28T00:02:00Z',
          retryable: true,
          stale: false,
        },
      ],
      total: 1,
      offset: 0,
      limit: 25,
    },
  } as never);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <JobsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Полный экспорт аккаунта')).toBeInTheDocument();
  expect(screen.getByText('Экспорт не завершён')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(screen.getByRole('heading', { name: 'Повторить фоновую операцию' })).toBeInTheDocument();
  expect(screen.getByText('Повтор фиксируется в административном аудите.')).toBeInTheDocument();
});
