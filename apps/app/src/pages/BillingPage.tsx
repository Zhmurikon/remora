import type { components } from '@remora/api-client';
import { Button, Input } from '@remora/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import cardsImage from '../../../web/public/lecture-demo/pricing-cards.webp';
import notebookImage from '../../../web/public/lecture-demo/pricing-notebook.webp';
import booksImage from '../../../web/public/lecture-demo/pricing-books.webp';
import { api } from '../lib/api';
import './billing.css';

type Plan = components['schemas']['PlanPublic'];
type Interval = 'month' | 'year';
type PaidPlan = 'plus' | 'pro';
const planOrder = ['free', 'plus', 'pro'];
const illustrations: Record<string, string> = {
  free: cardsImage,
  plus: notebookImage,
  pro: booksImage,
};
const captions: Record<string, string> = {
  free: 'Для своих учебных материалов',
  plus: 'Больше материалов и ИИ-инструменты',
  pro: 'Повышенные квоты ИИ',
};

export function BillingPage() {
  const [searchParams] = useSearchParams();
  const returnedFromPayment = searchParams.get('payment') === 'return';
  const [interval, setInterval] = useState<Interval>('year');
  const [promoCode, setPromoCode] = useState('');
  const checkoutStarted = useRef(false);
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
    // Возврат с платёжной страницы не доказывает оплату: ждём серверный статус.
    refetchInterval: (query) =>
      returnedFromPayment &&
      !query.state.error &&
      query.state.data?.payments.some((payment) => payment.status === 'pending')
        ? 5000
        : false,
  });
  const checkout = useMutation({
    mutationFn: async (planCode: PaidPlan) => {
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
    onError: () => {
      checkoutStarted.current = false;
    },
  });
  const orderedPlans = [...(plans.data ?? [])]
    .filter((plan) => planOrder.includes(plan.code))
    .sort((a, b) => planOrder.indexOf(a.code) - planOrder.indexOf(b.code));
  const subscription = overview.data?.subscription;
  const currentCode =
    overview.data && !overview.isError ? (subscription?.plan_code ?? 'free') : null;
  const checkoutBlocked =
    !overview.data || overview.isError || checkout.isPending || checkout.isSuccess;
  const freePlan = orderedPlans.find((plan) => plan.code === 'free');

  function startCheckout(planCode: PaidPlan) {
    if (checkoutStarted.current || checkoutBlocked || currentCode === planCode) return;
    checkoutStarted.current = true;
    checkout.mutate(planCode);
  }

  return (
    <div className="billing-page">
      <header className="billing-header">
        <h1>Тариф и подписка</h1>
        <p>
          Обучение и доступ к созданным материалам остаются свободными на любом тарифе. Оплата
          добавляет объём, ИИ-инструменты и преподавательскую аналитику.
        </p>
      </header>

      {returnedFromPayment && (
        <section className="billing-return" aria-label="Возврат со страницы оплаты">
          <p>
            Вы вернулись со страницы оплаты. Актуальный статус — в истории платежей. Подтверждение
            может прийти не сразу.
          </p>
          <Button
            variant="ghost"
            loading={overview.isFetching}
            onClick={() => void overview.refetch()}
          >
            Обновить статус
          </Button>
        </section>
      )}

      {overview.isError ? (
        <ErrorNotice
          title="Не удалось загрузить текущий тариф и платежи"
          message={overview.error.message}
          loading={overview.isFetching}
          onRetry={() => void overview.refetch()}
        />
      ) : overview.isPending ? (
        <div className="billing-current billing-skeleton" role="status">
          Загрузка текущего тарифа…
        </div>
      ) : (
        <section className="billing-current" aria-label="Текущий тариф">
          <div>
            <p className="billing-current-title">
              Сейчас у вас {subscription?.plan_name ?? 'Free'}
              <span className="billing-badge">Текущий тариф</span>
            </p>
            <p className="billing-current-detail">
              {subscription
                ? `До ${formatDate(subscription.current_period_end)} · разовая оплата, автосписаний нет`
                : freePlan
                  ? freeDescription(freePlan)
                  : 'Ваши материалы и обучение остаются доступны.'}
            </p>
          </div>
          <p className="billing-guarantee">
            <BillingIcon name="check" />
            Обучение без ограничений
          </p>
        </section>
      )}

      <div className="billing-tools">
        <div className="billing-period-group">
          <div
            className="billing-period"
            data-period={interval}
            role="group"
            aria-label="Период оплаты"
          >
            {(['month', 'year'] as const).map((term) => (
              <button
                key={term}
                type="button"
                aria-pressed={interval === term}
                disabled={checkout.isPending || checkout.isSuccess}
                onClick={() => {
                  setInterval(term);
                  checkout.reset();
                }}
              >
                {term === 'month' ? 'Месяц' : 'Год'}
              </button>
            ))}
          </div>
          <p>Разовая оплата · без автосписаний</p>
        </div>
        <PromoCode
          value={promoCode}
          disabled={checkout.isPending || checkout.isSuccess}
          onChange={(value) => {
            setPromoCode(value);
            checkout.reset();
          }}
        />
      </div>

      {checkout.error && (
        <div className="billing-error" role="alert">
          <p>Не удалось перейти к оплате. {checkout.error.message}</p>
          <p className="billing-error-hint">
            Проверьте промокод или попробуйте выбрать тариф ещё раз.
          </p>
        </div>
      )}

      {plans.isPending ? (
        <div className="billing-plans" aria-label="Загрузка тарифов" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="billing-plan billing-skeleton" />
          ))}
        </div>
      ) : plans.isError ? (
        <ErrorNotice
          title="Не удалось загрузить тарифы"
          message={plans.error.message}
          loading={plans.isFetching}
          onRetry={() => void plans.refetch()}
        />
      ) : !orderedPlans.length ? (
        <ErrorNotice
          title="Тарифы пока недоступны"
          message="Попробуйте загрузить каталог ещё раз."
          loading={plans.isFetching}
          onRetry={() => void plans.refetch()}
        />
      ) : (
        <section className="billing-plans" aria-label="Тарифы «Запоминальни»">
          {orderedPlans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              interval={interval}
              current={currentCode === plan.code}
              blocked={checkoutBlocked}
              loading={checkout.isPending && checkout.variables === plan.code}
              onCheckout={() => {
                if (plan.code === 'plus' || plan.code === 'pro') startCheckout(plan.code);
              }}
            />
          ))}
        </section>
      )}
      <p className="billing-payment-note">
        {promoCode.trim()
          ? `Промокод «${promoCode.trim()}» будет проверен при переходе к оплате. `
          : 'Промокод учитывается при переходе к оплате. '}
        Скидка или дополнительные дни — по условиям кода.
      </p>

      {overview.data && !overview.isError && (
        <div
          className={`billing-bottom ${overview.data.payments.length ? '' : 'billing-bottom-empty'}`}
        >
          <PaymentHistory payments={overview.data.payments} />
          <Referral key={overview.data.referral_code} code={overview.data.referral_code} />
        </div>
      )}
    </div>
  );
}

