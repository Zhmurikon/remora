import type { components } from '@remora/api-client';
import { Card } from '@remora/ui/base';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';

type UserDetail = components['schemas']['AdminUserDetail'];

const integer = new Intl.NumberFormat('ru-RU');
const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const limitLabels: Record<string, string> = {
  'courses.total': 'Курсы',
  'sets.library_total': 'Наборы в библиотеке',
  'agent.writes_per_week': 'Записи через MCP в неделю',
  'study.reviews_soft_per_day': 'Ответы в день (мягкий порог)',
  'classes.max': 'Классы',
  'classes.students_max': 'Ученики в классе',
  'assignments.active_max': 'Активные задания',
  'export.account_per_day': 'Экспорты аккаунта в день',
  'tts.chars_per_month': 'Символы TTS в месяц',
  'ai.transcription_minutes_per_week': 'Расшифровка в неделю, мин',
  'ai.generation_tokens_per_week': 'ИИ-токены в неделю',
};

const featureLabels: Record<string, string> = {
  'ai.transcription': 'ИИ-расшифровка',
  'ai.generation': 'ИИ-генерация',
  'classes.dashboard': 'Сводка класса',
  'classes.student_report': 'Отчёт по ученику',
  'classes.card_report': 'Отчёт по карточкам',
  'classes.xlsx_export': 'Выгрузка XLSX',
};

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const user = useQuery({
    queryKey: ['admin', 'users', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/users/{user_id}', {
        params: { path: { user_id: userId ?? '' } },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить пользователя'));
      return data;
    },
  });

  if (user.isPending) return <UserDetailSkeleton />;
  if (user.isError) {
    return (
      <section aria-labelledby="user-error-title">
        <BackLink />
        <div className="border-danger/30 bg-danger-subtle mt-5 rounded-lg border p-5" role="alert">
          <h1 id="user-error-title" className="text-xl font-semibold">
            Не удалось загрузить пользователя
          </h1>
          <p className="text-fg-muted mt-1 text-sm">{user.error.message}</p>
          <button
            type="button"
            className="text-primary mt-4 min-h-11 font-medium underline underline-offset-4"
            onClick={() => void user.refetch()}
          >
            Повторить
          </button>
        </div>
      </section>
    );
  }

  return <UserDetailContent data={user.data} />;
}

function UserDetailContent({ data }: { data: UserDetail }) {
  return (
    <section aria-labelledby="user-title">
      <BackLink />
      <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="user-title" className="truncate text-3xl font-semibold tracking-tight">
              {data.display_name || data.username}
            </h1>
            <StatusBadge status={data.status} />
          </div>
          <p className="text-fg-muted mt-2 break-all">{data.email || 'Почта не указана'}</p>
          <p className="text-fg-subtle mt-1 font-mono text-xs">{data.id}</p>
        </div>
        <div className="bg-primary-subtle text-primary w-fit rounded-md px-3 py-2 text-sm font-medium">
          {data.access.plan_name}
        </div>
      </header>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-5">
          <ActivitySection data={data} />
          <MaterialsSection data={data} />
          <AccessSection data={data} />
          <PaymentsSection data={data} />
        </div>
        <aside className="space-y-5">
          <AccountSection data={data} />
          <ReferralSection data={data} />
        </aside>
      </div>
    </section>
  );
}

function ActivitySection({ data }: { data: UserDetail }) {
  const stats = [
    ['Всего ответов', data.activity.reviews_total],
    ['За 7 дней', data.activity.reviews_7d],
    ['За 30 дней', data.activity.reviews_30d],
    ['Активных дней за месяц', data.activity.active_days_30d],
  ] as const;
  return (
    <Card className="p-5 shadow-none">
      <h2 className="text-xl font-semibold">Активность</h2>
      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-fg-muted text-sm">{label}</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {integer.format(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-fg-subtle mt-5 text-sm">
        Последняя учёба:{' '}
        {data.activity.last_active_at
          ? formatDateTime(data.activity.last_active_at)
          : 'ответов ещё нет'}
      </p>
    </Card>
  );
}

