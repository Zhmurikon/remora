import type { Metadata } from 'next';
import { FishMark } from '@remora/ui';
import { JsonLd } from '../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../lib/seo';
import { HomeDemo } from '../components/home/HomeDemo';
import { HomeBackground } from '../components/home/HomeBackground';
import { HomeNav } from '../components/home/HomeNav';
import { HomeTheme } from '../components/home/HomeTheme';
import { HomeIcon } from '../components/home/HomeIcon';
import { ModePreview } from '../components/home/ModePreview';
import {
  AiIllustration,
  ChatIllustration,
  ImportIllustration,
  NotesIllustration,
  RepetitionIllustration,
} from '../components/home/HomeIllustrations';
import './home.css';

const title = 'Карточки для запоминания и учёбы онлайн';
const description =
  'Создавайте флеш-карточки, проверяйте себя и повторяйте материал к экзаменам. Бесплатные режимы обучения. Попробуйте Remora без регистрации.';
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');

export const metadata: Metadata = {
  title: { absolute: `${title} — Remora` },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: `${title} — Remora`,
    description,
    url: '/',
    locale: 'ru_RU',
    siteName: 'Remora',
    images: [
      { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Remora — карточки для запоминания' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} — Remora`,
    description,
    images: [DEFAULT_OG_IMAGE],
  },
};

const faqs = [
  [
    'Обучение действительно бесплатное?',
    'Да. Все пять режимов обучения и повторения доступны бесплатно. Можно учиться по своим наборам без ограничения числа повторений.',
  ],
  [
    'Как добавить свои материалы?',
    'Создайте карточки вручную или импортируйте CSV, TSV либо набор Anki. Перед сохранением можно проверить результат и исправить карточки. Теорию и наборы можно объединить в курс.',
  ],
  [
    'Можно подключить свою нейросеть?',
    'Да, если ваш ИИ-помощник поддерживает MCP или работу с API. Подключение настраивается в кабинете, в разделе «API и ИИ-агенты». Модель работает на стороне вашего помощника; её доступ и стоимость зависят от выбранного сервиса.',
  ],
  [
    'Как учиться в Telegram и ВКонтакте?',
    'Зарегистрируйтесь в Remora и привяжите бота в настройках аккаунта. После этого в чате можно открыть свои материалы и начать обучение. Ответы учитываются в общем учебном прогрессе.',
  ],
  [
    'Сохранится ли результат демо?',
    'Демо работает прямо на этой странице без аккаунта. Его результат не сохраняется после перезагрузки. Для постоянного учебного прогресса зарегистрируйтесь и начните занятие по своему набору.',
  ],
];

export default function HomePage() {
  return (
    <div className="home">
      <HomeBackground />
      <a className="home-skip" href="#main-content">
        Перейти к содержимому
      </a>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${absoluteUrl('/')}#organization`,
              name: 'Remora',
              url: absoluteUrl('/'),
            },
            {
              '@type': 'WebSite',
              name: 'Remora',
              url: absoluteUrl('/'),
              inLanguage: 'ru',
              description,
              publisher: { '@id': `${absoluteUrl('/')}#organization` },
            },
          ],
        }}
      />
      <div className="home-shell">
        <HomeNav />
      </div>
      <main id="main-content">
        <section className="home-hero home-shell" aria-labelledby="home-title">
          <p className="home-eyebrow">
            <span />
            Меньше зубрёжки. Больше понимания.
          </p>
          <h1 id="home-title">
            Карточки для запоминания —<br />
            <span>к экзамену и надолго</span>
          </h1>
          <p className="home-hero-description">
            Собирайте главное из лекций, проверяйте себя
            <br className="home-desktop-break" /> и повторяйте материал в своём темпе.
          </p>
          <a className="home-button home-hero-cta" href="#demo">
            Попробовать без регистрации
            <HomeIcon name="arrow" />
          </a>
          <p className="home-free-note">Все режимы обучения бесплатны</p>
          <HomeDemo />
        </section>

        <div id="features" className="home-features home-shell">
          <section className="home-feature home-mint" aria-labelledby="notes-title">
            <div className="home-feature-copy">
              <span className="home-kicker">01 / Ваши материалы</span>
              <h2 id="notes-title">
                Из конспекта
                <br />в карточки
              </h2>
              <p>
                Соберите главное из лекций. Добавьте свои вопросы и начните повторять — по одному
                понятному шагу за раз.
              </p>
              <a className="home-link" href="/register">
                Создать первые карточки
                <HomeIcon name="arrow" />
              </a>
            </div>
            <NotesIllustration />
          </section>

          <section
            className="home-feature home-lavender home-feature-reverse"
            aria-labelledby="chat-title"
          >
            <div className="home-feature-copy">
              <span className="home-kicker">02 / Учёба с вами</span>
              <h2 id="chat-title">
                Учитесь
                <br />
                где удобно
              </h2>
              <p>
                Дома — на сайте. По дороге на пару — в Telegram или ВКонтакте. Ваши материалы и
                прогресс связаны с одним аккаунтом.
              </p>
              <div className="home-platforms">
                <span>
                  <HomeIcon name="telegram" />
                  Telegram
                </span>
                <span className="home-vk-label">
                  VK <span>ВКонтакте</span>
                </span>
              </div>
              <a className="home-link" href={`${APP_URL}/settings`}>
                Подключить бота в настройках
                <HomeIcon name="arrow" />
              </a>
            </div>
            <ChatIllustration />
          </section>

          <section className="home-modes" aria-labelledby="modes-title">
            <div className="home-section-heading">
              <span className="home-kicker">03 / Найдите свой способ</span>
              <h2 id="modes-title">Не только переворачивать карточки</h2>
              <p>
                Вспоминайте, выбирайте, пишите и слушайте.
                <br />
                Все пять режимов доступны бесплатно.
              </p>
            </div>
            <ModePreview />
          </section>

          <section className="home-feature home-peach" aria-labelledby="repeat-title">
            <div className="home-feature-copy">
              <span className="home-kicker">04 / Чтобы помнить дольше</span>
              <h2 id="repeat-title">
                Повторяйте
                <br />в нужный момент
              </h2>
              <p>
                Remora планирует интервальные повторения по вашим ответам. Сложное возвращается
                чаще, знакомое — реже.
              </p>
              <p className="home-feature-detail">
                В основе — алгоритм FSRS. Просто начните занятие, а расписание возьмём на себя.
              </p>
              <a className="home-link" href="#demo">
                Начать с короткого упражнения
                <HomeIcon name="arrow" />
              </a>
            </div>
            <RepetitionIllustration />
          </section>

          <section
            className="home-feature home-neutral home-feature-reverse"
            aria-labelledby="import-title"
          >
            <div className="home-feature-copy">
              <span className="home-kicker">05 / Лёгкий старт</span>
              <h2 id="import-title">
                Материалы уже есть?
                <br />
                Перенесите их
              </h2>
              <p>
                Загрузите таблицу или набор Anki. Проверьте термины и определения перед импортом — и
                продолжайте учиться.
              </p>
              <div className="home-format-tags">
                <span>CSV</span>
                <span>TSV</span>
                <span>Anki</span>
              </div>
              <a className="home-link" href="/register">
                Добавить свои материалы
                <HomeIcon name="arrow" />
              </a>
            </div>
            <ImportIllustration />
          </section>

          <section className="home-feature home-lavender" aria-labelledby="ai-title">
            <div className="home-feature-copy">
              <span className="home-kicker">06 / Ваш привычный помощник</span>
              <h2 id="ai-title">
                Своя нейросеть.
                <br />
                Ваши карточки.
              </h2>
              <p>
                Подключите своего ИИ-помощника к Remora. Попросите его подготовить курс по
                конспекту, проверьте результат и начните учиться.
              </p>
              <p className="home-feature-detail">
                Для помощников с поддержкой MCP или API. Подключение — в настройках аккаунта.
              </p>
              <a className="home-link" href={`${APP_URL}/settings`}>
                Настроить подключение
                <HomeIcon name="arrow" />
              </a>
            </div>
            <AiIllustration />
          </section>
        </div>

        <section id="catalog" className="home-catalog home-shell" aria-labelledby="catalog-title">
          <div className="home-section-heading">
            <span className="home-kicker">Можно начать с готового</span>
            <h2 id="catalog-title">Найдите свою тему</h2>
            <p>
              Посмотрите, какие курсы и карточки
              <br />
              уже опубликовало сообщество.
            </p>
          </div>
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
          <a className="home-link" href="/kursy">
            Посмотреть весь каталог
            <HomeIcon name="arrow" />
          </a>
        </section>

        <section id="questions" className="home-faq home-shell" aria-labelledby="faq-title">
          <div>
            <span className="home-kicker">Перед началом</span>
            <h2 id="faq-title">
              Остались <br />
              вопросы?
            </h2>
            <FishMark className="home-faq-fish" />
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="home-final home-shell" aria-labelledby="final-title">
          <FishMark />
          <h2 id="final-title">
            Сегодня — первые карточки.
            <br />
            Завтра — чуть больше знаний.
          </h2>
          <p>Начните со своей темы. Всё остальное — постепенно.</p>
          <a href="/register" className="home-button">
            Создать свои карточки
            <HomeIcon name="arrow" />
          </a>
          <span>Обучение и повторения — бесплатно</span>
        </section>
      </main>
      <footer className="home-footer home-shell">
        <a className="home-brand" href="/" aria-label="Remora — главная">
          <FishMark />
          Remora
        </a>
        <span>Учиться в своём темпе.</span>
        <HomeTheme />
        <nav aria-label="Навигация в подвале">
          <a href="/kursy">Каталог</a>
          <a href="/blog">Блог</a>
          <a href="#questions">Вопросы и ответы</a>
          <a href="/login">Войти</a>
        </nav>
      </footer>
    </div>
  );
}
