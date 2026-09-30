import { FishMark } from '@remora/ui';
import { HomeIcon } from './HomeIcon';

const topics = [
  { className: 'home-final-topic-photosynthesis', label: 'Фотосинтез', icon: 'leaf' as const },
  { className: 'home-final-topic-knowledge', label: 'Knowledge', icon: 'globe' as const },
  { className: 'home-final-topic-history', label: 'История', icon: 'book' as const },
  { className: 'home-final-topic-algorithm', label: 'Алгоритм', icon: 'cards' as const },
];

export function HomeFinal() {
  return (
    <section className="home-final home-shell" aria-labelledby="final-title" data-home-final>
      <div className="home-final-field" aria-hidden="true" />
      <svg
        className="home-final-memory"
        data-home-final-memory
        viewBox="0 0 1600 560"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g>
          <path
            pathLength="1"
            d="M-30 342C184 320 284 450 464 330S620 74 788 182 954 448 1110 326 1318 98 1640 164"
          />
          <path pathLength="1" d="M-20 112C174 72 242 138 344 220S492 370 612 330" />
          <path pathLength="1" d="M404 -20C386 94 398 150 464 218" />
          <path pathLength="1" d="M790 182C876 82 950 44 1058 34" />
          <path pathLength="1" d="M1110 326C1220 386 1298 438 1392 590" />
          <path pathLength="1" d="M1320 104C1402 220 1492 250 1640 244" />
        </g>
        <g className="home-final-memory-dots">
          <circle cx="344" cy="220" r="7" />
          <circle cx="464" cy="330" r="6" />
          <circle cx="790" cy="182" r="7" />
          <circle cx="1110" cy="326" r="7" />
          <circle cx="1320" cy="104" r="6" />
        </g>
      </svg>

      <div className="home-final-topics" aria-hidden="true">
        {topics.map((topic) => (
          <div
            className={`home-final-topic ${topic.className}`}
            data-home-final-card
            key={topic.label}
          >
            <strong>{topic.label}</strong>
            <HomeIcon name={topic.icon} />
            <span />
            <span />
            <i>
              <HomeIcon name="check" />
            </i>
          </div>
        ))}
      </div>

      <div className="home-final-content">
        <FishMark />
        <h2 id="final-title">
          Сегодня первые карточки.
          <br />
          Завтра чуть больше знаний.
        </h2>
        <p>Начните со своей темы. Всё остальное придёт постепенно.</p>
        <a href="/register" className="home-button">
          Создать свои карточки
          <HomeIcon name="arrow" />
        </a>
        <span>Обучение и повторения бесплатны</span>
      </div>
    </section>
  );
}
