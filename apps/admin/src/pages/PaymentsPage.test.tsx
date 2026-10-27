import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { PaymentsPage } from './PaymentsPage';

const payment = {
  id: '11111111-1111-4111-8111-111111111111',
  provider_payment_id: 'yk-test-payment',
  user_id: '22222222-2222-4222-8222-222222222222',
  username: 'student',
  email: 'student@example.com',
  plan_code: 'plus',
  plan_name: 'Plus',
  interval: 'month',
  status: 'succeeded',
  amount: 29_900,
  discount_amount: 0,
  currency: 'RUB',
  created_at: '2026-10-27T08:00:00Z',
  paid_at: '2026-10-27T08:01:00Z',
  refund: null,
  receipt_url: null,
  subscriptions: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      plan_code: 'plus',
      plan_name: 'Plus',
      status: 'active',
      interval: 'month',
      current_period_start: '2026-10-27T08:01:00Z',
      current_period_end: '2026-11-27T08:01:00Z',
      cancel_at_period_end: false,
      ended_at: null,
    },
  ],
  events: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      event: 'payment.succeeded',
      provider_payment_id: 'yk-test-payment',
      received_at: '2026-10-27T08:01:00Z',
      processed_at: '2026-10-27T08:01:01Z',
    },
  ],
  history: [],
} as const;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.restoreAllMocks());

test('открывает платёж и запрашивает возврат после подтверждения', async () => {
  vi.spyOn(api, 'GET').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/billing/payments') {
      return { data: { items: [payment], total: 1, offset: 0, limit: 25 } } as never;
    }
    return { data: payment } as never;
  });
  const post = vi.spyOn(api, 'POST').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/security/confirm') {
      return {
        data: { confirmation_token: 'confirmed', expires_at: '2026-10-27T09:00:00Z' },
      } as never;
    }
    return {
      data: {
        ...payment,
        refund: {
          provider_refund_id: 'yk-test-refund',
          status: 'pending',
          amount: 29_900,
          created_at: '2026-10-27T08:30:00Z',
        },
      },
    } as never;
  });
  const user = userEvent.setup();
  renderPage();

  await user.click(await screen.findByRole('button', { name: 'yk-test-payment' }));
  await user.click(await screen.findByRole('button', { name: 'Запросить полный возврат' }));
  await user.type(screen.getByLabelText('Причина изменения'), 'Возврат по обращению пользователя');
  await user.type(screen.getByLabelText('Пароль администратора или код 2FA'), 'Strong-password-1');
  await user.click(screen.getByRole('button', { name: 'Запросить возврат' }));

  expect(post).toHaveBeenCalledWith(
    '/api/v1/admin/billing/payments/{payment_id}/refund',
    expect.objectContaining({
      body: { reason: 'Возврат по обращению пользователя' },
    }),
  );
  expect(await screen.findByText('Запрос на полный возврат передан в ЮKassa.')).toBeInTheDocument();
});
