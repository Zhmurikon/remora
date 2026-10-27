import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AdminActionConfirmation } from '../features/security/AdminActionConfirmation';
import { api, getErrorMessage } from '../lib/api';

type Promo = components['schemas']['AdminPromoCodeItem'];
type Referral = components['schemas']['AdminReferralItem'];
type Section = 'promo' | 'referrals';
type PendingAction =
  | {
      type: 'create';
      draft: {
        code: string;
        kind: 'percent' | 'free_days';
        value: number;
        maxRedemptions: number | null;
        startsAt: string;
        endsAt: string | null;
      };
    }
  | { type: 'disable'; promo: Promo }
  | { type: 'revoke'; referral: Referral };

const PAGE_SIZE = 25;

export function PromotionsPage() {
  const client = useQueryClient();
  const [section, setSection] = useState<Section>('promo');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const promoCodes = useQuery({
    queryKey: ['admin', 'promo-codes', query, filter, offset],
    enabled: section === 'promo',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/promotions/promo-codes', {
        params: {
          query: {
            query: query || undefined,
            state: (filter || undefined) as
              'scheduled' | 'active' | 'expired' | 'disabled' | 'exhausted' | undefined,
            offset,
            limit: PAGE_SIZE,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить промокоды'));
      return data;
    },
    placeholderData: (previous) => previous,
  });

  const referrals = useQuery({
    queryKey: ['admin', 'referrals', query, filter, offset],
    enabled: section === 'referrals',
    queryFn: async () => {
      const suspicious = filter === 'suspicious' ? true : undefined;
      const status = filter && filter !== 'suspicious' ? filter : undefined;
      const { data, error } = await api.GET('/api/v1/admin/promotions/referrals', {
        params: {
          query: {
            query: query || undefined,
            status: status as 'registered' | 'rewarded' | 'rejected' | undefined,
            suspicious,
            offset,
            limit: PAGE_SIZE,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить рефералов'));
      return data;
    },
    placeholderData: (previous) => previous,
  });

  function changeSection(value: Section) {
    setSection(value);
    setFilter('');
    setOffset(0);
    setPending(null);
    setMessage(null);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(queryInput.trim());
  }

  async function confirmAction(confirmation: string, reason: string) {
    if (!pending) return;
    const header = {
      'X-Admin-Confirmation': confirmation,
      'Idempotency-Key': crypto.randomUUID(),
    };
    if (pending.type === 'create') {
      const { draft } = pending;
      const { data, error } = await api.POST('/api/v1/admin/promotions/promo-codes', {
        params: { header },
        body: {
          code: draft.code,
          kind: draft.kind,
          value: draft.value,
          max_redemptions: draft.maxRedemptions,
          starts_at: new Date(draft.startsAt).toISOString(),
          ends_at: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
          reason,
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось создать промокод'));
      setMessage(`Промокод ${data.code} создан.`);
      setShowCreate(false);
    } else if (pending.type === 'disable') {
      const { data, error } = await api.POST(
        '/api/v1/admin/promotions/promo-codes/{promo_id}/disable',
        { params: { path: { promo_id: pending.promo.id }, header }, body: { reason } },
      );
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось отключить промокод'));
      setMessage(`Промокод ${data.code} отключён.`);
    } else {
      const { data, error } = await api.POST(
        '/api/v1/admin/promotions/referrals/{referral_id}/revoke',
        { params: { path: { referral_id: pending.referral.id }, header }, body: { reason } },
      );
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось отменить начисление'));
      setMessage('Реферальное начисление компенсировано.');
    }
    setPending(null);
    await client.invalidateQueries({ queryKey: ['admin', 'promo-codes'] });
    await client.invalidateQueries({ queryKey: ['admin', 'referrals'] });
  }

  const data = section === 'promo' ? promoCodes.data : referrals.data;
  const loading = section === 'promo' ? promoCodes.isPending : referrals.isPending;
  const error = section === 'promo' ? promoCodes.error : referrals.error;

  return (
    <section aria-labelledby="promotions-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 id="promotions-title" className="text-3xl font-semibold tracking-tight">
            Промокоды и рефералы
          </h1>
          <p className="text-fg-muted mt-2">
            Сроки, ограничения, начисления и сигналы подозрительных цепочек.
          </p>
        </div>
        {section === 'promo' && (
          <Button onClick={() => setShowCreate((value) => !value)}>Создать промокод</Button>
        )}
      </div>

      <div className="mt-6 flex gap-2" role="tablist" aria-label="Раздел начислений">
        <Button
          variant={section === 'promo' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={section === 'promo'}
          onClick={() => changeSection('promo')}
        >
          Промокоды
        </Button>
        <Button
          variant={section === 'referrals' ? 'primary' : 'secondary'}
          role="tab"
          aria-selected={section === 'referrals'}
          onClick={() => changeSection('referrals')}
        >
          Реферальные начисления
        </Button>
      </div>

      {showCreate && section === 'promo' && (
        <PromoCreateForm onSubmit={(draft) => setPending({ type: 'create', draft })} />
      )}

      <form
        className="mt-6 grid gap-3 md:grid-cols-[1fr_240px_auto] md:items-end"
        onSubmit={submitSearch}
      >
        <Input
          label={section === 'promo' ? 'Код промокода' : 'Код, пользователь, почта или UUID'}
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
        />
        <label className="text-sm font-medium">
          Фильтр
          <select
            className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setOffset(0);
            }}
          >
            <option value="">Все</option>
            {section === 'promo' ? (
              <>
                <option value="active">Действуют</option>
                <option value="scheduled">Запланированы</option>
                <option value="exhausted">Лимит исчерпан</option>
                <option value="expired">Срок завершён</option>
                <option value="disabled">Отключены</option>
              </>
            ) : (
              <>
                <option value="registered">Ожидают оплаты</option>
                <option value="rewarded">Начислены</option>
                <option value="rejected">Отклонены</option>
                <option value="suspicious">Только с сигналами риска</option>
              </>
            )}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      {message && (
        <p className="bg-success-subtle mt-5 rounded-md p-3 text-sm" role="status">
          {message}
        </p>
      )}
      {pending && (
        <div className="mt-5">
          <AdminActionConfirmation
            title={actionTitle(pending)}
            consequences={actionConsequences(pending)}
            submitLabel={
              pending.type === 'create'
                ? 'Создать'
                : pending.type === 'disable'
                  ? 'Отключить'
                  : 'Компенсировать'
            }
            onConfirmed={confirmAction}
            onCancel={() => setPending(null)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-fg-muted mt-7">Загружаем данные…</p>
      ) : error ? (
        <p className="text-danger mt-7" role="alert">
          {error.message}
        </p>
      ) : !data || data.items.length === 0 ? (
        <Card className="mt-7 p-8 text-center shadow-none">
          <h2 className="font-semibold">Ничего не найдено</h2>
          <p className="text-fg-muted mt-2 text-sm">Измените запрос или выбранный фильтр.</p>
        </Card>
      ) : section === 'promo' ? (
        <PromoTable
          items={promoCodes.data!.items}
          onDisable={(promo) => setPending({ type: 'disable', promo })}
        />
      ) : (
        <ReferralTable
          items={referrals.data!.items}
          onRevoke={(referral) => setPending({ type: 'revoke', referral })}
        />
      )}

      {data && data.total > 0 && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={offset === 0}
            onClick={() => setOffset(offset - PAGE_SIZE)}
          >
            Назад
          </Button>
          <span className="text-fg-muted text-sm">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} из {data.total}
          </span>
          <Button
            variant="secondary"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Далее
          </Button>
        </div>
      )}
    </section>
  );
}

function PromoCreateForm({
  onSubmit,
}: {
  onSubmit: (draft: Extract<PendingAction, { type: 'create' }>['draft']) => void;
}) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'free_days'>('percent');
  const [value, setValue] = useState('10');
  const [maximum, setMaximum] = useState('');
  const [startsAt, setStartsAt] = useState(now.toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState('');
  return (
    <Card className="mt-5 p-5 shadow-none">
      <h2 className="text-xl font-semibold">Новый промокод</h2>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            code: code.trim().toUpperCase(),
            kind,
            value: Number(value),
            maxRedemptions: maximum ? Number(maximum) : null,
            startsAt,
            endsAt: endsAt || null,
          });
        }}
      >
        <Input
          label="Код"
          required
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,47}"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <label className="text-sm font-medium">
          Тип
          <select
            className="border-border bg-surface mt-1 min-h-11 w-full rounded-md border px-3"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="percent">Скидка, %</option>
            <option value="free_days">Бонусные дни</option>
          </select>
        </label>
        <Input
          label={kind === 'percent' ? 'Процент' : 'Дни'}
          required
          type="number"
          min={1}
          max={kind === 'percent' ? 99 : 3650}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Input
          label="Лимит активаций"
          type="number"
          min={1}
          value={maximum}
          onChange={(event) => setMaximum(event.target.value)}
        />
        <Input
          label="Начало"
          required
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
        <Input
          label="Завершение"
          type="datetime-local"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <Button type="submit" variant="secondary">
            Проверить и создать
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PromoTable({ items, onDisable }: { items: Promo[]; onDisable: (promo: Promo) => void }) {
  return (
    <div className="border-border bg-surface mt-7 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-surface-muted text-fg-muted">
          <tr>
            <th className="px-4 py-3">Код</th>
            <th className="px-4 py-3">Условие</th>
            <th className="px-4 py-3">Активации</th>
            <th className="px-4 py-3">Срок</th>
            <th className="px-4 py-3">Состояние</th>
            <th className="px-4 py-3">Действие</th>
          </tr>
        </thead>
        <tbody>
          {items.map((promo) => (
            <tr className="border-border border-t" key={promo.id}>
              <td className="px-4 py-3 font-mono font-medium">{promo.code}</td>
              <td className="px-4 py-3">
                {promo.kind === 'percent' ? `${promo.value}%` : `${promo.value} дней`}
              </td>
              <td className="px-4 py-3">
                {promo.redemptions} / {promo.max_redemptions ?? '∞'}
              </td>
              <td className="px-4 py-3">
                {formatDate(promo.starts_at)} —{' '}
                {promo.ends_at ? formatDate(promo.ends_at) : 'без срока'}
              </td>
              <td className="px-4 py-3">{promoState(promo.state)}</td>
              <td className="px-4 py-3">
                {promo.active && (
                  <Button variant="ghost" onClick={() => onDisable(promo)}>
                    Отключить
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralTable({
  items,
  onRevoke,
}: {
  items: Referral[];
  onRevoke: (referral: Referral) => void;
}) {
  return (
    <div className="border-border bg-surface mt-7 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[950px] text-left text-sm">
        <thead className="bg-surface-muted text-fg-muted">
          <tr>
            <th className="px-4 py-3">Код</th>
            <th className="px-4 py-3">Пригласил</th>
            <th className="px-4 py-3">Приглашён</th>
            <th className="px-4 py-3">Бонус</th>
            <th className="px-4 py-3">Сигналы</th>
            <th className="px-4 py-3">Действие</th>
          </tr>
        </thead>
        <tbody>
          {items.map((referral) => (
            <tr className="border-border border-t align-top" key={referral.id}>
              <td className="px-4 py-3 font-mono">{referral.code}</td>
              <td className="px-4 py-3">
                <p className="font-medium">{referral.inviter_username}</p>
                <p className="text-fg-subtle text-xs">{referral.inviter_email || 'Без почты'}</p>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{referral.invited_username}</p>
                <p className="text-fg-subtle text-xs">{referral.invited_email || 'Без почты'}</p>
              </td>
              <td className="px-4 py-3">
                {referralStatus(referral.status)}, {referral.reward_days} дней
              </td>
              <td className="px-4 py-3">
                {referral.risk_signals.length ? (
                  <ul className="text-danger list-disc pl-4">
                    {referral.risk_signals.map((signal) => (
                      <li key={signal}>{signal}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-fg-muted">Нет</span>
                )}
              </td>
              <td className="px-4 py-3">
                {referral.status === 'rewarded' && (
                  <Button variant="ghost" onClick={() => onRevoke(referral)}>
                    Компенсировать
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function actionTitle(action: PendingAction) {
  return action.type === 'create'
    ? 'Создать промокод'
    : action.type === 'disable'
      ? `Отключить ${action.promo.code}`
      : 'Компенсировать начисление';
}
function actionConsequences(action: PendingAction) {
  if (action.type === 'create')
    return ['Промокод станет доступен в заданный срок.', 'Операция и причина попадут в аудит.'];
  if (action.type === 'disable')
    return ['Новые оплаты не смогут применить этот код.', 'Прошлые активации сохранятся.'];
  return [
    'Обе связанные бонусные подписки завершатся.',
    'Начисление и компенсация останутся в истории.',
  ];
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
function promoState(value: Promo['state']) {
  return {
    active: 'Действует',
    scheduled: 'Запланирован',
    exhausted: 'Лимит исчерпан',
    expired: 'Срок завершён',
    disabled: 'Отключён',
  }[value];
}
function referralStatus(value: string) {
  return (
    { registered: 'ожидает оплаты', rewarded: 'начислен', rejected: 'отклонён' }[value] ?? value
  );
}
