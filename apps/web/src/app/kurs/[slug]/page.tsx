import { PublicAnalytics } from '../../../components/analytics/PublicAnalytics';
import type { components } from '@remora/api-client';
import { ArticleContentServer } from '@remora/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { PublicCourseCards } from './PublicCourseCards';
import { JsonLd } from '../../../components/JsonLd';
import { absoluteUrl, DEFAULT_OG_IMAGE } from '../../../lib/seo';
import { cachedPublicRead } from '../../../lib/cache';
import { ReadingBreadcrumb } from '../../../components/reading/PublicReadingCover';
import { pluralWithCount } from '@remora/core';
import { CourseReader } from './CourseReader';

const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';
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
  const outline = sections.filter((section) => section.articles.length);
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
    <main className="course-detail public-course">
      {course.is_listed && <PublicAnalytics path={`/kurs/${encodeURIComponent(course.slug)}`} />}
      <JsonLd data={structuredData} />
      <CourseReader
        key={course.id}
        top={<ReadingBreadcrumb href="/kursy" back="Каталог курсов" label="Учебный курс" />}
        course={{
          id: course.id,
          slug: course.slug,
          title: course.title,
          likesCount: course.likes_count,
          liked: course.liked_by_me,
          savesCount: course.saves_count,
        }}
        coverDetails={
          <>
            {course.description && <p className="course-intro">{course.description}</p>}
            <div className="course-byline">
              <Link href={`/avtor/${course.author.username}`}>{authorName}</Link>
              {!!outline.length && (
                <span>{pluralWithCount(outline.length, ['раздел', 'раздела', 'разделов'])}</span>
              )}
              {!!articleCount && (
                <span>{pluralWithCount(articleCount, ['статья', 'статьи', 'статей'])}</span>
              )}
              {course.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          </>
        }
        sections={outline.map((section) => ({
          ...section,
          articles: section.articles.map((article) => {
            const { id, title } = article;
            const material = materials.get(id)!;
            return {
              id,
              title,
              setId: article.set_id,
              meta: section.title,
              byline: `Автор: ${material.author.display_name || material.author.username} · Карточек: ${material.cards_count}`,
              content: article.body && (
                <ArticleContentServer
                  key={id}
                  value={article.body}
                  articleTitle={title}
                  media={Object.fromEntries((article.media ?? []).map((item) => [item.id, item]))}
                />
              ),
              hasCards: material.cards_count > 0,
              resources: material.cards_count > 0 && (
                <section key={id} className="course-card-list course-resources">
                  <h3 id={`article-${id}-cards`} tabIndex={-1}>
                    Карточки к статье
                  </h3>
                  <PublicCourseCards initial={material} slug={course.slug} articleId={id} />
                </section>
              ),
            };
          }),
        }))}
      />
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
