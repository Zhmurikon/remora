import { afterEach, expect, it, vi } from 'vitest';
import Page, { generateMetadata } from './page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
afterEach(() => vi.unstubAllGlobals());

it('не кодирует русскоязычный slug дважды', async () => {
  const request = vi.fn(async () => new Response('{}', { status: 404 }));
  vi.stubGlobal('fetch', request);
  await expect(
    Page({ params: Promise.resolve({ slug: encodeURIComponent('линейная-алгебра') }) }),
  ).rejects.toThrow('NOT_FOUND');
  expect(request).toHaveBeenCalledWith(
    expect.stringContaining('/public/' + encodeURIComponent('линейная-алгебра')),
    // Значение кэшируется на уровне cachedPublicRead, сам fetch идёт без кэша.
    { cache: 'no-store' },
  );
});

it('перенаправляет старую ссылку к статье курса и меняет canonical', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ title: 'Курс', course_url: '/kurs/course-123#article-456' })),
    ),
  );
  const props = { params: Promise.resolve({ slug: 'old-set' }) };
  await expect(Page(props)).rejects.toThrow('REDIRECT:/kurs/course-123#article-456');
  expect((await generateMetadata(props)).alternates?.canonical).toBe('/kurs/course-123');
});

it('не перенаправляет закрытый материал', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 404 })),
  );
  await expect(Page({ params: Promise.resolve({ slug: 'hidden' }) })).rejects.toThrow('NOT_FOUND');
});

it('сохраняет старую страницу для ещё не перенесённого набора', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            title: 'Набор',
            slug: 'old-set',
            description: '',
            visibility: 'unlisted',
            author: { username: 'author' },
            cards: [],
            cards_count: 0,
            course_url: null,
          }),
        ),
    ),
  );
  const props = { params: Promise.resolve({ slug: 'old-set' }) };
  expect(await Page(props)).toBeTruthy();
  expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: false });
});
