import { pluralWithCount } from '@remora/core';
import { Button, Card } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import { RetentionOverview } from '../features/retention/RetentionOverview';
import { api } from '../lib/api';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const name = user?.display_name || user?.username || 'друг';

  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (error || !data) throw new Error('Не удалось загрузить наборы');
      return data;
    },
  });

  const forecast = useQuery({
    queryKey: ['study', 'forecast'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/study/forecast', {
        params: { query: { days: 7 } },
      });
      if (error || !data) throw new Error('Не удалось загрузить прогноз');
      return data;
    },
  });

  const dueToday = forecast.data?.[0]?.count ?? 0;
  const dueWeek = (forecast.data ?? []).reduce((sum, day) => sum + day.count, 0);
  const recent = (sets.data ?? []).slice(0, 5);

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-primary text-sm font-medium">Ваш кабинет</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Привет, {name}!
          </h1>
          <p className="text-fg-muted mt-3 max-w-xl">
            {dueToday > 0
              ? `Сегодня к повторению ${pluralWithCount(dueToday, ['карточка', 'карточки', 'карточек'])}.`
              : 'Сегодня повторять нечего — можно взяться за новый набор.'}
          </p>
        </div>
        <Button size="lg" onClick={() => navigate('/sets')}>
          Перейти к наборам
        </Button>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Статистика">
        <Stat label="Наборов" value={sets.data?.length ?? 0} />
        <Stat label="К повторению сегодня" value={dueToday} />
        <Stat label="За неделю" value={dueWeek} />
      </section>

      <RetentionOverview />

      <Card className="mt-6 p-6">
        <h2 className="text-lg font-semibold">Продолжить обучение</h2>
        {recent.length === 0 ? (
          <div className="grid min-h-60 place-items-center px-6 py-10 text-center">
            <div>
              <span
                className="bg-primary-subtle text-primary mx-auto grid h-16 w-16 place-items-center rounded-2xl text-3xl"
                aria-hidden="true"
              >
                ＋
              </span>
              <h3 className="mt-5 text-xl font-semibold">Здесь появятся ваши наборы</h3>
              <p className="text-fg-muted mx-auto mt-2 max-w-md">
                Создайте первый набор — и Remora начнёт возвращать карточки ровно тогда, когда вы
                готовы их забыть.
              </p>
              <Button className="mt-6" onClick={() => navigate('/sets')}>
                Создать набор
              </Button>
            </div>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {recent.map((item) => (
              <li
                key={item.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
              >
                <div className="min-w-0">
                  <Link to={`/sets/${item.id}`} className="truncate font-medium">
                    {item.title}
                  </Link>
                  <p className="text-fg-subtle text-sm">
                    {pluralWithCount(item.cards_count, ['карточка', 'карточки', 'карточек'])}
                  </p>
                </div>
                <Link to={`/sets/${item.id}/learn`}>
                  <Button size="sm" disabled={item.cards_count === 0}>
                    Учить
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-fg-muted text-sm">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </Card>
  );
}
