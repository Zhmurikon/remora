// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { SetsPage } from './SetsPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.localStorage.clear();
});

it('показывает кнопку обновления у сохранённого набора', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/library/sets') {
      return {
        data: [
          {
            id: 'set-1',
            title: 'Механика',
            description: 'Законы движения',
            cards_count: 12,
            lang_term: 'ru',
            lang_definition: 'ru',
            course_id: 'course-1',
            course_slug: 'fizika',
            course_title: 'Физика',
            article_id: 'article-1',
            article_title: 'Первый урок',
            author: { id: 'author-1', username: 'teacher', display_name: 'Преподаватель' },
            save_id: 'save-1',
            access_via: 'course',
            saved_at: '2026-09-17T00:00:00Z',
            has_updates: true,
            folder_id: null,
          },
        ],
        response: new Response(),
      } as never;
    }
    return { data: [], response: new Response() } as never;
  });

  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SetsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByRole('button', { name: 'Обновить «Механика»' })).toBeTruthy();
  expect(screen.getByText('Есть обновление')).toBeTruthy();
});
