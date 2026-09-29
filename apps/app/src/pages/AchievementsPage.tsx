import type { components } from '@remora/api-client';
import { Button, Card } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import { AchievementIcon } from '../features/achievements/AchievementIcon';
import {
  achievementsQueryKey,
  loadAchievements,
} from '../features/achievements/AchievementCelebration';

type Achievement = components['schemas']['AchievementPublic'];

export function AchievementsPage() {
  const achievements = useQuery({
    queryKey: achievementsQueryKey,
    queryFn: loadAchievements,
  });

  if (achievements.isPending) return <AchievementsSkeleton />;
  if (achievements.isError || !achievements.data) {
    return (
      <Card className="p-8 text-center" role="alert">
        <h1 className="text-2xl font-semibold">Не удалось загрузить достижения</h1>
        <p className="text-fg-muted mt-2">Проверьте соединение и попробуйте ещё раз.</p>
        <Button className="mt-5" onClick={() => void achievements.refetch()}>
          Повторить
        </Button>
      </Card>
    );
  }

  const { items, unlocked_count: unlocked, total_count: total } = achievements.data;
  const categories = Array.from(new Set(items.map((item) => item.category)));

  return (
    <div>
      <header>
        <p className="text-primary text-sm font-medium">Ваш прогресс</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Достижения</h1>
        <p className="text-fg-muted mt-3 max-w-2xl">
          Учитесь в своём темпе. Коллекция отмечает устойчивые привычки и важные шаги, но не
          сравнивает вас с другими.
        </p>
      </header>

      <Card className="mt-8 overflow-hidden p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-fg-muted text-sm">Открыто</p>
            <p className="mt-1 text-3xl font-semibold">
              {unlocked} <span className="text-fg-subtle text-lg font-medium">из {total}</span>
            </p>
          </div>
          <p className="text-fg-muted text-sm">{Math.round((unlocked / Math.max(1, total)) * 100)}%</p>
        </div>
        <div
          className="bg-surface-muted mt-4 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-label="Прогресс коллекции"
          aria-valuenow={unlocked}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            className="bg-primary h-full rounded-full transition-[width] motion-reduce:transition-none"
            style={{ width: `${(unlocked / Math.max(1, total)) * 100}%` }}
          />
        </div>
      </Card>

      {categories.map((category) => (
        <section key={category} className="mt-10" aria-labelledby={`category-${category}`}>
          <h2 id={`category-${category}`} className="text-xl font-semibold">
            {category}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items
              .filter((item) => item.category === category)
              .map((item) => (
                <AchievementCard key={item.code} item={item} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AchievementCard({ item }: { item: Achievement }) {
  const percent = Math.round((item.progress / Math.max(1, item.target)) * 100);
  return (
    <Card className={`p-5 ${item.unlocked ? '' : 'bg-surface-muted'}`}>
      <div className="flex items-start gap-4">
        <span
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${item.unlocked ? 'bg-accent-subtle' : 'bg-surface'}`}
        >
          <AchievementIcon unlocked={item.unlocked} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold">{item.title}</h3>
            <span className={`text-xs font-medium ${item.unlocked ? 'text-success' : 'text-fg-subtle'}`}>
              {item.unlocked ? 'Получено' : `${item.progress} из ${item.target}`}
            </span>
          </div>
          <p className="text-fg-muted mt-1 text-sm">{item.description}</p>
          {!item.unlocked && (
            <div
              className="bg-surface mt-4 h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-label={`Прогресс: ${item.title}`}
              aria-valuenow={item.progress}
              aria-valuemin={0}
              aria-valuemax={item.target}
            >
              <div className="bg-primary h-full rounded-full" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function AchievementsSkeleton() {
  return (
    <div aria-label="Загрузка достижений" aria-busy="true">
      <div className="bg-surface-muted h-10 w-64 animate-pulse rounded-xl motion-reduce:animate-none" />
      <div className="bg-surface-muted mt-8 h-32 animate-pulse rounded-2xl motion-reduce:animate-none" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-surface-muted h-36 animate-pulse rounded-2xl motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}
