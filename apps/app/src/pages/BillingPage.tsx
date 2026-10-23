import type { components } from '@remora/api-client';
import { Button, Input } from '@remora/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../lib/api';

type Plan = components['schemas']['PlanPublic'];
type Interval = 'month' | 'year';

const included: Record<string, string[]> = {
  free: ['10 курсов и 20 наборов', '500 записей через MCP в неделю', '1 класс и базовые отчёты'],
  plus: [
    'Курсы, наборы и MCP без лимита',
    '300 минут расшифровки в неделю',
    'Полные отчёты и XLSX',
  ],
  pro: ['Всё из Plus', '1 500 минут расшифровки в неделю', '2,5 млн токенов генерации в неделю'],
};

export function BillingPage() {
  const [interval, setInterval] = useState<Interval>('year');
  const [promoCode, setPromoCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const plans = useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/billing/plans');
      if (error || !data) throw new Error(errorMessage(error));
      return data;
    },
  });
  const overview = useQuery({
    queryKey: ['billing-overview'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/billing/overview');
      if (error || !data) throw new Error(errorMessage(error));
      return data;
    },
  });
  const checkout = useMutation({
    mutationFn: async (planCode: 'plus' | 'pro') => {
      const { data, error } = await api.POST('/api/v1/billing/checkout', {
        body: {
          plan_code: planCode,
          interval,
          request_key: crypto.randomUUID(),
          promo_code: promoCode.trim() || null,
        },
      });
      if (error || !data) throw new Error(errorMessage(error));
      return data;
    },
    onSuccess: (payment) => window.location.assign(payment.confirmation_url),
    onError: (error) => setMessage(error.message),
  });

  const orderedPlans = useMemo(
    () =>
      [...(plans.data ?? [])].sort(
        (a, b) => ['free', 'plus', 'pro'].indexOf(a.code) - ['free', 'plus', 'pro'].indexOf(b.code),
      ),
    [plans.data],
  );
  const currentCode = overview.data?.subscription?.plan_code ?? 'free';

  return (
    <div className="pb-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Тариф и подписка</h1>
        <p className="text-fg-muted mt-3 max-w-2xl leading-relaxed">
          Обучение и доступ к созданным материалам остаются свободными на любом тарифе. Оплата
          добавляет объём, ИИ-инструменты и преподавательскую аналитику.
        </p>
      </header>

      {overview.data?.subscription && (
        <section className="border-border bg-primary-subtle mt-8 rounded-2xl border p-5">
          <div>
            <p className="text-sm font-medium">
              Сейчас у вас {overview.data.subscription.plan_name}
            </p>
            <p className="text-fg-muted mt-1 text-sm">
              До {formatDate(overview.data.subscription.current_period_end)}
              {' · разовая оплата, автосписаний нет'}
            </p>
          </div>
        </section>
      )}

      <div
        className="border-border bg-surface mt-8 flex min-h-11 w-fit rounded-xl border p-1"
        aria-label="Период оплаты"
      >
        <PeriodButton active={interval === 'month'} onClick={() => setInterval('month')}>
          Месяц
        </PeriodButton>
        <PeriodButton active={interval === 'year'} onClick={() => setInterval('year')}>
          Год
        </PeriodButton>
      </div>

      {plans.isPending ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-3" aria-label="Загрузка тарифов">
          {[0, 1, 2].map((item) => (
            <div key={item} className="bg-surface-muted h-80 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : plans.error ? (
        <p className="bg-danger-subtle text-danger mt-8 rounded-xl p-4" role="alert">
          {plans.error.message}
        </p>
      ) : (
        <section
          className="border-border bg-surface mt-8 grid overflow-hidden rounded-2xl border lg:grid-cols-3"
          aria-label="Тарифы Remora"
        >
          {orderedPlans.map((plan, index) => (
            <PlanColumn
              key={plan.code}
              plan={plan}
              interval={interval}
              current={currentCode === plan.code}
              separated={index > 0}
              loading={checkout.isPending && checkout.variables === plan.code}
              onCheckout={() => checkout.mutate(plan.code as 'plus' | 'pro')}
            />
          ))}
        </section>
      )}

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
        <div className="border-border rounded-2xl border p-6">
          <h2 className="text-xl font-semibold">Промокод</h2>
          <p className="text-fg-muted mt-2 text-sm">
            Скидка или дополнительные дни применятся после успешной оплаты.
          </p>
          <div className="mt-5 max-w-sm">
            <Input
              label="Код"
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
            />
          </div>
          {message && (
            <p className="text-fg-muted mt-4 text-sm" role="status">
              {message}
            </p>
          )}
        </div>
        <Referral code={overview.data?.referral_code} />
      </section>

      <PaymentHistory payments={overview.data?.payments ?? []} />
    </div>
  );
}

function PeriodButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-lg px-4 text-sm font-medium transition-colors ${active ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:text-fg'}`}
    >
      {children}
    </button>
  );
}

