import { renderToStaticMarkup } from 'react-dom/server';
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
vi.mock('../../../components/analytics/PublicAnalytics', () => ({
  PublicAnalytics: () => <span data-analytics-probe="" />,
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
    // Запрос метаданных и страницы используют React cache, fetch остаётся свежим.
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

it.each(['public', 'unlisted'])(
  'проверяет аналитику и индексацию самостоятельного набора %s',
  async (visibility) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              title: 'Набор',
              slug: 'old-set',
              description: '',
              visibility,
              author: { username: 'author' },
              cards: [],
              cards_count: 0,
              course_url: null,
            }),
          ),
      ),
    );
    const props = { params: Promise.resolve({ slug: 'old-set' }) };
    expect(renderToStaticMarkup(await Page(props)).includes('data-analytics-probe')).toBe(
      visibility === 'public',
    );
    expect((await generateMetadata(props)).robots).toEqual({
      index: visibility === 'public',
      follow: visibility === 'public',
    });
  },
);

function publicSetResponse(overrides = {}) {
  return {
    id: 'standalone-id',
    title: 'Вероятность',
    slug: 'вероятность',
    description: 'Определения и примеры',
    visibility: 'public',
    author: { username: 'anna', display_name: 'Анна', avatar_url: null },
    cards_count: 54,
    course_url: null,
    cards: [
      {
        id: 'card-1',
        term: 'Событие',
        definition: 'Результат опыта',
        term_transcription: 'собы́тие',
        definition_transcription: 'event',
        hint: 'Бросок кубика',
        content_type: 'text',
        code_language: null,
        term_image_url: '/term.png',
        definition_image_url: '/definition.png',
      },
    ],
    ...overrides,
  };
}

it('выводит обе стороны, медиа, транскрипции, подсказку и честный размер предпросмотра в SSR', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(publicSetResponse()))),
  );
  const html = renderToStaticMarkup(
    await Page({ params: Promise.resolve({ slug: 'вероятность' }) }),
  );
  for (const text of [
    'Событие',
    'Результат опыта',
    '[собы́тие]',
    '[event]',
    'Подсказка: Бросок кубика',
    'Показаны первые 1 из 54',
  ]) {
    expect(html).toContain(text);
  }
  expect(html).toContain('src="/lecture-demo/remora-icon.png"');
  expect(html).toContain('class="site-header"');
  expect(html).toContain('href="/avtor/anna"');
  expect(html).toContain('src="/term.png"');
  expect(html).toContain('src="/definition.png"');
  expect(html).toContain('href="#cards-heading"');
  expect(html).not.toContain('Начать учиться');
});

it('сохраняет canonical и OpenGraph самостоятельного набора', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(publicSetResponse()))),
  );
  const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'вероятность' }) });
  expect(metadata.alternates?.canonical).toBe('/nabor/вероятность');
  expect(metadata.openGraph).toEqual({
    title: 'Вероятность',
    description: 'Определения и примеры',
    type: 'article',
  });
});

it('для пустого набора предлагает каталог и не обещает просмотр несуществующих карточек', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(JSON.stringify(publicSetResponse({ cards: [], cards_count: 0 }))),
    ),
  );
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ slug: 'empty' }) }));
  expect(html).toContain('Карточек пока нет');
  expect(html).toContain('Выбрать курс');
  expect(html).not.toContain('Смотреть карточки');
});

it('не подменяет ошибку сервиса пустым набором или 404', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 503 })),
  );
  await expect(Page({ params: Promise.resolve({ slug: 'unavailable' }) })).rejects.toThrow(
    'Public set API returned 503',
  );
});

it.each([404, 503])(
  'показывает имя без тупиковой ссылки при недоступном профиле автора (%s)',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/authors/')
          ? new Response('{}', { status })
          : new Response(JSON.stringify(publicSetResponse())),
      ),
    );
    const html = renderToStaticMarkup(
      await Page({ params: Promise.resolve({ slug: 'вероятность' }) }),
    );
    expect(html).toContain('Анна');
    expect(html).toContain('Результат опыта');
    expect(html).not.toContain('href="/avtor/anna"');
    expect(html).not.toContain('Другие материалы автора');
  },
);
