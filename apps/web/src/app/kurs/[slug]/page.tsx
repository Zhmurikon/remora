import type { components } from '@remora/api-client';
import { ArticleContent, Badge } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PublicCourseCards } from './PublicCourseCards';
import { CourseLikeButton } from './CourseLikeButton';
import { ReportCourseButton } from './ReportCourseButton';
import { SaveOriginalButton } from './SaveOriginalButton';
import { JsonLd } from '../../../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../../lib/seo';
import { cachedPublicRead } from '../../../lib/cache';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';
type Course = components['schemas']['CourseDetail'];
type Material = components['schemas']['PublicSet'];
type SearchCourse = components['schemas']['CourseSearchItem'];

// `null` = курс недоступен. Это значение кэшируется наравне с успешным,
// поэтому снятие с публикации доходит до страницы за срок кэша, а не «никогда».
const readCourse = cachedPublicRead(['public-course'], async (slug: string) => {
  const response = await fetch(`${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Не удалось загрузить курс');
  return (await response.json()) as Course;
});

const loadCourse = cache(async (slug: string): Promise<Course> => {
  const course = await readCourse(slug);
  if (course === null) notFound();
  return course;
});

const loadMaterial = cachedPublicRead(
  ['public-course-article'],
  async (slug: string, id: string): Promise<Material | null> => {
    const response = await fetch(
      `${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/articles/${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('Не удалось загрузить материалы курса');
    return (await response.json()) as Material;
  },
);

const loadRelated = cachedPublicRead(['public-course-related'], async (slug: string) => {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/related?limit=4`,
      { cache: 'no-store' },
    );
    return response.ok ? ((await response.json()) as SearchCourse[]) : [];
  } catch {
    return [];
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const course = await loadCourse((await params).slug);
  const description = course.description || `Учебный курс «${course.title}» на Remora.`;
  return {
    title: course.title,
    description,
    robots: course.is_listed ? { index: true, follow: true } : { index: false, follow: false },
    alternates: { canonical: `/kurs/${course.slug}` },
    openGraph: {
      title: course.title,
      description,
      type: 'article',
      url: `/kurs/${course.slug}`,
      authors: [course.author.display_name || course.author.username],
      publishedTime: course.published_at ?? undefined,
      modifiedTime: course.updated_at,
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: course.title }],
    },
    twitter: { card: 'summary_large_image', title: course.title, description },
  };
}

export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const course = await loadCourse((await params).slug);
  const related = await loadRelated(course.slug);
  const entries = await Promise.all(
    course.sections
      .flatMap((section) => section.articles)
      .map(async (article) => [article.id, await loadMaterial(course.slug, article.id)] as const),
  );
  const materials = new Map(entries);
  const courseUrl = absoluteUrl(`/kurs/${course.slug}`);
  const authorName = course.author.display_name || `@${course.author.username}`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        '@id': `${courseUrl}#course`,
        url: courseUrl,
        name: course.title,
        description: course.description || `Учебный курс «${course.title}» на Remora.`,
        datePublished: course.published_at,
        dateModified: course.updated_at,
        keywords: course.tags,
        provider: { '@type': 'Organization', name: 'Remora', url: absoluteUrl('/') },
        author: {
          '@type': 'Person',
          name: authorName,
          url: absoluteUrl(`/avtor/${course.author.username}`),
        },
        hasPart: course.sections.flatMap((section) =>
          section.articles.map((article) => ({
            '@type': 'LearningResource',
            name: article.title,
            url: `${courseUrl}#article-${article.id}`,
          })),
        ),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Каталог курсов', item: absoluteUrl('/kursy') },
          { '@type': 'ListItem', position: 3, name: course.title, item: courseUrl },
        ],
      },
    ],
  };
  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 py-6 sm:px-8">
      <JsonLd data={structuredData} />
      <nav className="flex items-center justify-between" aria-label="Основная навигация">
        <Link
          href="/"
          className="text-primary inline-flex min-h-11 items-center text-xl font-semibold"
        >
          Remora
        </Link>
        <Link href="/kursy" className="text-primary inline-flex min-h-11 items-center underline">
          Каталог курсов
        </Link>
        <Link href="/login" className="text-primary inline-flex min-h-11 items-center underline">
          Войти
        </Link>
      </nav>
      <header className="max-w-3xl py-12">
        <p className="text-primary text-sm font-medium">Учебный курс</p>
        <h1 className="mt-3 break-words text-4xl font-semibold tracking-tight sm:text-5xl">
          {course.title}
        </h1>
        {course.description && (
          <p className="text-fg-muted mt-5 whitespace-pre-wrap break-words text-lg leading-relaxed">
            {course.description}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {course.tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
        <CourseLikeButton
          slug={course.slug}
          initialCount={course.likes_count}
          initialLiked={course.liked_by_me}
        />
        <div className="mt-3">
          <SaveOriginalButton targetType="course" targetId={course.id} label="Сохранить курс" />
        </div>
        <p className="text-fg-muted mt-3 text-sm">Сохранений: {course.saves_count}</p>
        <Link
          className="text-primary mt-2 inline-flex min-h-11 items-center underline"
          href={`/avtor/${course.author.username}`}
        >
          Автор: {course.author.display_name || `@${course.author.username}`}
        </Link>
        <a
          className="text-primary mt-4 inline-flex min-h-11 items-center underline"
          href={`${APP_URL}/courses/copy/${course.slug}`}
        >
          Скопировать курс и учиться
        </a>
        <ReportCourseButton slug={course.slug} />
      </header>
      <div className="space-y-10 pb-12">
        {course.sections.map((section) => (
          <section key={section.id} className="space-y-6">
            <h2 className="text-2xl font-semibold">{section.title}</h2>
            {section.articles.map((article) => {
              const material = materials.get(article.id);
              if (!material) return null;
              return (
                <article key={article.id} id={`article-${article.id}`} className="space-y-4">
                  <header>
                    <h3 className="break-words text-xl font-semibold">{article.title}</h3>
                    <p className="text-fg-muted mt-2 text-sm">
                      Автор: {material.author.display_name || material.author.username} · Карточек:{' '}
                      {material.cards_count}
                    </p>
                  </header>
                  {article.body && (
                    <ArticleContent
                      value={article.body}
                      media={Object.fromEntries((article.media ?? []).map((item) => [item.id, item]))}
                    />
                  )}
                  <div className="flex flex-wrap gap-3">
                    <SaveOriginalButton
                      targetType="article"
                      targetId={article.id}
                      label="Сохранить статью"
                    />
                    <SaveOriginalButton
                      targetType="set"
                      targetId={article.set_id}
                      label="Сохранить набор"
                    />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <a
                      className="text-primary inline-flex min-h-11 items-center underline"
                      href={`${APP_URL}/courses/copy/${course.slug}?article=${article.id}`}
                    >
                      Скопировать статью с карточками
                    </a>
                    <a
                      className="text-primary inline-flex min-h-11 items-center underline"
                      href={`${APP_URL}/courses/copy/${course.slug}?set=${article.set_id}`}
                    >
                      Скопировать только набор
                    </a>
                  </div>
                  <PublicCourseCards initial={material} slug={course.slug} articleId={article.id} />
                </article>
              );
            })}
          </section>
        ))}
      </div>
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="border-border border-t py-10">
          <h2 id="related-title" className="text-2xl font-semibold">
            Похожие курсы
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((item) => (
              <article key={item.id} className="border-border bg-surface rounded-xl border p-4">
                <h3 className="font-semibold">
                  <Link
                    className="inline-flex min-h-11 items-center hover:underline"
                    href={`/kurs/${item.slug}`}
                  >
                    {item.title}
                  </Link>
                </h3>
                <p className="text-fg-muted mt-2 text-sm">
                  Карточек: {item.cards_count} · Сохранений: {item.saves_count}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
