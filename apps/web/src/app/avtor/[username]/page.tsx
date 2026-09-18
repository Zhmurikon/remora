import type { components } from '@remora/api-client';
import { Badge, Card } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { JsonLd } from '../../../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../../lib/seo';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
type Profile = components['schemas']['AuthorProfile'];

const loadProfile = cache(async (username: string): Promise<Profile> => {
  const response = await fetch(`${API_URL}/api/v1/authors/${encodeURIComponent(username)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('Не удалось загрузить профиль автора');
  return response.json() as Promise<Profile>;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const profile = await loadProfile((await params).username);
  const name = profile.display_name || `@${profile.username}`;
  const description = `Публичные курсы автора ${name} на Remora.`;
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
  const stats = [
    ['Публикации', profile.stats.publications],
    ['Сохранения', profile.stats.saves_received],
    ['Лайки', profile.stats.likes_received],
    ['Изучено карточек', profile.stats.cards_studied],
    ['Серия занятий', `${profile.stats.current_streak_days} дн.`],
  ] as const;
  const profileUrl = absoluteUrl(`/avtor/${profile.username}`);
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-6 sm:px-8">
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
      <nav aria-label="Основная навигация" className="flex items-center justify-between">
        <Link
          href="/"
          className="text-primary inline-flex min-h-11 items-center text-xl font-semibold"
        >
          Remora
        </Link>
        <Link href="/kursy" className="text-primary inline-flex min-h-11 items-center underline">
          Каталог курсов
        </Link>
      </nav>
      <header className="py-10 sm:py-12">
        <p className="text-primary text-sm font-medium">Автор курсов</p>
        <h1 className="mt-3 break-words text-4xl font-semibold tracking-tight sm:text-5xl">
          {name}
        </h1>
        {profile.display_name && <p className="text-fg-muted mt-2">@{profile.username}</p>}
        <p className="text-fg-muted mt-3 text-sm">
          На Remora с {new Date(profile.joined_at).toLocaleDateString('ru-RU', { timeZone: 'UTC' })}
        </p>
      </header>
      <section aria-labelledby="author-stats" className="pb-10">
        <h2 id="author-stats" className="text-2xl font-semibold">
          Достижения
        </h2>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map(([label, value]) => (
            <Card key={label}>
              <dt className="text-fg-muted text-sm">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold">{value}</dd>
            </Card>
          ))}
        </dl>
        {profile.badges.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {profile.badges.map((badge) => (
              <Badge key={badge}>{badge}</Badge>
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="author-courses" className="pb-12">
        <h2 id="author-courses" className="text-2xl font-semibold">
          Курсы автора
        </h2>
        {profile.courses.length === 0 ? (
          <Card className="mt-5">
            <p className="text-fg-muted">Публичных курсов пока нет.</p>
          </Card>
        ) : (
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {profile.courses.map((course) => (
              <Card key={course.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {course.tags.map((tag) => (
                    <Badge key={tag}>#{tag}</Badge>
                  ))}
                </div>
                <h3 className="text-xl font-semibold">
                  <Link
                    className="inline-flex min-h-11 items-center hover:underline"
                    href={`/kurs/${course.slug}`}
                  >
                    {course.title}
                  </Link>
                </h3>
                {course.description && (
                  <p className="text-fg-muted line-clamp-3">{course.description}</p>
                )}
                <p className="text-fg-muted mt-auto text-sm">
                  Карточек: {course.cards_count} · Сохранений: {course.saves_count}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
