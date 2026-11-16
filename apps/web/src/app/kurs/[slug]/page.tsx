import { PublicAnalytics } from '../../../components/analytics/PublicAnalytics';
import type { components } from '@remora/api-client';
import { ArticleContentServer } from '@remora/ui';
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
import Image from 'next/image';
import { pluralWithCount } from '@remora/core';
import { CourseReader } from './CourseReader';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173';
type Course = components['schemas']['CourseDetail'];
type Material = components['schemas']['PublicSet'];
type SearchCourse = components['schemas']['CourseSearchItem'];

const readCourse = async (slug: string) => {
  const response = await fetch(`${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Не удалось загрузить курс');
  return (await response.json()) as Course;
};

const loadCourse = cache(async (slug: string): Promise<Course> => {
  const course = await readCourse(slug);
  if (course === null) notFound();
  return course;
});

const loadMaterial = cache(async (slug: string, id: string): Promise<Material | null> => {
  const response = await fetch(
    `${API_URL}/api/v1/courses/public/${encodeURIComponent(slug)}/articles/${encodeURIComponent(id)}`,
    { cache: 'no-store' },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Не удалось загрузить материалы курса');
  return (await response.json()) as Material;
});

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
  const description =
    course.description || `Учебный курс «${course.title}» в сервисе «Запоминальня».`;
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
  const sections = course.sections.map((section) => ({
    ...section,
    articles: section.articles.filter((article) => materials.get(article.id)),
  }));
  const outline = sections
    .filter((section) => section.articles.length)
    .map((section) => ({
      id: section.id,
      title: section.title,
      articles: section.articles.map(({ id, title }) => ({ id, title })),
    }));
  const articleCount = outline.reduce((total, section) => total + section.articles.length, 0);
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
        description:
          course.description || `Учебный курс «${course.title}» в сервисе «Запоминальня».`,
        datePublished: course.published_at,
        dateModified: course.updated_at,
        keywords: course.tags,
        provider: { '@type': 'Organization', name: 'Запоминальня', url: absoluteUrl('/') },
        author: {
          '@type': 'Person',
          name: authorName,
          url: absoluteUrl(`/avtor/${course.author.username}`),
        },
        hasPart: outline.flatMap((section) =>
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
    <main className="course-detail">
      {course.is_listed && <PublicAnalytics path={`/kurs/${encodeURIComponent(course.slug)}`} />}
      <JsonLd data={structuredData} />
      <header className="course-cover">
        <div className="course-width">
          <Link className="course-back" href="/kursy">
            ← Каталог курсов
          </Link>
          <div className="course-cover-grid">
            <div>
              <p className="course-label">Учебный курс</p>
              <h1>{course.title}</h1>
              {course.description && <p className="course-intro">{course.description}</p>}
              <div className="course-byline">
                <Link href={`/avtor/${course.author.username}`}>{authorName}</Link>
                {!!outline.length && (
                  <span>{pluralWithCount(outline.length, ['раздел', 'раздела', 'разделов'])}</span>
                )}
                {!!articleCount && (
                  <span>{pluralWithCount(articleCount, ['статья', 'статьи', 'статей'])}</span>
                )}
              </div>
              {!!course.tags.length && (
                <div className="course-topic-tags">
                  {course.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              )}
              <div className="course-actions">
                <a className="course-primary" href={`${APP_URL}/courses/copy/${course.slug}`}>
                  Скопировать курс и учиться
                </a>
                <SaveOriginalButton
                  targetType="course"
                  targetId={course.id}
                  label="Сохранить курс"
                />
              </div>
              <div className="course-reactions">
                <CourseLikeButton
                  slug={course.slug}
                  initialCount={course.likes_count}
                  initialLiked={course.liked_by_me}
                />
                <span>Сохранений: {course.saves_count}</span>
                <ReportCourseButton slug={course.slug} />
              </div>
            </div>
            <Image
              className="course-illustration"
              src="/lecture-demo/course-books.webp"
              width={360}
              height={320}
              unoptimized
              alt=""
            />
          </div>
        </div>
      </header>
      {articleCount > 0 && (
        <CourseReader key={course.id} sections={outline}>
          {sections.map((section) => (
            <div key={section.id}>
              {section.articles.map((article) => {
                const material = materials.get(article.id);
                if (!material) return null;
                return (
                  <article
                    key={article.id}
                    id={`article-${article.id}`}
                    className="course-material"
                  >
                    <header>
                      <p className="course-section-name">{section.title}</p>
                      <h2 className="course-material-title" tabIndex={-1}>
                        {article.title}
                      </h2>
                      <p className="text-fg-muted mt-2 text-sm">
                        Автор: {material.author.display_name || material.author.username} ·
                        Карточек: {material.cards_count}
                      </p>
                    </header>
                    {article.body && (
                      <ArticleContentServer
                        value={article.body}
                        media={Object.fromEntries(
                          (article.media ?? []).map((item) => [item.id, item]),
                        )}
                      />
                    )}
                    {material.cards_count > 0 && (
                      <section className="course-card-list">
                        <h3>Карточки к статье</h3>
                        <PublicCourseCards
                          initial={material}
                          slug={course.slug}
                          articleId={article.id}
                        />
                      </section>
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
                  </article>
                );
              })}
            </div>
          ))}
        </CourseReader>
      )}
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="course-related course-width">
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
