// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ApiTokens } from './ApiTokens';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('показывает секрет однократно, без кеширования и права публикации по умолчанию', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: [] } as never);
  vi.mocked(api.POST).mockResolvedValue({ data: { token: 'rmr_test_secret' } } as never);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <ApiTokens />
    </QueryClientProvider>,
  );
  await userEvent.type(screen.getByLabelText('Название токена'), 'Мой агент');
  await userEvent.click(screen.getByRole('button', { name: 'Создать токен' }));
  expect(((await screen.findByLabelText('Новый API-токен')) as HTMLInputElement).value).toBe(
    'rmr_test_secret',
  );
  expect(api.POST).toHaveBeenCalledWith('/api/v1/users/me/api-tokens', {
    body: {
      name: 'Мой агент',
      expires_in_days: 90,
      scopes: ['materials:read', 'materials:write'],
    },
  });
  expect(JSON.stringify(cache.getQueryCache().getAll())).not.toContain('rmr_test_secret');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранено, скрыть' }));
  expect(screen.queryByLabelText('Новый API-токен')).toBeNull();
});

it('отзывает только после подтверждения', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: [
      {
        id: 'token-1',
        name: 'Агент',
        prefix: 'rmr_123',
        scopes: [],
        expires_at: '2099-01-01',
        revoked_at: null,
        last_used_at: null,
      },
    ],
  } as never);
  vi.mocked(api.DELETE).mockResolvedValue({} as never);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ApiTokens />
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Отозвать' }));
  expect(api.DELETE).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Да, отозвать' }));
  await waitFor(() =>
    expect(api.DELETE).toHaveBeenCalledWith('/api/v1/users/me/api-tokens/{token_id}', {
      params: { path: { token_id: 'token-1' } },
    }),
  );
});
