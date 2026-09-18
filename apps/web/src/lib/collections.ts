import type { components } from '@remora/api-client';
import type { Metadata } from 'next';
import { cache } from 'react';
import { editorialCollections, type EditorialCollection } from '../content/collections';
import { absoluteUrl, DEFAULT_OG_IMAGE } from './seo';

export type CollectionCourse = components['schemas']['CourseSearchItem'];
export const COLLECTIONS_TITLE = 'Подборки курсов для учёбы';
export const COLLECTIONS_DESCRIPTION =
  'Редакционные подборки учебных курсов и карточек Remora: выберите тему и материалы для самостоятельных занятий.';

export function publishedCollections(
  collections: readonly EditorialCollection[] = editorialCollections,
  now = new Date(),
): EditorialCollection[] {
  return collections.filter(
    (item) =>
      item.status === 'published' &&
      Date.parse(item.publishedAt) <= now.getTime() &&
      item.courses.length > 0,
  );
}

export function getCollection(slug: string): EditorialCollection | undefined {
  return publishedCollections().find((item) => item.slug === slug);
}

export type CollectionResult =
  { ok: true; courses: CollectionCourse[] } | { ok: false; courses: [] };

export async function fetchCollectionCourses(
  collection: EditorialCollection,
): Promise<CollectionResult> {
  const ids = [...new Set(collection.courses.map((course) => course.id))];
  if (!ids.length) return { ok: true, courses: [] };
  const params = new URLSearchParams(ids.map((id) => ['ids', id]));
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://localhost:8000'}/api/v1/search/courses/selected?${params}`,
      { cache: 'no-store', signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) return { ok: false, courses: [] };
    const courses = (await response.json()) as CollectionCourse[];
    // Порядок задаёт редактор, а не БД. Не показываем незапрошенные записи.
    const byId = new Map(courses.map((course) => [course.id, course]));
    return { ok: true, courses: ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) };
  } catch {
    return { ok: false, courses: [] };
  }
}

// Только дедупликация в пределах SSR-запроса, без межзапросного кэша доступа.
export const loadCollectionCourses = cache(fetchCollectionCourses);

export function collectionMetadata(collection?: EditorialCollection, index = true): Metadata {
  const title = collection?.title ?? COLLECTIONS_TITLE;
  const description = collection?.description ?? COLLECTIONS_DESCRIPTION;
  const path = collection ? `/podborki/${collection.slug}` : '/podborki';
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index, follow: true },
    openGraph: {
      type: 'website',
      title: `${title} — Remora`,
      description,
      url: path,
      siteName: 'Remora',
      locale: 'ru_RU',
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: 'Подборки курсов Remora' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — Remora`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export function collectionsStructuredData(
  collection?: EditorialCollection,
  courses: CollectionCourse[] = [],
) {
  const path = collection ? `/podborki/${collection.slug}` : '/podborki';
  const items = collection
    ? courses.map((course) => ({ name: course.title, url: absoluteUrl(`/kurs/${course.slug}`) }))
    : publishedCollections().map((item) => ({
        name: item.title,
        url: absoluteUrl(`/podborki/${item.slug}`),
      }));
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Главная', item: absoluteUrl('/') },
          { '@type': 'ListItem', position: 2, name: 'Подборки', item: absoluteUrl('/podborki') },
          ...(collection
            ? [
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: collection.title,
                  item: absoluteUrl(path),
                },
              ]
            : []),
        ],
      },
      {
        '@type': 'CollectionPage',
        url: absoluteUrl(path),
        name: collection?.title ?? COLLECTIONS_TITLE,
        description: collection?.description ?? COLLECTIONS_DESCRIPTION,
        inLanguage: 'ru',
        ...(collection
          ? { datePublished: collection.publishedAt, dateModified: collection.updatedAt }
          : {}),
        publisher: { '@type': 'Organization', name: 'Remora', url: absoluteUrl('/') },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: items.length,
          itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            ...item,
          })),
        },
      },
    ],
  };
}