function PlanColumn({
  plan,
  interval,
  current,
  separated,
  loading,
  onCheckout,
}: {
  plan: Plan;
  interval: Interval;
  current: boolean;
  separated: boolean;
  loading: boolean;
  onCheckout: () => void;
}) {
  const price = interval === 'month' ? plan.price_month : plan.price_year;
  return (
    <article
      className={`flex min-h-[360px] flex-col p-6 sm:p-7 ${separated ? 'border-border border-t lg:border-l lg:border-t-0' : ''} ${plan.code === 'plus' ? 'bg-primary-subtle/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-semibold">{plan.name}</h2>
        {current && (
          <span className="bg-primary-subtle text-primary rounded-full px-3 py-1 text-xs font-medium">
            Текущий
          </span>
        )}
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">
          {price ? formatMoney(price) : 'Бесплатно'}
        </span>
        {price && (
          <span className="text-fg-muted text-sm">/{interval === 'month' ? 'мес.' : 'год'}</span>
        )}
      </p>
      <ul className="mt-7 space-y-3 text-sm leading-relaxed">
        {(included[plan.code] ?? []).map((item) => (
          <li key={item} className="flex gap-3">
            <CheckIcon />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        {plan.code === 'free' ? (
          <p className="text-fg-muted text-sm">Карточки и все режимы обучения без ограничений.</p>
        ) : (
          <Button
            fullWidth
            variant={plan.code === 'plus' ? 'primary' : 'secondary'}
            loading={loading}
            disabled={current}
            onClick={onCheckout}
          >
            {current ? 'Ваш тариф' : `Выбрать ${plan.name}`}
          </Button>
        )}
      </div>
    </article>
  );
}

function CheckIcon() {
  return (
    <svg
      className="text-primary mt-0.5 h-5 w-5 shrink-0"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m4 10 3.5 3.5L16 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Referral({ code }: { code?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="border-border rounded-2xl border p-6">
      <h2 className="text-xl font-semibold">Пригласите друга</h2>
      <p className="text-fg-muted mt-2 text-sm leading-relaxed">
        После его первой оплаты вы оба получите 30 дней Plus.
      </p>
      <div className="bg-surface-muted mt-5 flex min-h-11 items-center justify-between gap-3 rounded-xl px-4">
        <span className="font-medium tracking-wide">{code ?? 'Загрузка…'}</span>
        <button
          type="button"
          className="text-primary min-h-11 px-2 text-sm font-medium"
          disabled={!code}
          onClick={() => {
            if (!code) return;
            const link = `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
            void navigator.clipboard.writeText(link).then(() => setCopied(true));
          }}
        >
          {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </button>
      </div>
    </div>
  );
}

function PaymentHistory({ payments }: { payments: components['schemas']['PaymentPublic'][] }) {
  if (!payments.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold">История платежей</h2>
      <div className="border-border mt-4 overflow-hidden rounded-2xl border">
        {payments.map((payment) => (
          <div
            key={payment.id}
            className="border-border flex flex-col gap-2 border-b px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="font-medium">
                {payment.plan_name} · {payment.interval === 'year' ? 'год' : 'месяц'}
              </p>
              <p className="text-fg-muted mt-1 text-sm">
                {formatDate(payment.created_at)} · {statusLabel(payment.status)}
              </p>
            </div>
            <p className="font-semibold tabular-nums">{formatMoney(payment.amount)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatMoney(kopecks: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function statusLabel(status: string) {
  return (
    (
      {
        pending: 'ожидает оплаты',
        succeeded: 'оплачен',
        canceled: 'отменён',
        refunded: 'возвращён',
      } as Record<string, string>
    )[status] ?? status
  );
}
function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Не удалось выполнить операцию';
}
