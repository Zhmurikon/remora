import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import PublicCoursePage, { generateMetadata } from './page';

afterEach(() => vi.unstubAllGlobals());

it.each([true, false])('сохраняет индексацию курса is_listed=%s', async (isListed) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            title: 'Курс',
            description: '',
            slug: 'course',
            is_listed: isListed,
            author: { username: 'author', display_name: null },
            published_at: '2026-09-01T00:00:00Z',
            updated_at: '2026-09-02T00:00:00Z',
          }),
        ),
    ),
  );
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'course' }) });
  expect(metadata.robots).toEqual({ index: isListed, follow: isListed });
  expect(metadata.alternates?.canonical).toBe('/kurs/course');
});

it('показывает ссылку на автора и похожие курсы', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input) => {
      const url = String(input);
      if (url.includes('/related')) {
        return new Response(
          JSON.stringify([
            {
              id: 'related-id',
              slug: 'geometry',
              title: 'Геометрия',
              description: '',
              tags: ['математика'],
              author_id: 'author-id',
              author: 'Ирина',
              languages: ['ru'],
              cards_count: 20,
              saves_count: 5,
              updated_at: '2026-09-01T00:00:00Z',
            },
          ]),
        );
      }
      return new Response(
        JSON.stringify({
          id: 'course-id',
          title: 'Алгебра',
          description: '',
          slug: 'algebra',
          is_listed: true,
          tags: ['математика'],
          likes_count: 0,
          liked_by_me: false,
          saves_count: 2,
          author: {
            id: 'author-id',
            username: 'irina',
            display_name: 'Ирина',
            avatar_url: null,
          },
          sections: [],
        }),
      );
    }),
  );
  const html = renderToStaticMarkup(
    await PublicCoursePage({ params: Promise.resolve({ slug: 'algebra' }) }),
  );
  expect(html).toContain('href="/avtor/irina"');
  expect(html).toContain('Похожие курсы');
  expect(html).toContain('href="/kurs/geometry"');
});
