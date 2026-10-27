import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { UserDetailPage } from './UserDetailPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/users/11111111-1111-4111-8111-111111111111']}>
        <Routes>
          <Route path="/users/:userId" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('показывает тариф, активность, материалы и платежи пользователя', async () => {
  const get = vi.spyOn(api, 'GET').mockResolvedValue({
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'student@example.com',
      username: 'student',
      display_name: 'Ирина',
      role: 'user',
      status: 'active',
      email_verified: true,
      created_at: '2026-09-20T10:00:00Z',
      updated_at: '2026-10-02T03:00:00Z',
      deleted_at: null,
      locale: 'ru',
      timezone: 'Europe/Moscow',
      oauth_providers: ['google'],
      materials: {
        sets_total: 8,
        sets_archived: 1,
        cards_total: 240,
        courses_total: 2,
        courses_published: 1,
        recent: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            kind: 'set',
            title: 'Английские слова',
            status: 'public',
            items_count: 120,
            updated_at: '2026-10-01T12:00:00Z',
          },
        ],
      },
      activity: {
        reviews_total: 413,
        reviews_7d: 48,
        reviews_30d: 170,
        active_days_30d: 12,
        last_active_at: '2026-10-02T03:00:00Z',
      },
      access: {
        plan_code: 'plus',
        plan_name: 'Plus',
        plan_version: 1,
        current_period_end: '2026-11-02T03:00:00Z',
        cancel_at_period_end: true,
        features: { 'ai.generation': true, 'classes.xlsx_export': true },
        limits: { 'courses.total': null, 'tts.chars_per_month': 150000 },
        usage: { 'courses.total': 2, 'tts.chars_per_month': 1200 },
        remaining: { 'courses.total': null, 'tts.chars_per_month': 148800 },
        overrides: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            key: 'limit.ai.generation_tokens_per_week',
            value: 750000,
            source: 'admin',
            reason: 'Индивидуальная квота',
            starts_at: '2026-10-01T00:00:00Z',
            valid_until: null,
            revocable: true,
          },
        ],
        history: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            key: 'limit.ai.generation_tokens_per_week',
            value: 750000,
            source: 'admin',
            reason: 'Индивидуальная квота',
            starts_at: '2026-10-01T00:00:00Z',
            valid_until: null,
            revocable: true,
            status: 'active',
            created_at: '2026-10-01T00:00:00Z',
          },
        ],
        decisions: [
          {
            key: 'feature.ai.generation',
            kind: 'feature',
            value: true,
            source: 'plan',
            source_label: 'Тариф Plus v1',
            reason: null,
          },
          {
            key: 'feature.classes.xlsx_export',
            kind: 'feature',
            value: true,
            source: 'plan',
            source_label: 'Тариф Plus v1',
            reason: null,
          },
          {
            key: 'limit.courses.total',
            kind: 'limit',
            value: 'unlimited',
            source: 'plan',
            source_label: 'Тариф Plus v1',
            reason: null,
          },
          {
            key: 'limit.tts.chars_per_month',
            kind: 'limit',
            value: 150000,
            source: 'plan',
            source_label: 'Тариф Plus v1',
            reason: null,
          },
        ],
        degradation: {
          limit_impacts: [],
          lost_features: ['ai.generation', 'classes.xlsx_export'],
          guarantees: ['Материалы не удаляются и остаются доступны'],
        },
      },
      payments: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          plan_code: 'plus',
          plan_name: 'Plus',
          interval: 'month',
          status: 'succeeded',
          amount: 23920,
          discount_amount: 5980,
          currency: 'RUB',
          promo_code: 'START20',
          created_at: '2026-10-02T03:00:00Z',
          paid_at: '2026-10-02T03:01:00Z',
        },
      ],
      promo_redemptions: [
        {
          code: 'START20',
          kind: 'percent',
          value: 20,
          redeemed_at: '2026-10-02T03:01:00Z',
        },
      ],
      referral: {
        code: 'RMR-STUDENT',
        invited_by_username: null,
        invited_total: 3,
        rewarded_total: 2,
      },
    },
  } as never);

  renderPage();

  expect(await screen.findByRole('heading', { name: 'Ирина' })).toBeInTheDocument();
  expect(screen.getByText('Английские слова')).toBeInTheDocument();
  expect(screen.getByText('413')).toBeInTheDocument();
  expect(screen.getAllByText('Plus').length).toBeGreaterThan(0);
  expect(screen.getAllByText('START20').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Индивидуальная квота/).length).toBeGreaterThan(0);
  expect(screen.getByText('История персональных прав')).toBeInTheDocument();
  expect(screen.getAllByText('Тариф Plus v1').length).toBeGreaterThan(0);
  expect(screen.getByText('Управление аккаунтом')).toBeInTheDocument();
  expect(screen.getByText('После перехода на Free')).toBeInTheDocument();
  expect(screen.getByText(/Отключатся: ИИ-генерация/)).toBeInTheDocument();
  expect(screen.getByText('RMR-STUDENT')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/api/v1/admin/users/{user_id}', {
    params: { path: { user_id: '11111111-1111-4111-8111-111111111111' } },
  });
});
