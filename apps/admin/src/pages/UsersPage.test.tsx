import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { UsersPage } from './UsersPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  );
}

test('ищет пользователя и показывает агрегаты аккаунта', async () => {
  const get = vi.spyOn(api, 'GET').mockResolvedValue({
    data: {
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'student@example.com',
          username: 'student',
          display_name: 'Ирина',
          role: 'user',
          status: 'active',
          email_verified: true,
          created_at: '2026-09-20T10:00:00Z',
          last_active_at: '2026-10-02T03:00:00Z',
          sets_count: 8,
          courses_count: 2,
          reviews_count: 413,
        },
      ],
      total: 1,
      offset: 0,
      limit: 25,
    },
  } as never);
  const user = userEvent.setup();

  renderPage();
  expect(await screen.findByText('Ирина')).toBeInTheDocument();
  expect(screen.getByText('student@example.com')).toBeInTheDocument();
  expect(screen.getByText('8 наб. / 2 кур.')).toBeInTheDocument();
  expect(screen.getByText('413')).toBeInTheDocument();

  await user.type(screen.getByLabelText('Имя, почта или идентификатор'), 'student@example.com');
  await user.click(screen.getByRole('button', { name: 'Найти' }));

  expect(get).toHaveBeenLastCalledWith('/api/v1/admin/users', {
    params: { query: { query: 'student@example.com', offset: 0, limit: 25 } },
  });
});
