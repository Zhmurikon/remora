import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AdminActionConfirmation } from '../features/security/AdminActionConfirmation';
import { api, getErrorMessage } from '../lib/api';

type PaymentList = components['schemas']['AdminPaymentList'];
type PaymentDetail = components['schemas']['AdminPaymentDetail'];
type PaymentStatus = 'pending' | 'succeeded' | 'canceled' | 'refunded';
type PendingAction =
  | { type: 'refund' }
  | { type: 'cancel'; subscriptionId: string }
  | { type: 'retry'; eventId: string };

const PAGE_SIZE = 25;
const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function PaymentsPage() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const payments = useQuery({
    queryKey: ['admin', 'payments', query, status, offset],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/billing/payments', {
        params: {
          query: {
            query: query || undefined,
            status: status || undefined,
            offset,
            limit: PAGE_SIZE,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить платежи'));
      return data;
    },
    placeholderData: (previous) => previous,
  });

  const detail = useQuery({
    queryKey: ['admin', 'payments', selectedId],
    enabled: selectedId !== null,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/billing/payments/{payment_id}', {
        params: { path: { payment_id: selectedId! } },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить платёж'));
      return data;
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(input.trim());
  }

  async function runAction(confirmation: string, reason: string) {
    if (!pendingAction || !selectedId) return;
    const headers = {
      'X-Admin-Confirmation': confirmation,
      'Idempotency-Key': crypto.randomUUID(),
    };
    if (pendingAction.type === 'refund') {
      const { data, error } = await api.POST('/api/v1/admin/billing/payments/{payment_id}/refund', {
        params: { path: { payment_id: selectedId }, header: headers },
        body: { reason },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось запросить возврат'));
      queryClient.setQueryData(['admin', 'payments', selectedId], data);
      setMessage('Запрос на полный возврат передан в ЮKassa.');
    } else if (pendingAction.type === 'cancel') {
      const { data, error } = await api.POST(
        '/api/v1/admin/billing/subscriptions/{subscription_id}/cancel',
        {
          params: { path: { subscription_id: pendingAction.subscriptionId }, header: headers },
          body: { reason },
        },
      );
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось отменить продление'));
      await detail.refetch();
      setMessage('Продление подписки отменено. Доступ сохранён до конца периода.');
    } else {
      const { data, error } = await api.POST('/api/v1/admin/billing/events/{event_id}/retry', {
        params: { path: { event_id: pendingAction.eventId }, header: headers },
        body: { reason },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось повторить обработку'));
      queryClient.setQueryData(['admin', 'payments', selectedId], data);
      setMessage('Событие обработано повторно.');
    }
    setPendingAction(null);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
  }

  if (selectedId) {
    return (
      <PaymentDetailView
        payment={detail.data}
        loading={detail.isPending}
        error={detail.isError ? detail.error.message : null}
        message={message}
        pendingAction={pendingAction}
        onBack={() => {
          setSelectedId(null);
          setPendingAction(null);
          setMessage(null);
        }}
        onAction={setPendingAction}
        onCancelAction={() => setPendingAction(null)}
        onConfirmed={runAction}
      />
    );
  }

  return (
    <section aria-labelledby="payments-title">
      <h1 id="payments-title" className="text-3xl font-semibold tracking-tight">
        Платежи и подписки
      </h1>
      <p className="text-fg-muted mt-2">
        Состояния оплат, возвратов, подписок и входящих событий ЮKassa.
      </p>
      <form
        className="mt-7 grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end"
        onSubmit={submitSearch}
      >
        <Input
          label="Пользователь, UUID или идентификатор ЮKassa"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <label className="text-sm font-medium">
          Состояние платежа
          <select
            className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PaymentStatus | '');
              setOffset(0);
            }}
          >
            <option value="">Все</option>
            <option value="pending">Ожидает оплаты</option>
            <option value="succeeded">Оплачен</option>
            <option value="canceled">Отменён</option>
            <option value="refunded">Возвращён</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      {payments.isPending ? (
        <p className="text-fg-muted mt-7">Загружаем платежи…</p>
      ) : payments.isError ? (
        <p className="text-danger mt-7" role="alert">
          {payments.error.message}
        </p>
      ) : payments.data.items.length === 0 ? (
        <Card className="mt-7 p-8 text-center shadow-none">
          <h2 className="font-semibold">Платежей не найдено</h2>
          <p className="text-fg-muted mt-2 text-sm">Измените запрос или фильтр состояния.</p>
        </Card>
      ) : (
        <PaymentTable
          data={payments.data}
          offset={offset}
          onOffset={setOffset}
          onSelect={setSelectedId}
        />
      )}
    </section>
  );
}

function PaymentTable({
  data,
  offset,
  onOffset,
  onSelect,
}: {
  data: PaymentList;
  offset: number;
  onOffset: (value: number) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="border-border bg-surface mt-7 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-surface-muted text-fg-muted">
            <tr>
              <th className="px-4 py-3">Платёж</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Тариф</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Состояние</th>
              <th className="px-4 py-3">Создан</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((payment) => (
              <tr key={payment.id} className="border-border border-t">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    className="text-primary min-h-11 text-left font-mono text-xs font-medium hover:underline"
                    onClick={() => onSelect(payment.id)}
                  >
                    {payment.provider_payment_id || payment.id}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium">{payment.username}</p>
                  <p className="text-fg-subtle text-xs">{payment.email || 'Без почты'}</p>
                </td>
                <td className="px-4 py-3">{payment.plan_name}</td>
                <td className="px-4 py-3 font-mono tabular-nums">{formatMoney(payment.amount)}</td>
                <td className="px-4 py-3">{paymentStatusLabel(payment.status)}</td>
                <td className="px-4 py-3">{formatDate(payment.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onOffset(offset - PAGE_SIZE)}
        >
          Назад
        </Button>
        <span className="text-fg-muted text-sm">
          {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} из {data.total}
        </span>
        <Button
          variant="secondary"
          disabled={offset + PAGE_SIZE >= data.total}
          onClick={() => onOffset(offset + PAGE_SIZE)}
        >
          Далее
        </Button>
      </div>
    </>
  );
}

function PaymentDetailView({
  payment,
  loading,
  error,
  message,
  pendingAction,
  onBack,
  onAction,
  onCancelAction,
  onConfirmed,
}: {
  payment: PaymentDetail | undefined;
  loading: boolean;
  error: string | null;
  message: string | null;
  pendingAction: PendingAction | null;
  onBack: () => void;
  onAction: (action: PendingAction) => void;
  onCancelAction: () => void;
  onConfirmed: (confirmation: string, reason: string) => Promise<void>;
}) {
  if (loading) return <p className="text-fg-muted">Загружаем платёж…</p>;
  if (error || !payment)
    return (
      <div>
        <BackButton onClick={onBack} />
        <p className="text-danger mt-5" role="alert">
          {error || 'Платёж не найден'}
        </p>
      </div>
    );
  return (
    <section aria-labelledby="payment-title">
      <BackButton onClick={onBack} />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 id="payment-title" className="text-3xl font-semibold tracking-tight">
            Платёж {formatMoney(payment.amount)}
          </h1>
          <p className="text-fg-muted mt-2 break-all font-mono text-sm">
            {payment.provider_payment_id || payment.id}
          </p>
        </div>
        <span className="bg-primary-subtle text-primary w-fit rounded-md px-3 py-2 text-sm font-medium">
          {paymentStatusLabel(payment.status)}
        </span>
      </div>

      {message ? (
        <p className="text-success mt-5" role="status">
          {message}
        </p>
      ) : null}

      <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_0.8fr]">
        <div className="space-y-5">
          <Card className="p-5 shadow-none">
            <h2 className="text-xl font-semibold">Оплата</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Detail
                label="Пользователь"
                value={`${payment.username} · ${payment.email || 'без почты'}`}
              />
              <Detail
                label="Тариф"
                value={`${payment.plan_name} · ${intervalLabel(payment.interval)}`}
              />
              <Detail label="Сумма" value={formatMoney(payment.amount)} />
              <Detail label="Скидка" value={formatMoney(payment.discount_amount)} />
              <Detail label="Создан" value={formatDateTime(payment.created_at)} />
              <Detail
                label="Оплачен"
                value={payment.paid_at ? formatDateTime(payment.paid_at) : '—'}
              />
            </dl>
            {payment.receipt_url ? (
              <a
                className="text-primary mt-4 inline-flex min-h-11 items-center underline"
                href={payment.receipt_url}
                target="_blank"
                rel="noreferrer"
              >
                Открыть чек
              </a>
            ) : null}
            {payment.refund ? (
              <div className="bg-surface-muted mt-4 rounded-md p-4 text-sm">
                <p className="font-medium">Возврат: {refundStatusLabel(payment.refund.status)}</p>
                <p className="text-fg-muted mt-1">
                  {payment.refund.amount !== null
                    ? formatMoney(payment.refund.amount)
                    : 'Сумма уточняется'}
                  {payment.refund.created_at
                    ? ` · ${formatDateTime(payment.refund.created_at)}`
                    : ''}
                </p>
              </div>
            ) : null}
            {payment.status === 'succeeded' && !payment.refund ? (
              <Button
                className="mt-4"
                variant="danger"
                onClick={() => onAction({ type: 'refund' })}
              >
                Запросить полный возврат
              </Button>
            ) : null}
          </Card>

          <Card className="p-5 shadow-none">
            <h2 className="text-xl font-semibold">Подписки пользователя</h2>
            {payment.subscriptions.length === 0 ? (
              <p className="text-fg-muted mt-3 text-sm">Подписок нет.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {payment.subscriptions.map((subscription) => (
                  <li key={subscription.id} className="border-border rounded-md border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{subscription.plan_name}</p>
                        <p className="text-fg-muted mt-1 text-sm">
                          {subscriptionStatusLabel(subscription.status)} · до{' '}
                          {formatDate(subscription.current_period_end)}
                        </p>
                      </div>
                      {!subscription.cancel_at_period_end && subscription.status !== 'expired' ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            onAction({ type: 'cancel', subscriptionId: subscription.id })
                          }
                        >
                          Отменить продление
                        </Button>
                      ) : (
                        <span className="text-fg-subtle text-xs">Продление отключено</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-fg-subtle mt-4 text-xs">
              Будущие рекуррентные попытки будут показаны отдельно после запуска E9R.
            </p>
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-5 shadow-none">
            <h2 className="text-xl font-semibold">События ЮKassa</h2>
            {payment.events.length === 0 ? (
              <p className="text-fg-muted mt-3 text-sm">События ещё не поступали.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {payment.events.map((event) => (
                  <li
                    key={event.id}
                    className="border-border border-t pt-3 first:border-0 first:pt-0"
                  >
                    <p className="font-medium">{eventLabel(event.event)}</p>
                    <p className="text-fg-muted mt-1 text-sm">
                      {formatDateTime(event.received_at)} ·{' '}
                      {event.processed_at ? 'обработано' : 'ожидает обработки'}
                    </p>
                    <Button
                      className="mt-2"
                      variant="ghost"
                      onClick={() => onAction({ type: 'retry', eventId: event.id })}
                    >
                      Повторить обработку
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {payment.history.length ? (
            <Card className="p-5 shadow-none">
              <h2 className="text-xl font-semibold">История действий</h2>
              <ol className="mt-4 space-y-3 text-sm">
                {payment.history.map((item) => (
                  <li
                    key={item.id}
                    className="border-border border-t pt-3 first:border-0 first:pt-0"
                  >
                    <p className="font-medium">{auditLabel(item.action)}</p>
                    <p className="text-fg-muted mt-1">
                      {item.actor_username || 'Система'} · {formatDateTime(item.created_at)}
                      {item.reason ? ` · ${item.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </aside>
      </div>

      {pendingAction ? (
        <div className="mt-7">
          <AdminActionConfirmation
            title={actionTitle(pendingAction)}
            consequences={actionConsequences(pendingAction, payment)}
            submitLabel={actionSubmitLabel(pendingAction)}
            onCancel={onCancelAction}
            onConfirmed={onConfirmed}
          />
        </div>
      ) : null}
    </section>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="text-primary min-h-11 font-medium" onClick={onClick}>
      ← К платежам
    </button>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
function formatMoney(value: number) {
  return money.format(value / 100);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
function paymentStatusLabel(value: string) {
  return (
    (
      {
        pending: 'Ожидает оплаты',
        succeeded: 'Оплачен',
        canceled: 'Отменён',
        refunded: 'Возвращён',
      } as Record<string, string>
    )[value] ?? value
  );
}
function subscriptionStatusLabel(value: string) {
  return (
    (
      {
        active: 'Активна',
        canceled: 'Отменена',
        past_due: 'Есть задолженность',
        expired: 'Завершена',
      } as Record<string, string>
    )[value] ?? value
  );
}
function refundStatusLabel(value: string) {
  return (
    (
      { pending: 'обрабатывается', succeeded: 'выполнен', canceled: 'отменён' } as Record<
        string,
        string
      >
    )[value] ?? value
  );
}
function intervalLabel(value: string) {
  return value === 'year' ? 'год' : 'месяц';
}
function eventLabel(value: string) {
  return (
    (
      {
        'payment.succeeded': 'Оплата подтверждена',
        'payment.canceled': 'Оплата отменена',
        'refund.succeeded': 'Возврат подтверждён',
      } as Record<string, string>
    )[value] ?? value
  );
}
function auditLabel(value: string) {
  return (
    (
      {
        'admin.billing.refund_requested': 'Запрошен возврат',
        'admin.billing.subscription_canceled': 'Отменено продление подписки',
        'admin.billing.event_retried': 'Повторена обработка события',
      } as Record<string, string>
    )[value] ?? value
  );
}
function actionTitle(action: PendingAction) {
  return action.type === 'refund'
    ? 'Запросить полный возврат?'
    : action.type === 'cancel'
      ? 'Отменить продление подписки?'
      : 'Повторить обработку события?';
}
function actionSubmitLabel(action: PendingAction) {
  return action.type === 'refund'
    ? 'Запросить возврат'
    : action.type === 'cancel'
      ? 'Отменить продление'
      : 'Повторить обработку';
}
function actionConsequences(action: PendingAction, payment: PaymentDetail) {
  if (action.type === 'refund')
    return [
      `ЮKassa получит запрос на возврат ${formatMoney(payment.amount)}.`,
      'После подтверждения возврата платный период может завершиться.',
      'Материалы и учебный прогресс пользователя сохранятся.',
    ];
  if (action.type === 'cancel')
    return [
      'Новые списания по подписке не выполняются.',
      'Платные возможности сохранятся до конца оплаченного периода.',
      'Материалы и обучение останутся доступны после завершения периода.',
    ];
  return [
    'Состояние операции будет заново проверено в ЮKassa.',
    'Повтор не создаст вторую подписку или дублирующее начисление.',
    'Результат и причина попадут в административный аудит.',
  ];
}
