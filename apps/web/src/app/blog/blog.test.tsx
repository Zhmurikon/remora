import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { blogPosts } from '../../content/blog';
import type * as BlogContent from '../../content/blog';
import { BlogCards } from '../../components/blog/BlogCards';
import { BlogRichText } from '../../components/blog/BlogRichText';
import {
  blogMetadata,
  blogStructuredData,
  publishedPosts,
  readingMinutes,
  relatedPosts,
  BLOG_PAGE_SIZE,
  blogPageCount,
  loadPublishedPosts,
} from '../../lib/blog';
import BlogPage from './page';
import { BlogIndexPage } from './BlogIndexPage';
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 503 })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('показывает список и полный текст с серверной загрузкой публикаций', async () => {
  const html = renderToStaticMarkup(await BlogPage());
  expect(html).toContain('Блог об учёбе и запоминании');
  expect(html).toContain('aria-label="Темы блога"');
  expect(html).not.toContain('Секретный черновик');
  expect(html).not.toContain('future-post');
  for (const post of publishedPosts()) {
    expect(html).toContain(`href="/blog/${post.slug}"`);
    const article = renderToStaticMarkup(
      await BlogPostPage({ params: Promise.resolve({ slug: post.slug }) }),
    );
    expect(article).toContain('Редакция «Запоминальни»');
    expect(article).toContain('Что почитать дальше');
    expect(article).toContain('class="blog-article-grid"');
    expect(article).toContain('class="blog-article-rail"');
    expect(article).toContain('Проверьте, как работают карточки');
    expect(article).toContain('Бесплатно · без регистрации');
    expect(article).toContain('href="/#demo"');
    for (const section of post.sections) {
      expect(article).toContain(`href="#${section.id}"`);
      expect(article).toContain(`id="${section.id}"`);
      if (section.paragraphs?.[0]) expect(article).toContain(section.paragraphs[0]);
    }
  }
  expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/v1/blog/posts?offset=0&limit=100', {
    next: { revalidate: 60 },
  });
});

it('добавляет опубликованную агентом статью без пересборки сайта', async () => {
  const remote = {
    ...publishedPosts()[0]!,
    slug: 'agent-publication',
    title: 'Публикация из API',
    readingMinutes: 3,
    related: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(url.includes('/agent-publication') ? remote : [remote]),
    ),
  );

  const list = renderToStaticMarkup(await BlogPage());
  const article = renderToStaticMarkup(
    await BlogPostPage({ params: Promise.resolve({ slug: remote.slug }) }),
  );
  expect(list).toContain('href="/blog/agent-publication"');
  expect(list).toContain('Публикация из API');
  expect(article).toContain('<h1>Публикация из API</h1>');
});