function MaterialsSection({ data }: { data: UserDetail }) {
  const { materials } = data;
  return (
    <Card className="overflow-hidden p-0 shadow-none">
      <div className="p-5">
        <h2 className="text-xl font-semibold">Материалы</h2>
        <p className="text-fg-muted mt-1 text-sm">
          {integer.format(materials.sets_total)} наборов · {integer.format(materials.cards_total)}{' '}
          карточек · {integer.format(materials.courses_total)} курсов
        </p>
      </div>
      {materials.recent.length === 0 ? (
        <p className="border-border text-fg-muted border-t px-5 py-6 text-sm">
          Пользователь ещё не создавал материалы.
        </p>
      ) : (
        <ul className="border-border divide-border divide-y border-t">
          {materials.recent.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.title}</p>
                <p className="text-fg-subtle mt-1 text-xs">
                  {item.kind === 'set' ? 'Набор' : 'Курс'} · {materialStatusLabel(item.status)} ·{' '}
                  {formatDate(item.updated_at)}
                </p>
              </div>
              {item.items_count !== null && (
                <span className="text-fg-muted shrink-0 font-mono text-sm tabular-nums">
                  {integer.format(item.items_count)} карт.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AccessSection({ data }: { data: UserDetail }) {
  const { access } = data;
  const limits = Object.entries(access.limits);
  const features = Object.entries(access.features);
  return (
    <Card className="p-5 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Тариф, права и квоты</h2>
          <p className="text-fg-muted mt-1 text-sm">
            {access.current_period_end
              ? `Оплачен до ${formatDate(access.current_period_end)}`
              : 'Бесплатный тариф без срока окончания'}
          </p>
        </div>
        <span className="bg-primary-subtle text-primary rounded-sm px-2 py-1 text-xs font-medium">
          {access.plan_name}
        </span>
      </div>

      <div className="mt-5 overflow-x-auto" tabIndex={0} aria-label="Квоты пользователя">
        <table className="w-full min-w-[540px] border-collapse text-left text-sm">
          <thead className="text-fg-muted">
            <tr>
              <th className="border-border border-b pb-2 font-medium">Квота</th>
              <th className="border-border border-b pb-2 text-right font-medium">Использовано</th>
              <th className="border-border border-b pb-2 text-right font-medium">Лимит</th>
              <th className="border-border border-b pb-2 text-right font-medium">Осталось</th>
            </tr>
          </thead>
          <tbody>
            {limits.map(([key, limit]) => {
              const used = access.usage[key];
              const remaining = access.remaining[key];
              return (
                <tr key={key} className="border-border border-b last:border-0">
                  <td className="py-3 pr-4">{limitLabels[key] ?? key}</td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {used === undefined ? '—' : integer.format(used)}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {limit === null ? 'Без лимита' : integer.format(limit)}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {remaining === undefined || remaining === null
                      ? '—'
                      : integer.format(remaining)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="mt-6 font-semibold">Возможности</h3>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {features.map(([key, enabled]) => (
          <li
            key={key}
            className="bg-surface-muted flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
          >
            <span>{featureLabels[key] ?? key}</span>
            <span className={enabled ? 'text-success' : 'text-fg-subtle'}>
              {enabled ? 'Доступно' : 'Недоступно'}
            </span>
          </li>
        ))}
      </ul>

      {access.overrides.length > 0 && (
        <div className="border-border mt-6 border-t pt-5">
          <h3 className="font-semibold">Персональные права</h3>
          <ul className="mt-3 space-y-3">
            {access.overrides.map((item) => (
              <li
                key={`${item.key}-${item.starts_at}`}
                className="bg-warning-subtle rounded-md px-3 py-3 text-sm"
              >
                <p className="font-medium">
                  {limitLabels[item.key.replace(/^limit\./, '')] ?? item.key}
                </p>
                <p className="text-fg-muted mt-1">
                  {String(item.value)} · {item.reason}
                </p>
                <p className="text-fg-subtle mt-1 text-xs">
                  {item.valid_until ? `до ${formatDate(item.valid_until)}` : 'без срока окончания'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function PaymentsSection({ data }: { data: UserDetail }) {
  return (
    <Card className="overflow-hidden p-0 shadow-none">
      <div className="p-5">
        <h2 className="text-xl font-semibold">Платежи и промокоды</h2>
        <p className="text-fg-muted mt-1 text-sm">Последние операции пользователя.</p>
      </div>
      {data.payments.length === 0 ? (
        <p className="border-border text-fg-muted border-t px-5 py-6 text-sm">Платежей ещё нет.</p>
      ) : (
        <div
          className="border-border overflow-x-auto border-t"
          tabIndex={0}
          aria-label="Платежи пользователя"
        >
          <table className="w-full min-w-[620px] border-collapse text-left text-sm">
            <thead className="bg-surface-muted text-fg-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Дата</th>
                <th className="px-5 py-3 font-medium">Тариф</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3 font-medium">Промокод</th>
                <th className="px-5 py-3 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((payment) => (
                <tr key={payment.id} className="border-border border-t">
                  <td className="whitespace-nowrap px-5 py-4">{formatDate(payment.created_at)}</td>
                  <td className="px-5 py-4">{payment.plan_name}</td>
                  <td className="px-5 py-4">{paymentStatusLabel(payment.status)}</td>
                  <td className="px-5 py-4 font-mono">{payment.promo_code ?? '—'}</td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums">
                    {money.format(payment.amount / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.promo_redemptions.length > 0 && (
        <div className="border-border border-t px-5 py-4">
          <h3 className="text-sm font-semibold">Использованные промокоды</h3>
          <p className="text-fg-muted mt-2 text-sm">
            {data.promo_redemptions.map((item) => item.code).join(', ')}
          </p>
        </div>
      )}
    </Card>
  );
}

function AccountSection({ data }: { data: UserDetail }) {
  const rows = [
    ['Имя пользователя', data.username],
    ['Роль', roleLabel(data.role)],
    ['Состояние', statusLabel(data.status)],
    ['Почта', data.email_verified ? 'Подтверждена' : 'Не подтверждена'],
    ['Регистрация', formatDateTime(data.created_at)],
    ['Часовой пояс', data.timezone],
    ['Язык', data.locale],
    ['Вход через', data.oauth_providers.length ? data.oauth_providers.join(', ') : 'Пароль'],
  ] as const;
  return (
    <Card className="p-5 shadow-none">
      <h2 className="text-xl font-semibold">Аккаунт</h2>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-sm">
            <dt className="text-fg-muted">{label}</dt>
            <dd className="max-w-[60%] break-words text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function ReferralSection({ data }: { data: UserDetail }) {
  return (
    <Card className="p-5 shadow-none">
      <h2 className="text-xl font-semibold">Рефералы</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Код</dt>
          <dd className="font-mono font-medium">{data.referral.code ?? 'Не создан'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Приглашено</dt>
          <dd className="font-mono font-medium tabular-nums">
            {integer.format(data.referral.invited_total)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Получили бонус</dt>
          <dd className="font-mono font-medium tabular-nums">
            {integer.format(data.referral.rewarded_total)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">Пригласил</dt>
          <dd className="font-medium">{data.referral.invited_by_username ?? 'Нет'}</dd>
        </div>
      </dl>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className =
    status === 'active'
      ? 'bg-success-subtle text-success'
      : status === 'suspended'
        ? 'bg-warning-subtle text-warning'
        : 'bg-danger-subtle text-danger';
  return (
    <span className={`${className} rounded-sm px-2 py-1 text-xs font-medium`}>
      {statusLabel(status)}
    </span>
  );
}

function BackLink() {
  return (
    <Link
      to="/users"
      className="text-primary inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
    >
      ← К пользователям
    </Link>
  );
}

function UserDetailSkeleton() {
  return (
    <section aria-label="Загрузка карточки пользователя">
      <div className="bg-surface-muted h-11 w-40 animate-pulse rounded-md" />
      <div className="bg-surface-muted mt-5 h-20 max-w-xl animate-pulse rounded-lg" />
      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-5">
          {[160, 260, 420].map((height) => (
            <div
              key={height}
              className="border-border bg-surface animate-pulse rounded-lg border"
              style={{ height }}
            />
          ))}
        </div>
        <div className="border-border bg-surface h-72 animate-pulse rounded-lg border" />
      </div>
    </section>
  );
}

function roleLabel(role: string): string {
  return (
    {
      user: 'Пользователь',
      teacher: 'Преподаватель',
      moderator: 'Модератор',
      admin: 'Администратор',
    }[role] ?? role
  );
}

function statusLabel(status: string): string {
  return { active: 'Активен', suspended: 'Приостановлен', deleted: 'Удалён' }[status] ?? status;
}

function materialStatusLabel(status: string): string {
  return (
    {
      private: 'личный',
      unlisted: 'по ссылке',
      public: 'публичный',
      archived: 'в архиве',
      draft: 'черновик',
      published: 'опубликован',
      blocked: 'заблокирован',
    }[status] ?? status
  );
}

function paymentStatusLabel(status: string): string {
  return (
    { pending: 'Ожидает', succeeded: 'Оплачен', canceled: 'Отменён', refunded: 'Возвращён' }[
      status
    ] ?? status
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
