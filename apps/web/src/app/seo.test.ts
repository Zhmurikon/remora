import { afterEach, expect, it, vi } from 'vitest';
import robots from './robots';
import sitemap from './sitemap';
import { jsonLd } from '../lib/seo';
import { publishedPosts } from '../lib/blog';

afterEach(() => vi.unstubAllGlobals());

it('экранирует пользовательский текст внутри JSON-LD', () => {
  expect(jsonLd({ name: '</script><script>alert(1)</script>' })).not.toContain('</script>');
});

it('публикует карту сайта и закрывает служебные маршруты', () => {
  const value = robots();
  expect(value.sitemap).toBe('http://localhost:3000/sitemap.xml');
  expect(value.rules).toMatchObject({ disallow: expect.arrayContaining(['/app/', '/login']) });
});

it('добавляет доступные курсы и уникальные профили авторов в sitemap', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            { slug: 'algebra', author_username: 'irina', updated_at: '2026-09-01T00:00:00Z' },
            { slug: 'geometry', author_username: 'irina', updated_at: '2026-09-02T00:00:00Z' },
          ]),
        ),
    ),
  );
  const urls = (await sitemap()).map((entry) => entry.url);
  expect(urls).toContain('http://localhost:3000/kurs/algebra');
  expect(urls).toContain('http://localhost:3000/kurs/geometry');
  expect(urls.filter((url) => url.endsWith('/avtor/irina'))).toHaveLength(1);
});

it('сохраняет статические URL при недоступном API', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 503 })),
  );
  expect((await sitemap()).map((entry) => entry.url)).toEqual([
    'http://localhost:3000/',
    'http://localhost:3000/kursy',
    'http://localhost:3000/blog',
    ...publishedPosts().map((post) => `http://localhost:3000/blog/${post.slug}`),
  ]);
});
