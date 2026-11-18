// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { BillingPage } from './BillingPage';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));
const plans = [
  {
    code: 'free',
    name: 'Free',
    price_month: null,
    price_year: null,
    features: {},
    limits: {
      'courses.total': 10,
      'sets.library_total': 20,
      'agent.writes_per_week': 500,
      'classes.max': 1,
      'ai.transcription_minutes_per_week': 0,
      'ai.generation_tokens_per_week': 0,
    },
  },
  {
    code: 'plus',
    name: 'Plus',
    price_month: 29900,
    price_year: 249900,
    features: {},
    limits: {
      'ai.transcription_minutes_per_week': 300,
      'ai.generation_tokens_per_week': 500000,
    },
  },
  {
    code: 'pro',
    name: 'Pro',
    price_month: 99900,
    price_year: 999900,
    features: {},
    limits: {
      'ai.transcription_minutes_per_week': 1500,
      'ai.generation_tokens_per_week': 2500000,
    },
  },
];
const emptyOverview = { subscription: null, payments: [], referral_code: 'RMR-TEST1234' };
function renderPage(route = '/billing') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
      >
        <BillingPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
function mockOverview(data: object) {
  vi.mocked(api.GET).mockImplementation(
    async (path) => ({ data: path === '/api/v1/billing/plans' ? plans : data }) as never,
  );
}
async function ready() {
  await screen.findByText('Сейчас у вас Free');
  const button = await screen.findByRole('button', { name: 'Выбрать Plus' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  return button;
}

describe('BillingPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    mockOverview(emptyOverview);
    vi.mocked(api.POST).mockResolvedValue({
      error: { message: 'Тестовая оплата недоступна' },
    } as never);
  });

  it('показывает годовые и месячные цены, бесплатное обучение и реферальный бонус', async () => {
    renderPage();
    await ready();
    expect(screen.getByText(/2.499.₽/)).toBeTruthy();
    expect(screen.getByText(/9.999.₽/)).toBeTruthy();
    expect(screen.getByText('Обучение без ограничений')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Условия оплаты и возврата' }).getAttribute('href'),
    ).toBe('http://localhost:3000/oplata-i-vozvrat');
    expect(screen.getByText(/Карточки и все режимы обучения без ограничений/)).toBeTruthy();
    expect(screen.getByText('RMR-TEST1234')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Месяц' }));
    expect(screen.getByText(/299.₽/)).toBeTruthy();
    expect(screen.getByText(/999.₽/)).toBeTruthy();
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('берёт числовые квоты из каталога сервера', async () => {
    vi.mocked(api.GET).mockImplementation(
      async (path) =>
        ({
          data:
            path === '/api/v1/billing/plans'
              ? plans.map((p) =>
                  p.code === 'plus'
                    ? { ...p, limits: { ...p.limits, 'ai.transcription_minutes_per_week': 450 } }
                    : p,
                )
              : emptyOverview,
        }) as never,
    );
    renderPage();
    await ready();
    expect(screen.getByText('450 минут расшифровки в неделю')).toBeTruthy();
    expect(screen.queryByText('300 минут расшифровки в неделю')).toBeNull();
  });

  it('сохраняет промокод после Escape, возвращает фокус и передаёт период в checkout', async () => {
    renderPage();
    const buy = await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Месяц' }));
    const toggle = screen.getByRole('button', { name: 'Есть промокод' });
    fireEvent.click(toggle);
    const input = screen.getByLabelText('Код');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: ' welcome ' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Код')).toBeNull();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Изменить промокод' }));
    expect((screen.getByLabelText('Код') as HTMLInputElement).value).toBe(' WELCOME ');
    fireEvent.click(buy);
    await screen.findByText(/Тестовая оплата недоступна/);
    expect(api.POST).toHaveBeenCalledWith('/api/v1/billing/checkout', {
      body: {
        plan_code: 'plus',
        interval: 'month',
        promo_code: 'WELCOME',
        request_key: expect.any(String),
      },
    });
  });

  it('не создаёт второй checkout при повторном нажатии и блокирует смену условий', async () => {
    let fail!: (value: never) => void;
    vi.mocked(api.POST).mockImplementation(
      () =>
        new Promise((resolve) => {
          fail = resolve;
        }),
    );
    renderPage();
    const buy = await ready();
    fireEvent.click(buy);
    fireEvent.click(buy);
    await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Выбрать Pro' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Месяц' }).hasAttribute('disabled')).toBe(true);
    fail({ error: { message: 'Сервис временно недоступен' } } as never);
    await screen.findByText(/Сервис временно недоступен/);
    await waitFor(() => expect(buy.hasAttribute('disabled')).toBe(false));
    fireEvent.click(buy);
    await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
    fail({ error: { message: 'Сервис временно недоступен' } } as never);
    await waitFor(() => expect(buy.hasAttribute('disabled')).toBe(false));
  });

  it('не выдаёт ошибку обзора за Free и восстанавливается после повтора', async () => {
    vi.mocked(api.GET).mockImplementation(
      async (path) =>
        (path === '/api/v1/billing/plans'
          ? { data: plans }
          : { error: { message: 'Нет соединения' } }) as never,
    );
    renderPage();
    await screen.findByText('Не удалось загрузить текущий тариф и платежи');
    expect(screen.queryByText('Сейчас у вас Free')).toBeNull();
    expect(screen.getByRole('button', { name: 'Выбрать Plus' }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: 'Скопировать ссылку' })).toBeNull();
    mockOverview(emptyOverview);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    await ready();
  });

  it('показывает ошибку каталога с повтором, не теряя текущую подписку', async () => {
    vi.mocked(api.GET).mockImplementation(
      async (path) =>
        (path === '/api/v1/billing/plans'
          ? { error: { message: 'Каталог недоступен' } }
          : { data: emptyOverview }) as never,
    );
    renderPage();
    await screen.findByText('Не удалось загрузить тарифы');
    expect(screen.getByText('Сейчас у вас Free')).toBeTruthy();
    mockOverview(emptyOverview);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    await ready();
  });

  it('сохраняет текущий Plus, дату периода и отсутствие автосписаний', async () => {
    mockOverview({
      ...emptyOverview,
      subscription: {
        plan_code: 'plus',
        plan_name: 'Plus',
        current_period_end: '2030-11-18T00:00:00Z',
        cancel_at_period_end: true,
      },
    });
    renderPage();
    await screen.findByText('Сейчас у вас Plus');
    expect(
      screen.getByText(/До 18 ноября 2030 г. · разовая оплата, автосписаний нет/),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ваш тариф' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Выбрать Plus' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Выбрать Pro' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('показывает четыре статуса, а возврат из ЮKassa не считает доказательством оплаты', async () => {
    mockOverview({
      ...emptyOverview,
      payments: ['pending', 'succeeded', 'canceled', 'refunded'].map((status, index) => ({
        id: String(index),
        plan_name: 'Plus',
        plan_code: 'plus',
        interval: 'year',
        amount: 249900,
        status,
        created_at: '2026-10-26T00:00:00Z',
      })),
    });
    renderPage('/billing?payment=return');
    await ready();
    const history = within(screen.getByRole('region', { name: 'История платежей' }));
    for (const status of ['Ожидает оплаты', 'Оплачен', 'Отменён', 'Возвращён'])
      expect(history.getByText(status)).toBeTruthy();
    expect(screen.getByText(/Подтверждение может прийти не сразу/)).toBeTruthy();
    expect(screen.getByText('Сейчас у вас Free')).toBeTruthy();
    expect(api.POST).not.toHaveBeenCalled();
    const previousRequests = vi.mocked(api.GET).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Обновить статус' }));
    await waitFor(() =>
      expect(vi.mocked(api.GET).mock.calls.length).toBeGreaterThan(previousRequests),
    );
  });

  it('копирует реферальную ссылку и сообщает об успехе', async () => {
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    await screen.findByRole('button', { name: 'Ссылка скопирована' });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/register?ref=RMR-TEST1234`,
    );
    expect(screen.queryByRole('region', { name: 'История платежей' })).toBeNull();
  });

  it('показывает ссылку для ручного копирования при отказе буфера обмена', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('Нет доступа'));
    renderPage();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать ссылку' }));
    const link = await screen.findByLabelText('Пригласительная ссылка');
    expect((link as HTMLInputElement).value).toBe(
      `${window.location.origin}/register?ref=RMR-TEST1234`,
    );
    expect(screen.getByRole('alert').textContent).toContain('скопируйте её вручную');
    expect(screen.queryByRole('button', { name: 'Ссылка скопирована' })).toBeNull();
  });
});
