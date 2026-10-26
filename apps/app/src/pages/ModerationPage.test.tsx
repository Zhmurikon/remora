// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { useAuthStore } from '../features/auth/auth-store';
import { api } from '../lib/api';
import { ModerationPage } from './ModerationPage';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('показывает очередь и отправляет решение с причиной', async () => {
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
  vi.mocked(api.GET).mockImplementation(async (path) =>
    path === '/api/v1/moderation/courses'
      ? ({
          data: [
            {
              id: 'course-id',
              slug: 'spam',
              title: 'Подозрительный курс',
              description: '',
              is_published: true,
              moderation_status: 'pending',
              owner_id: 'owner-id',
              owner_username: 'owner',
              owner_status: 'active',
              open_reports: 2,
              priority: 210,
              automatic_signals: ['Подозрительные слова или ссылки'],
              created_at: '2026-10-26T00:00:00Z',
            },
          ],
        } as never)
      : ({ data: [] } as never),
  );
  vi.mocked(api.POST).mockResolvedValue({ data: {} } as never);
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <ModerationPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await screen.findByText('Подозрительный курс');
  await userEvent.type(
    screen.getByLabelText('Причина решения по курсу «Подозрительный курс»'),
    'Систематический спам',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Заблокировать автора' }));
  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith('/api/v1/moderation/courses/{course_id}/actions', {
      params: { path: { course_id: 'course-id' } },
      body: { action: 'ban_author', reason: 'Систематический спам' },
    }),
  );
});
