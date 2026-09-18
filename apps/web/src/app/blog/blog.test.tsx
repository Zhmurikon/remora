import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { blogPosts } from '../../content/blog';
import type * as BlogContent from '../../content/blog';
import { BlogCards } from '../../components/blog/BlogCards';
import {
  blogMetadata,
  blogStructuredData,
  publishedPosts,
  readingMinutes,
  relatedPosts,
} from '../../lib/blog';
import BlogPage from './page';
import BlogPostPage, { generateMetadata, generateStaticParams } from './[slug]/page';
import sitemap from '../sitemap';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../../content/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof BlogContent>();
  return {
    ...actual,
    blogPosts: [
      ...actual.blogPosts,
      {
        ...actual.blogPosts[0],
        slug: 'private-draft',
        title: 'Секретный черновик',
        status: 'draft',
      },
      { ...actual.blogPosts[0], slug: 'future-post', publishedAt: '2099-01-01' },
    ],
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('показывает список и полный текст без клиентского запроса', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const html = renderToStaticMarkup(<BlogPage />);
  expect(html).toContain('Учиться с пониманием');
  expect(html).not.toContain('Секретный черновик');
  expect(html).not.toContain('future-post');
  for (const post of publishedPosts()) {
    expect(html).toContain(`href="/blog/${post.slug}"`);
    const article = renderToStaticMarkup(
      await BlogPostPage({ params: Promise.resolve({ slug: post.slug }) }),
    );
    expect(article).toContain('Редакция Remora');
    expect(article).toContain('Что почитать дальше');
    expect(article).toContain('href="/#demo"');
    for (const section of post.sections) {
      expect(article).toContain(`href="#${section.id}"`);
      expect(article).toContain(`id="${section.id}"`);
      expect(article).toContain(section.paragraphs[0]);
    }
  }
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['missing', 'private-draft', 'future-post', '../../content/blog'])(
  'не раскрывает недоступную статью %s ни в HTML, ни в метаданных',
  async (slug) => {
    const props = { params: Promise.resolve({ slug }) };
    await expect(BlogPostPage(props)).rejects.toThrow('NOT_FOUND');
    await expect(generateMetadata(props)).rejects.toThrow('NOT_FOUND');
    expect(generateStaticParams()).not.toContainEqual({ slug });
  },
);

it('использует одинаковые публичные материалы в списке, sitemap и JSON-LD', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 503 })),
  );
  const entries = await sitemap();
  const urls = entries.map((entry) => entry.url);
  const structured = JSON.stringify(blogStructuredData());
  expect(urls).toContain('http://localhost:3000/blog');
  for (const post of publishedPosts()) {
    expect(entries).toContainEqual({
      url: `http://localhost:3000/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
    });
    expect(structured).toContain(`/blog/${post.slug}`);
  }
  expect(urls.join()).not.toMatch(/private-draft|future-post/);
  expect(structured).not.toMatch(/private-draft|future-post/);
});

it('формирует canonical, article Open Graph, Twitter и согласованный BlogPosting', async () => {
  const post = publishedPosts()[0]!;
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: post.slug }) });
  expect(metadata.alternates?.canonical).toBe(`/blog/${post.slug}`);
  expect(metadata.openGraph).toMatchObject({
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: ['Редакция Remora'],
  });
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  const graph = blogStructuredData(post)['@graph'];
  expect(graph).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        '@type': 'BlogPosting',
        headline: post.title,
        dateModified: post.updatedAt,
        mainEntityOfPage: `http://localhost:3000/blog/${post.slug}`,
      }),
    ]),
  );
  expect(blogMetadata().alternates?.canonical).toBe('/blog');
});

it('проверяет редакционные данные: уникальные адреса, даты, оглавление и связанные статьи', () => {
  const posts = publishedPosts();
  expect(new Set(posts.map((post) => post.slug)).size).toBe(posts.length);
  expect(publishedPosts([], new Date())).toEqual([]);
  for (const post of posts) {
    expect(post.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(Date.parse(post.updatedAt)).toBeGreaterThanOrEqual(Date.parse(post.publishedAt));
    expect(new Set(post.sections.map((section) => section.id)).size).toBe(post.sections.length);
    expect(relatedPosts(post)).toHaveLength(post.related.length);
    expect(relatedPosts(post).every((related) => related.slug !== post.slug)).toBe(true);
    expect(readingMinutes(post)).toBeGreaterThan(0);
    for (const section of post.sections) expect(section.id).toMatch(/^[a-z0-9-]+$/);
    for (const source of post.sources ?? []) expect(source.url).toMatch(/^https:\/\//);
  }
  expect(blogPosts.length).toBeGreaterThan(posts.length);
});

it('показывает полезное пустое состояние', () => {
  const html = renderToStaticMarkup(<BlogCards posts={[]} />);
  expect(html).toContain('Здесь появятся материалы');
  expect(html).toContain('href="/#demo"');
});

it('экранирует HTML редакционных полей', () => {
  const post = { ...publishedPosts()[0]!, title: '<script>alert(1)</script>' };
  const html = renderToStaticMarkup(<BlogCards posts={[post]} />);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});
