import type { components } from '@remora/api-client';
import Image from 'next/image';
import './author-achievements.css';

type Profile = components['schemas']['AuthorProfile'];
const number = new Intl.NumberFormat('ru-RU');

function badgeArtwork(code: string) {
  return code === 'published_1'
    ? '/achievements/achievement-first-published-course.webp'
    : '/achievements/achievement-placeholder.webp';
}

export function AuthorAchievements({ stats, badges }: Pick<Profile, 'stats' | 'badges'>) {
  const metrics = [
    ['Публикации', number.format(stats.publications)],
    ['Сохранения', number.format(stats.saves_received)],
    ['Лайки', number.format(stats.likes_received)],
    ['Изучено карточек', number.format(stats.cards_studied)],
    ['Серия занятий', `${number.format(stats.current_streak_days)} дн.`],
  ] as const;

  return (
    <section className="author-achievements" aria-labelledby="author-stats">
      <div className="author-achievements-heading">
        <h2 id="author-stats">Достижения</h2>
        <span>Наград: {number.format(badges.length)}</span>
      </div>
      <dl className="author-achievements-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {badges.length > 0 ? (
        <ul className="author-achievements-list">
          {badges.map((badge) => (
            <li key={badge.code}>
              <div className="author-achievement-art">
                <Image
                  src={badgeArtwork(badge.code)}
                  alt=""
                  width={512}
                  height={512}
                  sizes="160px"
                  data-artwork={badge.code === 'published_1' ? 'individual' : 'placeholder'}
                />
              </div>
              <h3>{badge.title}</h3>
              <p className="author-achievement-earned">
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
            </li>
          ))}
        </ul>
      ) : (
        <p className="author-achievements-empty">У автора пока нет наград.</p>
      )}
    </section>
  );
}
