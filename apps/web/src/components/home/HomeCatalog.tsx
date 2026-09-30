import Image from 'next/image';
import { HomeIcon } from './HomeIcon';

const topics = [
  {
    slug: 'анатомия',
    title: 'Анатомия',
    description: 'Тело человека, системы, термины',
    image: '/home/catalog/anatomy.png',
    className: 'home-catalog-card-anatomy',
  },
  {
    slug: 'английский',
    title: 'Английский',
    description: 'Слова, грамматика, реальные ситуации',
    image: '/home/catalog/english.png',
    className: 'home-catalog-card-english',
  },
  {
    slug: 'история',
    title: 'История',
    description: 'События, личности, причины и последствия',
    image: '/home/catalog/history.png',
    className: 'home-catalog-card-history',
  },
  {
    slug: 'программирование',
    title: 'Программирование',
    description: 'Языки, инструменты, практические проекты',
    image: '/home/catalog/programming.png',
    className: 'home-catalog-card-programming',
  },
] as const;

export function HomeCatalog() {
  return (
    <section
      id="catalog"
      className="home-catalog home-shell"
      aria-labelledby="catalog-title"
      data-home-catalog
    >
      <svg
        className="home-catalog-map"
        viewBox="0 0 1600 760"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <g className="home-catalog-map-routes">
          <path d="M-70 660C220 835 442 785 610 555S867 165 1060-12" />
          <path d="M878 405C948 298 1008 234 1124 210S1320 204 1398 122" />
          <path d="M885 407C1015 370 1113 391 1214 445S1390 512 1544 438" />
          <path d="M1120 211C1198 236 1228 286 1262 350" />
          <path d="M1214 445C1182 552 1200 640 1332 694S1537 677 1630 581" />
        </g>
        <g className="home-catalog-map-nodes">
          <circle cx="878" cy="405" r="9" />
          <circle cx="1120" cy="211" r="9" />
          <circle cx="1262" cy="350" r="9" className="home-catalog-map-node-accent" />
          <circle cx="1214" cy="445" r="9" />
          <circle cx="1332" cy="694" r="9" />
        </g>
      </svg>

      <div className="home-catalog-copy">
        <span className="home-kicker">Можно начать с готового</span>
        <h2 id="catalog-title">Найдите свою тему</h2>
        <p>Посмотрите, какие курсы и карточки уже опубликовало сообщество.</p>

        <form action="/kursy" method="get" role="search" className="home-search">
          <label className="sr-only" htmlFor="home-search">
            Тема курса
          </label>
          <HomeIcon name="search" />
          <input
            id="home-search"
            name="q"
            type="search"
            maxLength={200}
            placeholder="Например, анатомия или английский"
          />
          <button type="submit" className="home-button">
            Найти курсы
            <HomeIcon name="arrow" />
          </button>
        </form>

        <a className="home-link home-catalog-link" href="/kursy">
          Весь каталог
          <HomeIcon name="arrow" />
        </a>
      </div>

      <div className="home-catalog-scene" aria-label="Популярные темы каталога">
        {topics.map((topic) => (
          <a
            key={topic.slug}
            className={`home-catalog-card ${topic.className}`}
            href={`/kursy?q=${encodeURIComponent(topic.slug)}`}
            data-home-catalog-card
          >
            <Image src={topic.image} alt="" width={512} height={512} sizes="120px" />
            <span>
              <strong>{topic.title}</strong>
              <small>{topic.description}</small>
            </span>
          </a>
        ))}

        <span className="home-catalog-note home-catalog-note-understand">
          Понимайте
          <br />
          сложное
        </span>
        <span className="home-catalog-note home-catalog-note-speak">
          Говорите
          <br />
          увереннее
        </span>
        <span className="home-catalog-note home-catalog-note-connect">
          Находите
          <br />
          новые связи
        </span>
        <span className="home-catalog-note home-catalog-note-create">
          Создавайте
          <br />
          свои проекты
        </span>
      </div>
    </section>
  );
}
