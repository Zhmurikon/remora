import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import AuthorPage, { generateMetadata } from './page';

const profile = {
  id: 'author-id',
  username: 'irina',
  display_name: 'Ирина',
  avatar_url: null,
  joined_at: '2026-01-10T00:00:00Z',
  stats: {
    publications: 2,
    saves_received: 15,
    likes_received: 8,
    cards_studied: 120,
    current_streak_days: 7,
  },
  badges: [],
  courses: [
    {
      id: 'course-id',
      slug: 'algebra',
      title: 'Алгебра',
      description: 'Курс по матрицам',
      tags: ['математика'],
      author_id: 'author-id',
      author: 'Ирина',
      languages: ['ru'],
      cards_count: 42,
      saves_count: 15,
      updated_at: '2026-09-01T00:00:00Z',
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

it('рендерит достижения и публичные курсы автора', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(profile))),
  );
  const html = renderToStaticMarkup(
    await AuthorPage({ params: Promise.resolve({ username: 'irina' }) }),
  );
  expect(html).toContain('Ирина');
  expect(html).toContain('Изучено карточек');
  expect(html).toContain('120');
  expect(html).toContain('Серия занятий');
  expect(html).toContain('У автора пока нет наград.');
  expect(html).toContain('href="/kurs/algebra"');
  expect(html).toContain('Сохранений: 15');
});

it('показывает иллюстрированные награды только из публичного профиля', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...profile,
            badges: [
              { code: 'published_1', title: 'Первый курс', icon: 'globe' },
              { code: 'studied_100', title: 'Сто карточек', icon: 'cards' },
            ],
          }),
        ),
    ),
  );
  const html = renderToStaticMarkup(
    await AuthorPage({ params: Promise.resolve({ username: 'irina-badges' }) }),
  );
  expect(html).toContain('Первый курс');
  expect(html).toContain('Сто карточек');
  const achievements = html.slice(html.indexOf('<section class="author-achievements"'));
  expect(achievements.match(/<h3>/g)?.length).toBe(2);
  expect(html.match(/alt=""/g)?.length).toBe(2);
  expect(html).toContain('achievement-first-published-course.webp');
  expect(html).toContain('achievement-placeholder.webp');
  expect(html).not.toContain('Крепкая память');
  expect(html).toContain('href="/kurs/algebra"');
});

it('создаёт canonical и Open Graph профиля', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(profile))),
  );
  const metadata = await generateMetadata({ params: Promise.resolve({ username: 'irina' }) });
  expect(metadata.alternates?.canonical).toBe('/avtor/irina');
  expect(metadata.openGraph).toMatchObject({ type: 'profile', url: '/avtor/irina' });
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  expect(metadata.robots).toBeUndefined();
});

it('сохраняет имя, username, дату и ссылки в серверном HTML', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(profile))),
  );
  const html = renderToStaticMarkup(
    await AuthorPage({ params: Promise.resolve({ username: 'irina' }) }),
  );
  expect(html).toContain('<h1>Ирина</h1>');
  expect(html).toContain('@irina');
  expect(html).toContain('10.01.2026');
  expect(html).toContain('href="/kursy"');
  expect(html).toContain('href="#author-courses"');
  expect(html).toContain('href="#author-stats"');
  expect(html).toContain('ProfilePage');
  expect(html).toContain('Язык: RU');
  expect(html).toContain('01.09.2026');
});

it('показывает username без пустого имени, аватара, описания и тегов', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...profile,
            display_name: null,
            courses: [{ ...profile.courses[0], description: null, tags: [], languages: [] }],
          }),
        ),
    ),
  );
  const params = Promise.resolve({ username: 'irina' });
  const html = renderToStaticMarkup(await AuthorPage({ params }));
  expect(html).toContain('<h1>@irina</h1>');
  expect(html).not.toContain('public-author-username');
  expect(html).not.toContain('public-author-course-description');
  expect(html).not.toContain('Темы курса');
  expect(html).not.toContain('Язык:');
  expect(html).not.toContain('<img');
  expect((await generateMetadata({ params })).title).toBe('@irina — автор курсов');
});

it('обрабатывает пустой список без вымышленных материалов', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...profile,
            courses: [],
            stats: { ...profile.stats, publications: 0 },
          }),
        ),
    ),
  );
  const html = renderToStaticMarkup(
    await AuthorPage({ params: Promise.resolve({ username: 'empty' }) }),
  );
  expect(html).toContain('Публичных курсов пока нет.');
  expect(html).toContain('Найти курс в каталоге');
  expect(html).not.toContain('href="/kurs/');
});

it('выводит только публичный контракт и экранирует пользовательский текст', async () => {
  const longName = 'Очень длинное имя автора '.repeat(10);
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...profile,
            display_name: longName,
            email: 'private@example.test',
            bio: 'Приватная биография',
            followers: 99999,
            courses: [
              {
                ...profile.courses[0],
                title: '<script>unsafe()</script>',
                description: 'Длинное описание '.repeat(200),
              },
            ],
          }),
        ),
    ),
  );
  const html = renderToStaticMarkup(
    await AuthorPage({ params: Promise.resolve({ username: 'long' }) }),
  );
  expect(html).toContain(longName);
  expect(html).toContain('&lt;script&gt;unsafe()&lt;/script&gt;');
  expect(html).not.toContain('<script>unsafe()');
  expect(html).not.toContain('private@example.test');
  expect(html).not.toContain('Приватная биография');
  expect(html).not.toContain('99999');
});

it.each([AuthorPage, generateMetadata])('сохраняет 404 для недоступного автора', async (render) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  await expect(render({ params: Promise.resolve({ username: 'missing' }) })).rejects.toThrow(
    'NEXT_HTTP_ERROR_FALLBACK;404',
  );
});

it.each([500, 503])('не превращает ошибку API %i в пустой профиль или 404', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status })),
  );
  await expect(
    AuthorPage({ params: Promise.resolve({ username: 'unavailable' }) }),
  ).rejects.toThrow('Не удалось загрузить профиль автора');
});

it('передаёт сетевую ошибку границе восстановления', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('fetch failed');
    }),
  );
  await expect(AuthorPage({ params: Promise.resolve({ username: 'offline' }) })).rejects.toThrow(
    'fetch failed',
  );
});
