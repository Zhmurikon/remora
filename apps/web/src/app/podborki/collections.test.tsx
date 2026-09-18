import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { editorialCollections, type EditorialCollection } from '../../content/collections';
import type * as Content from '../../content/collections';
import { CollectionCards } from '../../components/collections/CollectionCards';
import {
  collectionMetadata,
  collectionsStructuredData,
  fetchCollectionCourses,
  publishedCollections,
  type CollectionCourse,
} from '../../lib/collections';
import CollectionsPage from './page';
import CollectionPage, { generateMetadata } from './[slug]/page';
import sitemap from '../sitemap';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../../content/collections', async (original) => {
  const actual = await original<typeof Content>();
  const courses = [
    { id: '00000000-0000-4000-8000-000000000001', note: 'Начните с определений.' },
    { id: '00000000-0000-4000-8000-000000000002', note: 'Закрепите понимание.' },
  ];
  const base = { ...actual.editorialCollections[0]!, status: 'published', courses };
  return {
    ...actual,
    editorialCollections: [
      ...actual.editorialCollections,
      { ...base, slug: 'test-collection' },
      { ...base, slug: 'future', publishedAt: '2099-01-01' },
      { ...base, slug: 'empty', courses: [] },
    ],
  };
});

const collection = () => publishedCollections().find((item) => item.slug === 'test-collection')!;
const course = (index = 0): CollectionCourse => ({
  id: collection().courses[index]!.id,
  slug: `algebra-${index}`,
  title: `Алгебра ${index}`,
  description: 'Матрицы и определители',
  author_id: 'author-id',
  author: 'Ирина',
  tags: ['математика'],
  languages: ['ru'],
  cards_count: 12,
  saves_count: 7,
  updated_at: '2026-09-18T00:00:00Z',
});
const props = (slug = 'test-collection') => ({ params: Promise.resolve({ slug }) });
function respond(items: CollectionCourse[] = [course()]) {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(items)));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());

it('публикует только выбранные редакцией непустые подборки', () => {
  expect(publishedCollections().map((item) => item.slug)).toEqual(['test-collection']);
  expect(publishedCollections([], new Date())).toEqual([]);
  const html = renderToStaticMarkup(<CollectionsPage />);
  expect(html).toContain('href="/podborki/test-collection"');
  expect(html).not.toMatch(/href="\/podborki\/(future|empty|k-pervomu-zachetu)/);
});

it.each(['missing', 'k-pervomu-zachetu', 'future', 'empty', '../../content/collections'])(
  'не раскрывает неопубликованную подборку %s',
  async (slug) => {
    const fetcher = respond();
    await expect(CollectionPage(props(slug))).rejects.toThrow('NOT_FOUND');
    await expect(generateMetadata(props(slug))).rejects.toThrow('NOT_FOUND');
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it('загружает выбранные UUID без кэша, сохраняет порядок и исключает чужие ответы', async () => {
  const fetcher = respond([course(1), { ...course(), id: 'unrequested' }, course()]);
  const duplicated = {
    ...collection(),
    courses: [...collection().courses, collection().courses[0]!],
  };
  const result = await fetchCollectionCourses(duplicated);
  expect(result.courses.map((item) => item.id)).toEqual(
    collection().courses.map((item) => item.id),
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.stringContaining('/search/courses/selected?ids='),
    expect.objectContaining({ cache: 'no-store' }),
  );
  expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.getAll('ids')).toHaveLength(2);
});

it('показывает только доступные курсы и их заметки в SSR и JSON-LD', async () => {
  respond();
  const html = renderToStaticMarkup(await CollectionPage(props()));
  expect(html).toContain('href="/kurs/algebra-0"');
  expect(html).toContain('Начните с определений.');
  expect(html).not.toContain('Закрепите понимание.');
  expect(html).toContain('Карточек: 12');
  expect(html).toContain('CollectionPage');
  expect(html).toContain('BreadcrumbList');
  expect(html).toContain('"numberOfItems":1');
});

it('после закрытия всех курсов показывает пустое состояние и noindex', async () => {
  respond([]);
  const html = renderToStaticMarkup(await CollectionPage(props()));
  expect(html).toContain('В подборке пока нет доступных курсов');
  expect(html).not.toContain('Начните с определений.');
  expect(html).not.toContain('/kurs/algebra');
  expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: true });
});

it.each(['http', 'network', 'invalid-json'])(
  'не подменяет ошибку %s пустым результатом и предлагает повтор',
  async (failure) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (failure === 'network') throw new Error('internal secret');
        return new Response('bad', { status: failure === 'http' ? 503 : 200 });
      }),
    );
    const html = renderToStaticMarkup(await CollectionPage(props()));
    expect(html).toContain('Попробовать ещё раз');
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/В подборке пока нет|internal secret|application\/ld\+json/);
    expect((await generateMetadata(props())).robots).toEqual({ index: false, follow: true });
  },
);

it('согласует canonical, OG, Twitter и JSON-LD с видимыми данными', async () => {
  respond();
  const metadata = await generateMetadata(props());
  expect(metadata.alternates?.canonical).toBe('/podborki/test-collection');
  expect(metadata.openGraph).toMatchObject({ type: 'website', url: '/podborki/test-collection' });
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  expect(metadata.robots).toEqual({ index: true, follow: true });
  expect(collectionMetadata().alternates?.canonical).toBe('/podborki');
  const data = JSON.stringify(collectionsStructuredData(collection(), [course()]));
  expect(data).toContain('/kurs/algebra-0');
  expect(data).not.toContain('/kurs/algebra-1');
});

it('добавляет в sitemap только подборки с доступными курсами', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(JSON.stringify(url.includes('/selected?') ? [course()] : [])),
    ),
  );
  let urls = (await sitemap()).map((item) => item.url);
  expect(urls).toContain('http://localhost:3000/podborki/test-collection');
  expect(urls).toContain('http://localhost:3000/podborki');
  expect(urls.join()).not.toMatch(/future|k-pervomu-zachetu|\/empty/);
  respond([]);
  urls = (await sitemap()).map((item) => item.url);
  expect(urls.join()).not.toContain('/podborki');
});

it('пустой раздел предлагает каталог, HTML редакционных полей экранируется', () => {
  const html = renderToStaticMarkup(<CollectionCards collections={[]} />);
  expect(html).toContain('Первые подборки готовятся');
  expect(html).toContain('href="/kursy"');
  const unsafe: EditorialCollection = { ...collection(), title: '<script>alert(1)</script>' };
  expect(renderToStaticMarkup(<CollectionCards collections={[unsafe]} />)).not.toContain(
    '<script>',
  );
});

it('проверяет редакционный контракт в том числе у черновиков', () => {
  expect(new Set(editorialCollections.map((item) => item.slug)).size).toBe(
    editorialCollections.length,
  );
  for (const item of editorialCollections) {
    expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (item.slug !== 'future')
      expect(Date.parse(item.updatedAt)).toBeGreaterThanOrEqual(Date.parse(item.publishedAt));
    expect(item.courses.length).toBeLessThanOrEqual(50);
    expect(new Set(item.courses.map((entry) => entry.id)).size).toBe(item.courses.length);
    for (const entry of item.courses) {
      expect(entry.id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      expect(entry.note.trim().length).toBeGreaterThan(0);
    }
  }
});
