import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { SecurityPage } from './SecurityPage';

test('показывает состояние 2FA и журнал администратора', async () => {
  vi.spyOn(api, 'GET').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/security/status') {
      return {
        data: {
          required: false,
          enabled: true,
          enabled_at: '2026-10-27T07:00:00Z',
          last_used_at: '2026-10-27T07:05:00Z',
          recovery_codes_remaining: 7,
        },
      } as never;
    }
    return {
      data: {
        total: 1,
        offset: 0,
        limit: 50,
        items: [
          {
            id: 'audit-id',
            actor_user_id: 'user-id',
            actor_username: 'owner',
            action: 'admin.login.2fa',
            outcome: 'success',
            target_type: null,
            target_id: null,
            reason: null,
            ip: '127.0.0.1',
            details: {},
            created_at: '2026-10-27T07:05:00Z',
          },
        ],
      },
    } as never;
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SecurityPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Не обязателен')).toBeInTheDocument();
  expect(screen.getByText('7')).toBeInTheDocument();
  expect(await screen.findByText('Проверка второго фактора')).toBeInTheDocument();
  expect(screen.getByText('owner')).toBeInTheDocument();
  expect(screen.getByText('Успешно')).toBeInTheDocument();
});