function PromoCode({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    function dismiss(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  return (
    <div
      className="billing-promo"
      ref={wrapper}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="billing-promo-toggle"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        {value.trim() ? 'Изменить промокод' : 'Есть промокод'}
        <BillingIcon name="chevron" />
      </button>
      {open && (
        <div className="billing-promo-panel" id={id}>
          <Input
            ref={input}
            label="Код"
            value={value}
            maxLength={48}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            hint="Код будет проверен при переходе к оплате."
          />
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  current,
  blocked,
  loading,
  onCheckout,
}: {
  plan: Plan;
  interval: Interval;
  current: boolean;
  blocked: boolean;
  loading: boolean;
  onCheckout: () => void;
}) {
  const price = interval === 'month' ? plan.price_month : plan.price_year;
  const isFree = plan.code === 'free';
  const priceRef = useRef<HTMLSpanElement>(null);
  const lastPrice = useRef(price);
  useEffect(() => {
    if (lastPrice.current === price) return;
    lastPrice.current = price;
    const element = priceRef.current;
    if (!element?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = element.animate(
      [
        { opacity: 0.35, transform: 'translateY(3px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 150, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
    return () => animation.cancel();
  }, [price]);
  return (
    <article className={`billing-plan billing-plan-${plan.code}`}>
      <div className="billing-plan-top">
        <h2>{plan.name}</h2>
        <img src={illustrations[plan.code]} alt="" width="67" height="54" />
      </div>
      <p className="billing-price">
        <span ref={priceRef}>
          {isFree ? 'Бесплатно' : price == null ? 'Недоступен' : formatMoney(price)}
        </span>
        {!isFree && price != null && <small>/{interval === 'month' ? 'мес.' : 'год'}</small>}
      </p>
      <p className="billing-caption">{captions[plan.code]}</p>
      <ul>
        {included(plan).map((item) => (
          <li key={item}>
            <BillingIcon name="check" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="billing-plan-action">
        {isFree ? (
          <>
            <Button className="billing-buy" fullWidth variant="secondary" disabled>
              {current ? 'Ваш тариф' : 'Бесплатный тариф'}
            </Button>
            <p className="sr-only">Карточки и все режимы обучения без ограничений.</p>
          </>
        ) : (
          <Button
            className="billing-buy"
            fullWidth
            variant={plan.code === 'plus' ? 'primary' : 'secondary'}
            disabled={current || blocked || price == null || price <= 0}
            loading={loading}
            onClick={onCheckout}
          >
            {current ? 'Ваш тариф' : `Выбрать ${plan.name}`}
          </Button>
        )}
      </div>
    </article>
  );
}

function Referral({ code }: { code: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  const link = `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
  async function copy() {
    setState('copying');
    try {
      await navigator.clipboard.writeText(link);
      setState('copied');
    } catch {
      setState('failed');
    }
  }
  return (
    <section className="billing-referral" aria-labelledby="billing-referral-title">
      <h2 id="billing-referral-title">Пригласите друга</h2>
      <p>После его первой оплаты вы оба получите 30 дней Plus.</p>
      <div className="billing-referral-code">
        <span>{code}</span>
        <button type="button" disabled={state === 'copying' || !code} onClick={() => void copy()}>
          <BillingIcon name="copy" />
          {state === 'copied' ? 'Ссылка скопирована' : 'Скопировать ссылку'}
        </button>
      </div>
      <p className="sr-only" role="status">
        {state === 'copied' ? 'Пригласительная ссылка скопирована' : ''}
      </p>
      {state === 'failed' && (
        <div className="billing-copy-fallback">
          <p role="alert">Не удалось скопировать ссылку. Выделите и скопируйте её вручную.</p>
          <Input
            label="Пригласительная ссылка"
            readOnly
            value={link}
            onFocus={(event) => event.target.select()}
          />
        </div>
      )}
    </section>
  );
}

function PaymentHistory({ payments }: { payments: components['schemas']['PaymentPublic'][] }) {
  if (!payments.length) return null;
  return (
    <section className="billing-history" aria-labelledby="billing-history-title">
      <h2 id="billing-history-title">История платежей</h2>
      <table>
        <caption className="sr-only">Тариф, дата, статус и сумма каждого платежа</caption>
        <thead>
          <tr>
            <th scope="col">Тариф и период</th>
            <th scope="col">Дата</th>
            <th scope="col">Статус</th>
            <th scope="col">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>
                {payment.plan_name} · {payment.interval === 'year' ? 'год' : 'месяц'}
              </td>
              <td>
                <time dateTime={payment.created_at} title={formatDate(payment.created_at)}>
                  {new Date(payment.created_at).toLocaleDateString('ru-RU')}
                </time>
              </td>
              <td>
                <span className={`billing-payment-status billing-payment-${payment.status}`}>
                  <BillingIcon
                    name={
                      payment.status === 'succeeded'
                        ? 'check'
                        : payment.status === 'pending'
                          ? 'clock'
                          : payment.status === 'refunded'
                            ? 'return'
                            : 'close'
                    }
                  />
                  {statusLabel(payment.status)}
                </span>
              </td>
              <td className="billing-amount">{formatMoney(payment.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ErrorNotice({
  title,
  message,
  loading,
  onRetry,
}: {
  title: string;
  message: string;
  loading: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="billing-error" role="alert">
      <p>{title}</p>
      <p className="billing-error-hint">{message}</p>
      <Button variant="ghost" loading={loading} onClick={onRetry}>
        Повторить загрузку
      </Button>
    </div>
  );
}

const iconPaths = {
  check: 'm5 12 4 4L19 6',
  chevron: 'm6 9 6 6 6-6',
  copy: 'M9 8h11v13H9ZM5 16H3V3h11v2',
  close: 'm7 7 10 10M17 7 7 17',
  return: 'm8 5-5 5 5 5M3 10h11a5 5 0 0 1 0 10',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
};
function BillingIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg className="billing-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={iconPaths[name]}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function amount(value: number | null | undefined) {
  return value == null ? 'без лимита' : new Intl.NumberFormat('ru-RU').format(value);
}
function freeDescription(plan: Plan) {
  return `${amount(plan.limits['courses.total'])} курсов, ${amount(plan.limits['sets.library_total'])} наборов и ${amount(plan.limits['agent.writes_per_week'])} записей через MCP в неделю.`;
}
function included(plan: Plan): string[] {
  const transcription = `${amount(plan.limits['ai.transcription_minutes_per_week'])} минут расшифровки в неделю`;
  const generation = `${amount(plan.limits['ai.generation_tokens_per_week'])} токенов генерации в неделю`;
  if (plan.code === 'free')
    return [
      `${amount(plan.limits['courses.total'])} курсов и ${amount(plan.limits['sets.library_total'])} наборов`,
      `${amount(plan.limits['agent.writes_per_week'])} записей через MCP в неделю`,
      `${amount(plan.limits['classes.max'])} класс и базовые отчёты`,
      'Без ИИ-инструментов',
    ];
  if (plan.code === 'pro') return ['Всё из Plus', transcription, generation];
  return [
    'Курсы, наборы и MCP без лимита',
    'Закрытые курсы, наборы и конспекты',
    transcription,
    generation,
    'Полные отчёты и XLSX',
  ];
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
        pending: 'Ожидает оплаты',
        succeeded: 'Оплачен',
        canceled: 'Отменён',
        refunded: 'Возвращён',
      } as Record<string, string>
    )[status] ?? status
  );
}
function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Не удалось выполнить операцию';
}
