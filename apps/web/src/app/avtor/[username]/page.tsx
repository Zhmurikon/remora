import { AuthorAchievements } from '../../../components/authors/AuthorAchievements';
import { PublicAnalytics } from '../../../components/analytics/PublicAnalytics';
import type { components } from '@remora/api-client';
import { pluralWithCount } from '@remora/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { JsonLd } from '../../../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../../lib/seo';
import { cachedPublicRead } from '../../../lib/cache';
import { AuthorAvatar } from './AuthorAvatar';
import './author-profile.css';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
type Profile = components['schemas']['AuthorProfile'];

// `null` = автор недоступен; кэшируется наравне с успешным ответом, см. lib/cache.ts.
const readProfile = cachedPublicRead(['public-author'], async (username: string) => {
  const response = await fetch(`${API_URL}/api/v1/authors/${encodeURIComponent(username)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Не удалось загрузить профиль автора');
  return (await response.json()) as Profile;
});

const loadProfile = cache(async (username: string): Promise<Profile> => {
  const profile = await readProfile(username);
  if (profile === null) notFound();
  return profile;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const profile = await loadProfile((await params).username);
  const name = profile.display_name || `@${profile.username}`;
  const description = `Публичные курсы автора ${name} в сервисе «Запоминальня».`;
  return {
    title: `${name} — автор курсов`,
    description,
    alternates: { canonical: `/avtor/${profile.username}` },
    openGraph: {
      title: `${name} — автор курсов`,
      description,
      type: 'profile',
      url: `/avtor/${profile.username}`,
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: name }],
    },
    twitter: { card: 'summary_large_image', title: `${name} — автор курсов`, description },
  };
}

export default async function AuthorPage({ params }: { params: Promise<{ username: string }> }) {
  const profile = await loadProfile((await params).username);
  const name = profile.display_name || `@${profile.username}`;
  const profileUrl = absoluteUrl(`/avtor/${profile.username}`);
  return (
    <main className="public-author">
      <PublicAnalytics path={`/avtor/${encodeURIComponent(profile.username)}`} />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          url: profileUrl,
          name: `${name} — автор курсов`,
          dateCreated: profile.joined_at,
          mainEntity: {
            '@type': 'Person',
            name,
            alternateName: `@${profile.username}`,
            url: profileUrl,
            image: profile.avatar_url || undefined,
          },
        }}
      />
      <header className="public-author-cover">
        <div className="public-author-width">
          <Link href="/kursy" className="public-author-link public-author-back">
            ← Каталог курсов
          </Link>
          <div className="public-author-identity">
            <AuthorAvatar name={name} src={profile.avatar_url} />
            <div>
              <p className="public-author-label">Автор курсов</p>
              <h1>{name}</h1>
              {profile.display_name && (
                <p className="public-author-username">@{profile.username}</p>
              )}
              <p className="public-author-joined">
                В «Запоминальне» с{' '}
                <time dateTime={profile.joined_at}>
                  {new Date(profile.joined_at).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}
                </time>
              </p>
            </div>
          </div>
          <nav className="public-author-sections" aria-label="Разделы профиля">
            <a href="#author-courses" className="public-author-link">
              Курсы <span>{profile.courses.length}</span>
            </a>
            <a href="#author-stats" className="public-author-link">
              Достижения
            </a>
          </nav>
        </div>
      </header>
      <div className="public-author-width public-author-body">
        <section aria-labelledby="author-courses" className="public-author-courses">
          <div className="public-author-section-heading">
            <h2 id="author-courses">Курсы автора</h2>
            <p>
              {pluralWithCount(profile.courses.length, [
                'публичный курс',
                'публичных курса',
                'публичных курсов',
              ])}
            </p>
          </div>
          {profile.courses.length === 0 ? (
            <div className="public-author-empty">
              <p>Публичных курсов пока нет.</p>
              <Link className="public-author-link" href="/kursy">
                Найти курс в каталоге →
              </Link>
            </div>
          ) : (
            <ul className="public-author-course-list">
              {profile.courses.map((course, index) => (
                <li key={course.id}>
                  <article className="public-author-course">
                    <span className="public-author-course-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="public-author-course-content">
                      <h3>
                        <Link href={`/kurs/${course.slug}`}>{course.title}</Link>
                      </h3>
                      {course.tags.length > 0 && (
                        <ul className="public-author-tags" aria-label="Темы курса">
                          {course.tags.map((tag) => (
                            <li key={tag}>#{tag}</li>
                          ))}
                        </ul>
                      )}
                      {course.description && (
                        <p className="public-author-course-description">{course.description}</p>
                      )}
                      <div className="public-author-course-meta">
                        <span>Карточек: {course.cards_count}</span>
                        <span>Сохранений: {course.saves_count}</span>
                        {course.languages.length > 0 && (
                          <span>Язык: {course.languages.join(', ').toUpperCase()}</span>
                        )}
                        <span>
                          Обновлён{' '}
                          <time dateTime={course.updated_at}>
                            {new Date(course.updated_at).toLocaleDateString('ru-RU', {
                              timeZone: 'UTC',
                            })}
                          </time>
                        </span>
                      </div>
                    </div>
                    <span className="public-author-course-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
        <AuthorAchievements stats={profile.stats} badges={profile.badges} />
      </div>
    </main>
  );
}
