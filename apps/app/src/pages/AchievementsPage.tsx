import type { components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useQuery } from '@tanstack/react-query';
import {
  achievementsQueryKey,
  loadAchievements,
} from '../features/achievements/AchievementCelebration';
import achievementPlaceholder from '../features/achievements/assets/achievement-placeholder.webp';
import './achievements.css';

type Achievement = components['schemas']['AchievementPublic'];
const number = new Intl.NumberFormat('ru-RU');

export function AchievementsPage() {
  const achievements = useQuery({
    queryKey: achievementsQueryKey,
    queryFn: loadAchievements,
  });
  const collection = achievements.data;
  const categories = Array.from(new Set(collection?.items.map((item) => item.category) ?? [])).map(
    (name, index) => {
      const items = collection!.items.filter((item) => item.category === name);
      return {
        name,
        id: `achievement-category-${index}`,
        items,
        unlocked: items.filter((item) => item.unlocked).length,
      };
    },
  );

  return (
    <div className="achievements-page">
      <header className="achievements-header">
        <h1>Достижения</h1>
        <p>
          Учитесь в своём темпе. Коллекция отмечает устойчивые привычки и важные шаги, но не
          сравнивает вас с другими.
        </p>
      </header>

      {achievements.isPending ? (
        <AchievementsSkeleton />
      ) : achievements.isError || !collection ? (
        <div className="achievements-message" role="alert">
          <h2>Не удалось загрузить достижения</h2>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <Button loading={achievements.isFetching} onClick={() => void achievements.refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <>
          <div className="achievements-summary">
            <p className="achievements-total">
              Открыто <span>{number.format(collection.unlocked_count)}</span> из{' '}
              {number.format(collection.total_count)}
            </p>
            <div className="achievements-summary-progress">
              <span className="achievements-percent">
                {Math.round(ratio(collection.unlocked_count, collection.total_count) * 100)}%
              </span>
              <AchievementProgress
                label="Прогресс коллекции"
                value={collection.unlocked_count}
                target={collection.total_count}
              />
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="achievements-message">
              <h2>Достижений пока нет</h2>
              <p>Когда в коллекции появятся достижения, здесь будут их условия и ваш прогресс.</p>
            </div>
          ) : (
            <>
              <nav className="achievements-categories" aria-label="Категории достижений">
                {categories.map((category) => (
                  <a key={category.id} href={`#${category.id}`}>
                    {category.name}{' '}
                    <span>
                      {category.unlocked} из {category.items.length}
                    </span>
                  </a>
                ))}
              </nav>
              {categories.map((category) => (
                <section
                  key={category.id}
                  className="achievements-category"
                  aria-labelledby={category.id}
                >
                  <div className="achievements-category-heading">
                    <h2 id={category.id} tabIndex={-1}>
                      {category.name}
                    </h2>
                    <span>
                      {category.unlocked} из {category.items.length}
                    </span>
                  </div>
                  <ul className="achievements-grid">
                    {category.items.map((item) => (
                      <li key={item.code}>
                        <AchievementCard item={item} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AchievementCard({ item }: { item: Achievement }) {
  return (
    <article className="achievement-card" aria-labelledby={`achievement-${item.code}`}>
      <div className="achievement-illustration">
        <img src={achievementPlaceholder} alt="" width={512} height={512} loading="lazy" />
      </div>
      <h3 id={`achievement-${item.code}`}>{item.title}</h3>
      <p className="achievement-description">{item.description}</p>
      <div className="achievement-state">
        {item.unlocked ? (
          <p className="achievement-earned">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="m5 12 4 4L19 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Получено
          </p>
        ) : (
          <>
            <p>
              {number.format(item.progress)} из {number.format(item.target)}
            </p>
            <AchievementProgress
              label={`Прогресс: ${item.title}`}
              value={item.progress}
              target={item.target}
            />
          </>
        )}
      </div>
    </article>
  );
}

function ratio(value: number, target: number) {
  return Math.min(1, Math.max(0, value / Math.max(1, target)));
}

function AchievementProgress({
  label,
  value,
  target,
}: {
  label: string;
  value: number;
  target: number;
}) {
  return (
    <div
      className="achievement-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={Math.max(1, target)}
      aria-valuetext={`${number.format(value)} из ${number.format(target)}`}
    >
      <span style={{ transform: `scaleX(${ratio(value, target)})` }} />
    </div>
  );
}

function AchievementsSkeleton() {
  return (
    <div className="achievements-skeleton" aria-label="Загрузка достижений" aria-busy="true">
      <div className="achievements-skeleton-summary" />
      <div className="achievements-grid" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="achievements-skeleton-card" />
        ))}
      </div>
    </div>
  );
}
