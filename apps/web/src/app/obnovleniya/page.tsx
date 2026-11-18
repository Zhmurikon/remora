import type { Metadata } from 'next';
import { JsonLd } from '../../components/JsonLd';
import { PublicAnalytics } from '../../components/analytics/PublicAnalytics';
import { HomeTheme } from '../../components/home/HomeTheme';
import { LandingHeader } from '../../components/landing/LandingHeader';
import { readLandingChrome } from '../../components/landing/readLandingChrome';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../lib/seo';
import '../../components/landing/chrome.css';
import { updates } from './data';
import './updates.css';

const title = 'История обновлений';
const description =
  'История важных изменений Запоминальни: новые способы готовиться к занятиям и проверять знания.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/obnovleniya' },
  openGraph: {
    type: 'website',
    title: `${title} — Запоминальня`,
    description,
    url: '/obnovleniya',
    locale: 'ru_RU',
    siteName: 'Запоминальня',
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: title }],
  },
  twitter: { card: 'summary_large_image', title, description, images: [DEFAULT_OG_IMAGE] },
};

export default function UpdatesPage() {
  const { header, footer } = readLandingChrome();

  return (
    <div className="updates-route">
      <PublicAnalytics path="/obnovleniya" />
      <a className="updates-skip" href="#main-content">
        Перейти к истории
      </a>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: absoluteUrl('/obnovleniya'),
          inLanguage: 'ru',
          dateModified: updates[0].dateTime,
          hasPart: updates.map((update) => ({
            '@type': 'Article',
            headline: update.title,
            datePublished: update.dateTime,
            description: update.description,
          })),
        }}
      />
      <LandingHeader html={header} />
      <main id="main-content" className="updates-main">
        <header className="updates-intro">
          <h1>История обновлений</h1>
          <p>
            Важные изменения Запоминальни — от новых способов учиться до улучшений готовых
            материалов.
          </p>
        </header>

        <ol className="updates-list" aria-label="Обновления в обратном хронологическом порядке">
          {updates.map((update) => (
            <li key={update.dateTime}>
              <time dateTime={update.dateTime}>{update.date}</time>
              <article>
                <h2>{update.title}</h2>
                <p>{update.description}</p>
              </article>
            </li>
          ))}
        </ol>

        <div className="updates-afterword">
          <a href="/#news">Вернуться к новостям на главной</a>
          <HomeTheme systemLabel="Системная" />
        </div>
      </main>
      <div className="landing-chrome" dangerouslySetInnerHTML={{ __html: footer }} />
    </div>
  );
}
