import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { ModerationPage } from './ModerationPage';

const report = {
  id: '22222222-2222-4222-8222-222222222222',
  reason: 'misleading',
  comment: 'Неверные сведения в уроке',
  status: 'open',
  created_at: '2026-10-27T07:00:00Z',
  resolved_at: null,
  course_id: '11111111-1111-4111-8111-111111111111',
  course_slug: 'kurs-na-proverku',
  course_title: 'Курс на проверку',
  course_moderation_status: 'pending',
  course_is_published: true,
  author_id: '33333333-3333-4333-8333-333333333333',
  author_username: 'author',
  reporter_username: 'reader',
} as const;

const detail = {
  id: report.course_id,
  slug: report.course_slug,
  title: report.course_title,
  description: 'Описание курса',
  author_id: report.author_id,
  author_username: report.author_username,
  is_published: true,
  is_listed: true,
  moderation_status: 'pending',
  published_at: '2026-10-26T07:00:00Z',
  updated_at: '2026-10-27T07:00:00Z',
  reports_total: 1,
  reports_open: 1,
  last_report_at: report.created_at,
  risk_signals: ['Открытых жалоб: 1'],
  reports: [report],
  history: [],
} as const;

beforeEach(() => vi.restoreAllMocks());

test('показывает очередь и подтверждает блокирующее решение', async () => {
  vi.spyOn(api, 'GET').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/moderation/reports') {
      return { data: { items: [report], total: 1, offset: 0, limit: 25 } } as never;
    }
    if (path === '/api/v1/admin/moderation/courses/{course_id}') {
      return { data: detail } as never;
    }
    return { data: { items: [], total: 0, offset: 0, limit: 25 } } as never;
  });
  const post = vi.spyOn(api, 'POST').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/security/confirm') {
      return {
        data: { confirmation_token: 'confirmed', expires_at: '2026-10-27T08:00:00Z' },
      } as never;
    }
    return {
      data: {
        ...detail,
        moderation_status: 'blocked',
        reports_open: 0,
        reports: [{ ...report, status: 'accepted' }],
      },
    } as never;
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={queryClient}>
      <ModerationPage />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Курс на проверку')).toBeInTheDocument();
  expect(screen.getByText('Неверные сведения в уроке')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Принять' }));

  expect(screen.getByText('Принять жалобу и заблокировать курс?')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Причина изменения'), 'Нарушение подтверждено модератором');
  await user.type(screen.getByLabelText('Пароль администратора или код 2FA'), 'Strong-password-1');
  await user.click(screen.getByRole('button', { name: 'Принять жалобу' }));

  expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/moderation/reports/{report_id}/resolve',
    expect.objectContaining({
      body: { outcome: 'accepted', reason: 'Нарушение подтверждено модератором' },
      params: expect.objectContaining({
        header: expect.objectContaining({ 'X-Admin-Confirmation': 'confirmed' }),
      }),
    }),
  );
  expect(await screen.findByText('Жалоба принята, курс заблокирован.')).toBeInTheDocument();
});
