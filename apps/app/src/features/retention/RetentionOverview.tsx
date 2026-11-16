import { pluralWithCount } from '@remora/core';
import type { components } from '@remora/api-client';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

type RetentionSummary = components['schemas']['RetentionSummary'];
type ActivityDay = components['schemas']['ActivityDay'];

const HEATMAP_WEEKS = 16;

export function RetentionOverview() {
  const summary = useQuery({
    queryKey: ['retention', 'summary'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/retention/summary');
      if (error || !data) throw new Error('Не удалось загрузить учебную активность');
      return data;
    },
  });

  if (summary.isPending) return <RetentionSkeleton />;
  if (summary.isError) {
    return (
      <section className="dashboard-retention" role="alert">
        <h2 className="text-lg font-semibold">Учебная активность недоступна</h2>
        <p className="text-fg-muted mt-2 text-sm">Попробуйте загрузить данные ещё раз.</p>
        <button
          type="button"
          className="text-primary mt-4 min-h-11 font-medium underline-offset-4 hover:underline"
          onClick={() => void summary.refetch()}
        >
          Повторить
        </button>
      </section>
    );
  }

  return <RetentionContent summary={summary.data} />;
}

function RetentionContent({ summary }: { summary: RetentionSummary }) {
  const range = activityRange(summary.date);
  const activity = useQuery({
    queryKey: ['retention', 'activity', range.from, range.to],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/retention/activity', {
        params: { query: range },
      });
      if (error || !data) throw new Error('Не удалось загрузить календарь активности');
      return data;
    },
  });

  const percent = Math.min(
    100,
    Math.round((100 * summary.reviews_today) / Math.max(1, summary.daily_goal)),
  );
  return (
    <section className="dashboard-retention" aria-label="Учебная активность">
      <div>
        <h2>Дневная цель</h2>
        <p className="dashboard-goal-count">
          <strong>{summary.reviews_today}</strong> из{' '}
          {pluralWithCount(summary.daily_goal, ['карточки', 'карточек', 'карточек'])}
        </p>
        <div
          className="dashboard-ruler"
          role="img"
          aria-label={`Дневная цель выполнена на ${percent}%`}
        >
          <span style={{ width: percent + '%' }} />
        </div>
        {summary.goal_completed && <p>Цель выполнена</p>}
        <small>
          +{summary.xp_today} XP сегодня ·{' '}
          {pluralWithCount(summary.correct_today, [
            'верный ответ',
            'верных ответа',
            'верных ответов',
          ])}
        </small>
      </div>
      <div>
        <h2>Активность за 16 недель</h2>
        {activity.isPending ? (
          <div
            className="bg-surface-muted mt-5 h-28 animate-pulse rounded-lg"
            aria-label="Загрузка активности"
          />
        ) : activity.isError ? (
          <div className="mt-5" role="alert">
            <p className="text-fg-muted text-sm">Не удалось загрузить календарь активности.</p>
            <button
              type="button"
              className="text-primary mt-2 min-h-11 font-medium underline-offset-4 hover:underline"
              onClick={() => void activity.refetch()}
            >
              Повторить
            </button>
          </div>
        ) : (
          <ActivityHeatmap from={range.from} to={range.to} activity={activity.data} />
        )}
        <HeatmapLegend />
      </div>
      <div>
        <dl className="dashboard-pair">
          <div>
            <dt>Текущая серия</dt>
            <dd>
              {summary.current_streak_days} {dayWord(summary.current_streak_days)}
            </dd>
            <dd>
              Рекорд · {summary.longest_streak_days} {dayWord(summary.longest_streak_days)}
            </dd>
          </div>
          <div>
            <dt>Уровень</dt>
            <dd>{summary.level}</dd>
            <dd>{summary.total_xp.toLocaleString('ru-RU')} XP всего</dd>
          </div>
        </dl>
        <div className="dashboard-level">
          <span>До уровня {summary.level + 1}</span>
          <span>
            {summary.current_level_xp} / {summary.next_level_xp} XP
          </span>
        </div>
        <Progress
          value={summary.current_level_xp}
          max={summary.next_level_xp}
          label={`Прогресс уровня ${summary.level}`}
        />
        <small>Заморозки серии · {summary.freezes_left} из 2</small>
      </div>
    </section>
  );
}

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div
      className="bg-surface-muted mt-2 h-2 overflow-hidden rounded-full"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className="bg-primary h-full rounded-full transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function ActivityHeatmap({
  from,
  to,
  activity,
}: {
  from: string;
  to: string;
  activity: ActivityDay[];
}) {
  const byDate = new Map(activity.map((day) => [day.date, day]));
  const days = datesBetween(from, to);
  return (
    <div className="dashboard-calendar">
      <div className="dashboard-weekdays" aria-hidden="true">
        <span>Пн</span>
        <span>Ср</span>
        <span>Пт</span>
        <span>Вс</span>
      </div>
      <div
        className="dashboard-days"
        role="list"
        aria-label="Календарь учебной активности за 16 недель"
      >
        {days.map((date) => {
          const day = byDate.get(date);
          const label = activityLabel(date, day);
          return (
            <span
              key={date}
              role="listitem"
              className={`rounded-sm ${activityColor(day)}`}
              title={label}
              aria-label={label}
            />
          );
        })}
      </div>
    </div>
  );
}

function HeatmapLegend() {
  return (
    <div
      className="text-fg-subtle flex items-center gap-1.5 text-xs"
      aria-label="Интенсивность активности: от меньшей к большей"
    >
      <span>Меньше</span>
      {['bg-surface-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'].map(
        (color) => (
          <span key={color} className={`h-3 w-3 rounded-sm ${color}`} aria-hidden="true" />
        ),
      )}
      <span>Больше</span>
    </div>
  );
}

function RetentionSkeleton() {
  return (
    <section className="dashboard-retention space-y-4" aria-label="Загрузка учебной активности">
      <div className="bg-surface-muted h-32 animate-pulse rounded-lg" />
      <div className="bg-surface-muted h-32 animate-pulse rounded-lg" />
    </section>
  );
}

function activityRange(today: string): { from: string; to: string } {
  const end = parseDate(today);
  const weekday = (end.getUTCDay() + 6) % 7;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - weekday - (HEATMAP_WEEKS - 1) * 7);
  return { from: isoDate(start), to: today };
}

function datesBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const cursor = parseDate(from);
  const end = parseDate(to);
  while (cursor <= end) {
    result.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Некорректная дата: ${value}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function activityColor(day: ActivityDay | undefined): string {
  if (day?.is_frozen) return 'bg-accent-subtle ring-1 ring-inset ring-accent/60';
  const count = day?.reviews_count ?? 0;
  if (count === 0) return 'bg-surface-muted';
  if (count < 5) return 'bg-primary/25';
  if (count < 10) return 'bg-primary/50';
  if (count < 20) return 'bg-primary/75';
  return 'bg-primary';
}

function activityLabel(date: string, day: ActivityDay | undefined): string {
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseDate(date));
  if (day?.is_frozen) return `${formatted}: серия заморожена`;
  const count = day?.reviews_count ?? 0;
  return `${formatted}: ${count} ${cardWord(count)}, ${day?.xp_earned ?? 0} XP`;
}

function cardWord(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'карточка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'карточки';
  return 'карточек';
}

function dayWord(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}
