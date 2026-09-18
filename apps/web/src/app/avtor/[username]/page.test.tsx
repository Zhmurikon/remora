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
  expect(html).toContain('href="/kurs/algebra"');
  expect(html).toContain('Сохранений: 15');
});

it('создаёт canonical и Open Graph профиля', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(profile))),
  );
  const metadata = await generateMetadata({ params: Promise.resolve({ username: 'irina' }) });
  expect(metadata.alternates?.canonical).toBe('/avtor/irina');
  expect(metadata.openGraph).toMatchObject({ type: 'profile', url: '/avtor/irina' });
});
