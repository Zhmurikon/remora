import type { components } from '@remora/api-client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@remora/ui/base';
import { api, getErrorMessage } from '../lib/api';

type Overview = components['schemas']['AdminOverview'];

const integer = new Intl.NumberFormat('ru-RU');

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/overview');
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить сводку'));
      return data;
    },
  });

  return (
    <section aria-labelledby="overview-title">
      <div>
        <h1 id="overview-title" className="text-3xl font-semibold tracking-tight">
          Сводка
        </h1>
        <p className="text-fg-muted mt-2 max-w-2xl">
          Основные показатели Remora без сложной аналитики.
        </p>
      </div>

      {overview.isPending ? (
        <OverviewSkeleton />
      ) : overview.isError ? (
        <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
      ) : (
        <OverviewContent data={overview.data} />
      )}
    </section>
  );
}

function OverviewContent({ data }: { data: Overview }) {
  const primaryStats = [
    { label: 'Всего пользователей', value: data.users_total },
    { label: 'Новые за 7 дней', value: data.users_new_7d },
    { label: 'Учили за 7 дней', value: data.users_active_7d },
    { label: 'Ответы за 7 дней', value: data.reviews_7d },
  ];
  const contentStats = [
    { label: 'Наборы', value: data.sets_total },
    { label: 'Курсы', value: data.courses_total },
    { label: 'Опубликовано', value: data.courses_published },
    { label: 'Открытые жалобы', value: data.reports_open },
  ];

  return (
    <>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {primaryStats.map((stat) => (
          <Card key={stat.label} className="p-5 shadow-none">
            <p className="text-fg-muted text-sm">{stat.label}</p>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">
              {integer.format(stat.value)}
            </p>
          </Card>
        ))}
      </div>

      <section className="border-border mt-8 border-t pt-7" aria-labelledby="content-title">
        <h2 id="content-title" className="text-xl font-semibold">
          Контент и обращения
        </h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          {contentStats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-fg-muted text-sm">{stat.label}</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
                {integer.format(stat.value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <p className="text-fg-subtle mt-8 text-xs">Обновлено {formatDateTime(data.generated_at)}</p>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Загрузка сводки">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="border-border bg-surface h-32 animate-pulse rounded-lg border"
        />
      ))}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border-danger/30 bg-danger-subtle mt-7 rounded-lg border p-5" role="alert">
      <h2 className="font-semibold">Не удалось загрузить данные</h2>
      <p className="text-fg-muted mt-1 text-sm">{message}</p>
      <button
        type="button"
        className="text-primary mt-4 min-h-11 font-medium underline underline-offset-4"
        onClick={onRetry}
      >
        Повторить
      </button>
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
