import type { components } from '@remora/api-client';
import { Card } from '@remora/ui';
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
      <Card className="mt-6 p-6" role="alert">
        <h2 className="text-lg font-semibold">Учебная активность недоступна</h2>
        <p className="text-fg-muted mt-2 text-sm">Попробуйте загрузить данные ещё раз.</p>
        <button
          type="button"
          className="text-primary mt-4 min-h-11 font-medium underline-offset-4 hover:underline"
          onClick={() => void summary.refetch()}
        >
          Повторить
        </button>
      </Card>
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

  return (
    <section className="mt-6" aria-labelledby="retention-title">
      <h2 id="retention-title" className="sr-only">
        Учебная активность
      </h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
        <Card className="p-5 sm:p-6">
          <div className="grid items-center gap-6 sm:grid-cols-[9rem_1fr]">
            <GoalRing summary={summary} />
            <div>
              <p className="text-primary text-sm font-medium">Дневная цель</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {summary.goal_completed ? 'Цель выполнена' : 'Продолжайте в том же темпе'}
              </p>
              <p className="text-fg-muted mt-2 text-sm">
                {summary.goal_completed
                  ? `Сегодня вы повторили ${summary.reviews_today} карточек.`
                  : `Осталось ${Math.max(0, summary.daily_goal - summary.reviews_today)} из ${summary.daily_goal} карточек.`}
              </p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                <Metric label="XP сегодня" value={`+${summary.xp_today}`} />
                <Metric label="Верных ответов" value={String(summary.correct_today)} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="grid grid-cols-2 gap-4 p-5 sm:p-6">
          <MetricCard
            label="Текущая серия"
            value={`${summary.current_streak_days}`}
            suffix={dayWord(summary.current_streak_days)}
            hint={`Рекорд: ${summary.longest_streak_days} ${dayWord(summary.longest_streak_days)}`}
          />
          <MetricCard
            label="Уровень"
            value={`${summary.level}`}
            suffix="уровень"
            hint={`${summary.total_xp} XP всего`}
          />
          <div className="border-border col-span-2 border-t pt-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-fg-muted">До следующего уровня</span>
              <span className="font-medium">
                {summary.current_level_xp} / {summary.next_level_xp} XP
              </span>
            </div>
            <Progress
              value={summary.current_level_xp}
              max={summary.next_level_xp}
              label={`Прогресс уровня ${summary.level}`}
            />
            <p className="text-fg-subtle mt-3 text-xs">
              Доступно заморозок серии: {summary.freezes_left} из 2
            </p>
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Активность за 16 недель</h3>
            <p className="text-fg-muted mt-1 text-sm">Каждая клетка — один учебный день.</p>
          </div>
          <HeatmapLegend />
        </div>
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
      </Card>
    </section>
  );
}

function GoalRing({ summary }: { summary: RetentionSummary }) {
  const progress = Math.min(1, summary.reviews_today / Math.max(1, summary.daily_goal));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className="relative mx-auto h-36 w-36"
      role="img"
      aria-label={`Дневная цель выполнена на ${Math.round(progress * 100)}%`}
    >
      <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
        <circle
          className="stroke-surface-muted"
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
        />
        <circle
          className="stroke-primary transition-all duration-300"
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-2xl font-semibold">{summary.reviews_today}</span>
        <span className="text-fg-subtle text-xs">из {summary.daily_goal}</span>
      </div>
    </div>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-semibold">{value}</span>{' '}
      <span className="text-fg-muted">{label.toLocaleLowerCase('ru')}</span>
    </p>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  suffix: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-fg-muted text-sm">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="text-fg-subtle text-xs">{suffix}</p>
      <p className="text-fg-muted mt-2 text-xs">{hint}</p>
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
    <div className="mt-5 overflow-x-auto pb-2">
      <div
        className="grid w-max grid-flow-col grid-rows-7 gap-1"
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
              className={`h-3 w-3 rounded-sm ${activityColor(day)}`}
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
    <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Загрузка учебной активности">
      <div className="bg-surface-muted h-56 animate-pulse rounded-lg" />
      <div className="bg-surface-muted h-56 animate-pulse rounded-lg" />
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
