import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../lib/api';

type PlanCatalog = components['schemas']['AdminPlanCatalog'];

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat('ru-RU');
const PAGE_SIZE = 10;

export function PlansPage() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const plans = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/plans');
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить тарифы'));
      return data;
    },
  });
  const users = useQuery({
    queryKey: ['admin', 'plan-users', query, offset],
    enabled: query.length > 0,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/users', {
        params: { query: { query, offset, limit: PAGE_SIZE } },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось найти пользователей'));
      return data;
    },
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(input.trim());
  }

  return (
    <section aria-labelledby="plans-title">
      <h1 id="plans-title" className="text-3xl font-semibold tracking-tight">
        Тарифы и права
      </h1>
      <p className="text-fg-muted mt-2 max-w-3xl">
        Активные снимки тарифов и диагностика персональных прав. Каталог изменяется только в
        версионированном YAML и здесь доступен для чтения.
      </p>

      {plans.isPending ? (
        <p className="text-fg-muted mt-7">Загружаем тарифы…</p>
      ) : plans.isError ? (
        <p className="text-danger mt-7" role="alert">
          {plans.error.message}
        </p>
      ) : (
        <PlanGrid catalog={plans.data} />
      )}

      <Card className="mt-8 p-5 shadow-none">
        <h2 className="text-xl font-semibold">Диагностика пользователя</h2>
        <p className="text-fg-muted mt-1 text-sm">
          Найдите аккаунт, чтобы увидеть итоговые квоты, источник каждого решения и историю
          персональных прав.
        </p>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submitSearch}>
          <div className="min-w-0 flex-1">
            <Input
              label="Имя, почта или UUID"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!input.trim()}>
            Найти
          </Button>
        </form>
        {users.isPending && query && <p className="text-fg-muted mt-5 text-sm">Ищем…</p>}
        {users.isError && (
          <p className="text-danger mt-5 text-sm" role="alert">
            {users.error.message}
          </p>
        )}
        {users.data && (
          <div className="border-border mt-5 border-t pt-4">
            {users.data.items.length === 0 ? (
              <p className="text-fg-muted text-sm">Пользователи не найдены.</p>
            ) : (
              <ul className="divide-border divide-y">
                {users.data.items.map((user) => (
                  <li key={user.id}>
                    <Link
                      to={`/users/${user.id}`}
                      className="focus-visible:ring-primary hover:bg-surface-muted flex min-h-14 items-center justify-between gap-4 rounded-md px-2 py-3 focus-visible:outline-none focus-visible:ring-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {user.display_name || user.username}
                        </span>
                        <span className="text-fg-muted block truncate text-sm">
                          {user.email || `@${user.username}`}
                        </span>
                      </span>
                      <span className="text-primary shrink-0 text-sm font-medium">
                        Открыть права
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {users.data.total > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  Назад
                </Button>
                <span className="text-fg-muted text-sm">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, users.data.total)} из{' '}
                  {users.data.total}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={offset + PAGE_SIZE >= users.data.total}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  Далее
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}

function PlanGrid({ catalog }: { catalog: PlanCatalog }) {
  return (
    <div className="mt-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Версия каталога: {catalog.catalog_version}</p>
        <p className="text-fg-subtle font-mono text-xs">{catalog.source}</p>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {catalog.items.map((plan) => (
          <Card key={plan.id} className="min-w-0 p-5 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <p className="text-fg-subtle mt-1 font-mono text-xs">
                  {plan.code} · v{plan.version}
                </p>
              </div>
              <span
                className={`${plan.matches_catalog ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'} rounded-sm px-2 py-1 text-xs font-medium`}
              >
                {plan.matches_catalog ? 'Синхронизирован' : 'Есть расхождение'}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <PlanMetric label="Месяц" value={formatPrice(plan.price_month)} />
              <PlanMetric label="Год" value={formatPrice(plan.price_year)} />
              <PlanMetric
                label="Возможности"
                value={integer.format(Object.keys(plan.features).length)}
              />
              <PlanMetric label="Квоты" value={integer.format(Object.keys(plan.limits).length)} />
            </dl>
            <p className="text-fg-muted mt-5 text-sm">
              Активных подписок: {integer.format(plan.active_subscriptions)}
            </p>
            <details className="border-border mt-4 border-t pt-4">
              <summary className="focus-visible:ring-primary min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2">
                Показать значения
              </summary>
              <dl className="mt-2 space-y-2 text-sm">
                {Object.entries(plan.limits).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-fg-muted min-w-0 break-words">{key}</dt>
                    <dd className="shrink-0 font-mono">
                      {value === null ? '∞' : integer.format(value)}
                    </dd>
                  </div>
                ))}
                {Object.entries(plan.features).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt className="text-fg-muted min-w-0 break-words">{key}</dt>
                    <dd className="shrink-0">{value ? 'Да' : 'Нет'}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlanMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-muted rounded-md p-3">
      <dt className="text-fg-muted text-xs">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function formatPrice(value: number | null): string {
  return value === null ? 'Бесплатно' : money.format(value / 100);
}
