// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { BillingPage } from './BillingPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn() },
}));

const plans = [
  { code: 'free', name: 'Free', price_month: null, price_year: null, features: {}, limits: {} },
  { code: 'plus', name: 'Plus', price_month: 29900, price_year: 249900, features: {}, limits: {} },
  { code: 'pro', name: 'Pro', price_month: 99900, price_year: 999900, features: {}, limits: {} },
];

function renderPage() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BillingPage />
    </QueryClientProvider>,
  );
}

describe('BillingPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.GET).mockImplementation(async (path) => {
      if (path === '/api/v1/billing/plans') return { data: plans } as never;
      return { data: { subscription: null, payments: [], referral_code: 'RMR-TEST1234' } } as never;
    });
    vi.mocked(api.POST).mockResolvedValue({
      error: { message: 'Тестовая оплата недоступна' },
    } as never);
  });

  it('показывает цены, бесплатные гарантии и реферальный бонус', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Тариф и подписка' })).toBeTruthy();
    expect(await screen.findByText(/2.499.₽/)).toBeTruthy();
    expect(screen.getByText(/9.999.₽/)).toBeTruthy();
    expect(screen.getByText(/Карточки и все режимы обучения без ограничений/)).toBeTruthy();
    expect(screen.getByText('RMR-TEST1234')).toBeTruthy();
  });

  it('передаёт выбранный период и промокод в оплату', async () => {
    renderPage();
    await screen.findByRole('button', { name: 'Выбрать Plus' });
    fireEvent.click(screen.getByRole('button', { name: 'Месяц' }));
    fireEvent.change(screen.getByLabelText('Код'), { target: { value: 'welcome' } });
    fireEvent.click(screen.getByRole('button', { name: 'Выбрать Plus' }));
    await waitFor(() => expect(api.POST).toHaveBeenCalled());
    expect(api.POST).toHaveBeenCalledWith(
      '/api/v1/billing/checkout',
      expect.objectContaining({
        body: expect.objectContaining({
          plan_code: 'plus',
          interval: 'month',
          promo_code: 'WELCOME',
        }),
      }),
    );
    expect(await screen.findByText('Тестовая оплата недоступна')).toBeTruthy();
  });
});
