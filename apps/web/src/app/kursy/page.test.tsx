import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import CatalogPage, { generateMetadata } from './page';

afterEach(() => vi.unstubAllGlobals());

it('передаёт фильтры, преобразует дату и сохраняет их в следующей странице', async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ items: [], next_cursor: 20 })),
  );
  vi.stubGlobal('fetch', fetcher);
  const html = renderToStaticMarkup(
    await CatalogPage({
      searchParams: Promise.resolve({
        q: 'Алгебра',
        updated_after: '2026-09-01',
        ignored: 'secret',
      }),
    }),
  );
  const url = String(fetcher.mock.calls[0]?.[0]);
  expect(url).toContain('updated_after=2026-09-01T00%3A00%3A00Z');
  expect(url).not.toContain('secret');
  expect(html).toContain('cursor=20');
  expect(html).toContain('Курсы не найдены');
});

it.each([422, 503])('показывает ошибку и повтор при HTTP %s', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status })),
  );
  const html = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('role="alert"');
  expect(html).toContain('Попробовать ещё раз');
  expect(html).not.toContain('Курсы не найдены');
});

it('рендерит курс и ссылку фильтра по автору на сервере', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'one',
                slug: 'algebra',
                title: 'Алгебра',
                description: '<script>bad</script>',
                tags: ['математика'],
                author_id: 'author',
                author: 'Ирина',
                languages: ['ru'],
                cards_count: 12,
                updated_at: '2026-09-01T00:00:00Z',
              },
            ],
            next_cursor: null,
          }),
        ),
    ),
  );
  const html = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('href="/kurs/algebra"');
  expect(html).toContain('href="/kursy?author_id=author"');
  expect(html).not.toContain('<script>');
  expect(html).toContain('Карточек: 12');
});

it('не индексирует комбинации фильтров', async () => {
  expect(
    (await generateMetadata({ searchParams: Promise.resolve({ tag: 'математика' }) })).robots,
  ).toEqual({ index: false, follow: true });
});
