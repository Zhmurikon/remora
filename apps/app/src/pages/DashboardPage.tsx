import { plural, pluralWithCount } from '@remora/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import { RetentionOverview } from '../features/retention/RetentionOverview';
import drawerImage from '../../../web/public/lecture-demo/catalog-drawer.webp';
import './dashboard.css';
import { api } from '../lib/api';
import { createEmptySet } from '../features/materials/create-empty-set';

export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const name = user?.display_name || user?.username || 'друг';

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createSet = useMutation({
    mutationFn: async () => {
      const { data, error } = await createEmptySet();
      if (!data || error)
        throw new Error(
          error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Не удалось создать набор',
        );
      return data;
    },
    onSuccess: (set) => {
      void queryClient.invalidateQueries({ queryKey: ['sets'] });
      navigate(`/sets/${set.id}/edit`);
    },
  });

  const sets = useQuery({
    queryKey: ['sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sets');
      if (error || !data) throw new Error('Не удалось загрузить наборы');
      return data;
    },
  });

  const savedSets = useQuery({
    queryKey: ['library', 'sets'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/library/sets');
      if (error || !data) throw new Error('Не удалось загрузить сохранённые наборы');
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

  const availableSets = mergeRecentSets(sets.data ?? [], savedSets.data ?? []);
  const [latest, ...others] = availableSets.slice(0, 5);
  const loadingSets = sets.isPending || savedSets.isPending;
  const failedSets = sets.isError || savedSets.isError;
  const count = sets.data && savedSets.data ? availableSets.length : undefined;
  const today = forecast.data ? (forecast.data[0]?.count ?? 0) : undefined;
  const week = forecast.data?.reduce((sum, day) => sum + day.count, 0);
  const date = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="dashboard">
      <header>
        <div className="dashboard-context">
          <span>Главная</span>
          <span>{date}</span>
        </div>
        <h1>
          Привет, <em>{name}!</em>
        </h1>
        <div className="dashboard-stats">
          <dl aria-label="Статистика">
            <Stat
              value={count}
              label={
                count === undefined ? 'наборов' : plural(count, ['набор', 'набора', 'наборов'])
              }
            />
            <Stat value={today} label="к повторению сегодня" />
            <Stat value={week} label="к повторению в ближайшие 7 дней" />
          </dl>
          <Link to="/sets">
            Все наборы <span aria-hidden="true">→</span>
          </Link>
        </div>
        {forecast.isError && (
          <p role="alert">
            Не удалось загрузить прогноз.{' '}
            <button onClick={() => void forecast.refetch()}>Повторить</button>
          </p>
        )}
      </header>
      <div className="dashboard-columns">
        <section aria-labelledby="dashboard-study">
          <h2 id="dashboard-study">Продолжить обучение</h2>
          {failedSets && (
            <p role="alert">
              Не удалось загрузить все наборы.{' '}
              <button
                onClick={() => {
                  if (sets.isError) void sets.refetch();
                  if (savedSets.isError) void savedSets.refetch();
                }}
              >
                Повторить
              </button>
            </p>
          )}
          {latest ? (
            <>
              <article className="dashboard-card">
                <span className="dashboard-tab">Последний набор</span>
                <small>{cardCount(latest)}</small>
                <h3>
                  <Link to={`/sets/${latest.id}`}>{latest.title}</Link>
                </h3>
                <LearnLink item={latest} primary />
                <div className="dashboard-drawer" aria-hidden="true">
                  <img src={drawerImage} width="380" height="288" alt="" />
                  <svg viewBox="0 0 380 288" focusable="false">
                    <defs>
                      <clipPath id="dashboard-drawer-slot">
                        <path d="M0 0H380V138L170 125 57 114 0 110Z" />
                      </clipPath>
                    </defs>
                    <g clipPath="url(#dashboard-drawer-slot)">
                      <g className="dashboard-drawer-sheet">
                        <path
                          fill="rgb(var(--rm-lecture-cream))"
                          d="M59 129Q59 127 61 127L70 127 73 122 101 124 104 129 169 134Q172 134 172 136L170 191 58 182Z"
                        />
                        <path
                          fill="none"
                          d="M68 143v18l29 2m-27-5 6-5 6 2 7-9 6 2m11-3 52 4m-52 2 47 4m-47 2 42 4"
                        />
                      </g>
                    </g>
                  </svg>
                </div>
              </article>
              {others.length > 0 && (
                <>
                  <h3 className="dashboard-recent-title">Другие недавние наборы</h3>
                  <ul className="dashboard-list">
                    {others.map((item) => (
                      <li key={item.id}>
                        <i aria-hidden="true" className="dashboard-stack" />
                        <div>
                          <Link to={`/sets/${item.id}`}>{item.title}</Link>
                          <small>{cardCount(item)}</small>
                        </div>
                        <LearnLink item={item} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : loadingSets ? (
            <p role="status" className="dashboard-message">
              Загружаем наборы…
            </p>
          ) : (
            !failedSets && (
              <div className="dashboard-message">
                <h3>Здесь появятся ваши наборы</h3>
                <p>Создайте первый набор, чтобы начать обучение.</p>
                <button
                  className="dashboard-primary"
                  disabled={createSet.isPending}
                  onClick={() => createSet.mutate()}
                >
                  {createSet.isPending ? 'Создаём набор…' : 'Создать набор'}
                </button>
                {createSet.isError && <p role="alert">{createSet.error.message}</p>}
              </div>
            )
          )}
        </section>
        <RetentionOverview />
      </div>
    </div>
  );
}

function cardCount(item: RecentSet) {
  return pluralWithCount(item.cards_count, ['карточка', 'карточки', 'карточек']);
}

function LearnLink({ item, primary = false }: { item: RecentSet; primary?: boolean }) {
  const className = primary ? 'dashboard-primary' : 'dashboard-learn';
  if (!item.cards_count)
    return (
      <button disabled className={className} title="В наборе пока нет карточек">
        Учить
      </button>
    );
  return (
    <Link to={`/sets/${item.id}/learn`} className={className} aria-label={`Учить: ${item.title}`}>
      Учить <span aria-hidden="true">{primary ? '→' : '›'}</span>
    </Link>
  );
}

type RecentSet = {
  id: string;
  title: string;
  cards_count: number;
  recent_at: string;
};

export function mergeRecentSets(
  owned: { id: string; title: string; cards_count: number; updated_at: string }[],
  saved: { id: string; title: string; cards_count: number; saved_at: string }[],
): RecentSet[] {
  const byId = new Map<string, RecentSet>();
  for (const item of owned) {
    byId.set(item.id, { ...item, recent_at: item.updated_at });
  }
  for (const item of saved) {
    if (!byId.has(item.id)) byId.set(item.id, { ...item, recent_at: item.saved_at });
  }
  return [...byId.values()].sort(
    (left, right) => Date.parse(right.recent_at) - Date.parse(left.recent_at),
  );
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}