it('загружает все страницы API, когда публикаций больше ста', async () => {
  const source = publishedPosts()[0]!;
  const remote = Array.from({ length: 101 }, (_, index) => ({
    ...source,
    slug: `agent-publication-${index + 1}`,
    readingMinutes: 2,
    related: [],
  }));
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.includes('offset=0') ? remote.slice(0, 100) : remote.slice(100)),
  );
  vi.stubGlobal('fetch', fetcher);

  const posts = await loadPublishedPosts();
  expect(posts).toHaveLength(publishedPosts().length + remote.length);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('использует редакционную обложку статьи и сохраняет резервную схему', async () => {
  const postWithCover = publishedPosts().find((post) => post.cover);
  expect(postWithCover).toBeDefined();

  const articleWithCover = renderToStaticMarkup(
    await BlogPostPage({ params: Promise.resolve({ slug: postWithCover!.slug }) }),
  );
  expect(articleWithCover).toContain(`src="${postWithCover!.cover!.src}"`);
  expect(articleWithCover).toContain(`alt="${postWithCover!.cover!.alt}"`);

  const postWithoutCover = publishedPosts().find((post) => !post.cover);
  expect(postWithoutCover).toBeDefined();
  const articleWithoutCover = renderToStaticMarkup(
    await BlogPostPage({ params: Promise.resolve({ slug: postWithoutCover!.slug }) }),
  );
  expect(articleWithoutCover).toContain('class="blog-diagram');
  expect(articleWithoutCover).toContain('aria-hidden="true"');
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
  expect(urls).toContain('https://zapominalnya.ru/blog');
  for (const post of publishedPosts()) {
    expect(entries).toContainEqual({
      url: `https://zapominalnya.ru/blog/${post.slug}`,
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
    authors: ['Редакция «Запоминальни»'],
  });
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  const graph = blogStructuredData(post)['@graph'];
  expect(graph).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        '@type': 'BlogPosting',
        headline: post.title,
        dateModified: post.updatedAt,
        mainEntityOfPage: `https://zapominalnya.ru/blog/${post.slug}`,
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

it('строит указатель тем из опубликованных материалов', () => {
  const posts = publishedPosts();
  const html = renderToStaticMarkup(<BlogCards posts={posts} />);
  for (const category of new Set(posts.map((post) => post.category))) {
    expect(html).toContain(category);
  }
  expect(html).toContain('href="#blog-topic-1"');
  expect(html).toContain('id="blog-topic-1"');
  expect(html).toContain('class="blog-list-media"');
});

it('показывает обложку статьи, когда она задана редакцией', () => {
  const post = {
    ...publishedPosts()[0]!,
    cover: { src: '/blog/example.webp', alt: 'Учебные карточки на столе' },
  };
  const html = renderToStaticMarkup(<BlogCards posts={[post]} />);
  expect(html).toContain('src="/blog/example.webp"');
  expect(html).toContain('alt="Учебные карточки на столе"');
});

it('делит архив на страницы по десять статей', () => {
  const source = publishedPosts()[0]!;
  const posts = Array.from({ length: BLOG_PAGE_SIZE * 2 + 3 }, (_, index) => ({
    ...source,
    slug: `material-${index + 1}`,
    title: `Материал ${index + 1}`,
  }));

  expect(blogPageCount(posts)).toBe(3);
  const firstPage = renderToStaticMarkup(<BlogIndexPage posts={posts} />);
  expect(firstPage).toContain('href="/blog/stranitsa/2"');
  expect(firstPage).toContain('href="/blog/stranitsa/3"');
  expect(firstPage).toContain('href="/blog/material-10"');
  expect(firstPage).not.toContain('href="/blog/material-11"');

  const secondPage = renderToStaticMarkup(<BlogIndexPage posts={posts} currentPage={2} />);
  expect(secondPage).toContain('href="/blog"');
  expect(secondPage).toContain('href="/blog/material-11"');
  expect(secondPage).not.toContain('href="/blog/material-21"');
});

it('не показывает пагинацию, пока статей не больше десяти', () => {
  const html = renderToStaticMarkup(<BlogIndexPage posts={publishedPosts()} />);
  expect(html).not.toContain('aria-label="Страницы блога"');
});

it('экранирует HTML редакционных полей', () => {
  const post = { ...publishedPosts()[0]!, title: '<script>alert(1)</script>' };
  const html = renderToStaticMarkup(<BlogCards posts={[post]} />);
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;script&gt;');
});

it('рендерит полный набор основных элементов rich text на сервере', () => {
  const mediaId = '123e4567-e89b-12d3-a456-426614174000';
  const html = renderToStaticMarkup(
    <BlogRichText
      value={`# Подзаголовок

## Третий уровень

Обычный текст с **выделением**, *курсивом*, ~~зачёркиванием~~, [ссылкой](https://example.com) и \`кодом\`.

- Пункт
  - Вложенный пункт

1. Первый шаг
2. Второй шаг

> Важная цитата

| Термин | Значение |
| --- | --- |
| Интервал | Повторение |

\`\`\`ts
const answer = 42;
\`\`\`

---

Формула: $E = mc^2$.

![Схема повторения](media:${mediaId})`}
      media={{
        [mediaId]: { url: '/blog/example.png', width: 1200, height: 675 },
      }}
    />,
  );

  expect(html).toContain('class="course-article max-w-prose');
  expect(html).toContain('blog-rich-text');
  expect(html).toContain('<h3');
  expect(html).toContain('<h4');
  expect(html).toContain('<ul');
  expect(html).toContain('<ol');
  expect(html).toContain('<blockquote');
  expect(html).toContain('class="rm-table-scroll max-w-full overflow-x-auto"><table');
  expect(html).toContain('<pre');
  expect(html).toContain('<hr');
  expect(html).toContain('class="rm-formula-inline"');
  expect(html).toContain('src="/blog/example.png"');
  expect(html).toContain('alt="Схема повторения"');
});
