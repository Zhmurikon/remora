// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../features/auth/auth-store';
import { api, setAdminSession } from '../lib/api';
import { AdminPage } from './AdminPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
  setAdminSession: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('открывает панель только после второго фактора', async () => {
  useAuthStore.setState({
    status: 'authenticated',
    user: {
      id: 'admin-id',
      email: 'admin@example.com',
      username: 'admin',
      display_name: null,
      avatar_url: null,
      role: 'admin',
      email_verified: true,
      birth_date: null,
      locale: 'ru',
      timezone: 'Europe/Moscow',
    },
  });
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/admin/2fa/status') {
      return { data: { configured: true, enabled: true, recovery_codes_left: 10 } } as never;
    }
    if (path === '/api/v1/admin/dashboard') {
      return {
        data: {
          users_total: 12,
          users_active: 10,
          users_suspended: 2,
          open_reports: 1,
          queued_jobs: 3,
        },
      } as never;
    }
    return { data: [] } as never;
  });
  vi.mocked(api.POST).mockResolvedValue({ data: { admin_token: 'short-lived-token' } } as never);
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <AdminPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await userEvent.type(await screen.findByLabelText('Код TOTP или резервный код'), '123456');
  await userEvent.click(screen.getByRole('button', { name: 'Подтвердить второй фактор' }));
  await waitFor(() => expect(setAdminSession).toHaveBeenCalledWith('short-lived-token'));
  expect(await screen.findByText('12')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Пользователи' })).toBeTruthy();
});
