import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, vi } from 'vitest';
import { api } from '../lib/api';
import { PromotionsPage } from './PromotionsPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PromotionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('показывает промокоды и подозрительные реферальные начисления', async () => {
  const user = userEvent.setup();
  vi.spyOn(api, 'GET').mockImplementation(async (path) => {
    if (path === '/api/v1/admin/promotions/promo-codes') {
      return {
        data: {
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              code: 'AUTUMN15',
              kind: 'percent',
              value: 15,
              max_redemptions: 100,
              redemptions: 24,
              starts_at: '2026-10-01T00:00:00Z',
              ends_at: '2026-11-01T00:00:00Z',
              active: true,
              state: 'active',
              created_at: '2026-10-01T00:00:00Z',
            },
          ],
          total: 1,
          offset: 0,
          limit: 25,
        },
      } as never;
    }
    return {
      data: {
        items: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            code: 'RMR-TESTCODE',
            inviter_id: '33333333-3333-4333-8333-333333333333',
            inviter_username: 'author',
            inviter_email: 'author@example.com',
            invited_user_id: '44444444-4444-4444-8444-444444444444',
            invited_username: 'student',
            invited_email: 'student@example.com',
            status: 'rewarded',
            reward_days: 30,
            rewarded_at: '2026-10-27T10:05:00Z',
            revoked_at: null,
            invited_subscription_id: '55555555-5555-4555-8555-555555555555',
            inviter_subscription_id: '66666666-6666-4666-8666-666666666666',
            risk_signals: ['Пять или больше регистраций в цепочке'],
            created_at: '2026-10-27T10:00:00Z',
          },
        ],
        total: 1,
        offset: 0,
        limit: 25,
      },
    } as never;
  });

  renderPage();

  expect(await screen.findByText('AUTUMN15')).toBeInTheDocument();
  expect(screen.getByText('24 / 100')).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Реферальные начисления' }));

  expect(await screen.findByText('RMR-TESTCODE')).toBeInTheDocument();
  expect(screen.getByText('Пять или больше регистраций в цепочке')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Компенсировать' }));
  expect(screen.getByRole('heading', { name: 'Компенсировать начисление' })).toBeInTheDocument();
  expect(screen.getByText('Обе связанные бонусные подписки завершатся.')).toBeInTheDocument();
});
