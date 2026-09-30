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
import { HomeMotion } from '../components/home/HomeMotion';
import { HomeCatalog } from '../components/home/HomeCatalog';
import { HomeFaq } from '../components/home/HomeFaq';
import { HomeFinal } from '../components/home/HomeFinal';
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
  title: { absolute: `${title} | Remora` },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: `${title} | Remora`,
    description,
    url: '/',
    locale: 'ru_RU',
    siteName: 'Remora',
    images: [
      { url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Remora, карточки для запоминания' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} | Remora`,
    description,
    images: [DEFAULT_OG_IMAGE],
  },
};

export default function HomePage() {
  return (
    <div className="home">
      <HomeMotion />
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
      <div className="home-shell home-nav-shell">
        <HomeNav />
      </div>
      <main id="main-content">
        <section className="home-hero home-shell" aria-labelledby="home-title">
          <div className="home-hero-copy" data-home-hero-copy>
            <p className="home-eyebrow">Меньше зубрёжки. Больше понимания.</p>
            <h1 id="home-title">
              Карточки, которые помогают <span>вспомнить главное</span>
            </h1>
            <p className="home-hero-description">
              Собирайте материал из лекций, проверяйте себя и возвращайтесь к знаниям в нужный
              момент.
            </p>
            <div className="home-hero-actions">
              <a className="home-button home-hero-cta" href="#demo">
                Попробовать без регистрации
                <HomeIcon name="arrow" />
              </a>
              <a className="home-hero-link" href="#features">
                Посмотреть, как это работает
              </a>
            </div>
            <p className="home-free-note">Все режимы обучения бесплатны</p>
          </div>
          <div className="home-hero-demo" data-home-hero-demo>
            <HomeDemo />
          </div>
        </section>

        <div id="features" className="home-features home-shell">
          <div className="home-journey-heading" data-home-story>
            <p>Один материал. Несколько способов запомнить.</p>
            <h2>От первой заметки до уверенного ответа</h2>
          </div>
          <div className="home-story-rail" aria-hidden="true">
            <span data-home-story-progress />
          </div>
          <section
            className="home-feature home-mint home-story-card"
            aria-labelledby="notes-title"
            data-home-story
          >
            <div className="home-feature-copy">
              <span className="home-kicker">Ваши материалы</span>
              <h2 id="notes-title">
                Из конспекта
                <br />в карточки
              </h2>
              <p>
                Соберите главное из лекций. Добавьте свои вопросы и начните повторять, по одному
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
            className="home-feature home-lavender home-feature-reverse home-story-card"
            aria-labelledby="chat-title"
            data-home-story
          >
            <div className="home-feature-copy">
              <span className="home-kicker">Учёба с вами</span>
              <h2 id="chat-title">
                Учитесь
                <br />
                где удобно
              </h2>
              <p>
                Дома на сайте. По дороге на пару в Telegram или ВКонтакте. Ваши материалы и прогресс
                связаны с одним аккаунтом.
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

          <section
            className="home-modes home-story-card"
            aria-labelledby="modes-title"
            data-home-story
          >
            <div className="home-section-heading">
              <span className="home-kicker">Найдите свой способ</span>
              <h2 id="modes-title">Не только переворачивать карточки</h2>
              <p>
                Вспоминайте, выбирайте, пишите и слушайте.
                <br />
                Все пять режимов доступны бесплатно.
              </p>
            </div>
            <ModePreview />
          </section>

          <section
            className="home-feature home-peach home-story-card"
            aria-labelledby="repeat-title"
            data-home-story
          >
            <div className="home-feature-copy">
              <span className="home-kicker">Чтобы помнить дольше</span>
              <h2 id="repeat-title">
                Повторяйте
                <br />в нужный момент
              </h2>
              <p>
                Remora планирует интервальные повторения по вашим ответам. Сложное возвращается
                чаще, знакомое реже.
              </p>
              <p className="home-feature-detail">
                В основе алгоритм FSRS. Просто начните занятие, а расписание возьмём на себя.
              </p>
              <a className="home-link" href="#demo">
                Начать с короткого упражнения
                <HomeIcon name="arrow" />
              </a>
            </div>
            <RepetitionIllustration />
          </section>

          <section
            className="home-feature home-neutral home-feature-reverse home-story-card"
            aria-labelledby="import-title"
            data-home-story
          >
            <div className="home-feature-copy">
              <span className="home-kicker">Лёгкий старт</span>
              <h2 id="import-title">
                Материалы уже есть?
                <br />
                Перенесите их
              </h2>
              <p>
                Загрузите таблицу или набор Anki. Проверьте термины и определения перед импортом и
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

          <section
            className="home-feature home-lavender home-story-card"
            aria-labelledby="ai-title"
            data-home-story
          >
            <div className="home-feature-copy">
              <span className="home-kicker">Ваш привычный помощник</span>
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
                Для помощников с поддержкой MCP или API. Подключение находится в настройках
                аккаунта.
              </p>
              <a className="home-link" href={`${APP_URL}/settings`}>
                Настроить подключение
                <HomeIcon name="arrow" />
              </a>
            </div>
            <AiIllustration />
          </section>
        </div>

        <HomeCatalog />

        <HomeFaq />

        <HomeFinal />
      </main>
      <footer className="home-footer home-shell">
        <a className="home-brand" href="/" aria-label="Remora, главная">
          <FishMark />
          Remora
        </a>
        <span>Учиться в своём темпе.</span>
        <HomeTheme />
        <nav aria-label="Навигация в подвале">
          <a href="/kursy">Каталог</a>
          <a href="/blog">Блог</a>
          <a href="/podborki">Подборки</a>
          <a href="#questions">Вопросы и ответы</a>
          <PublicAuthLink />
        </nav>
      </footer>
    </div>
  );
}
import { PublicAuthLink } from '../components/auth/PublicSession';
