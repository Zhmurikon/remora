// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { SetPage } from './SetPage';
import { SetsPage } from './SetsPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const savedSet = {
  id: 'saved-set',
  title: 'Основы Git',
  description: 'Термины курса',
  cards_count: 10,
  lang_term: 'ru',
  lang_definition: 'ru',
  course_id: 'course',
  course_slug: 'git',
  course_title: 'Git с нуля',
  article_id: 'article',
  article_title: 'Репозитории',
  author: { id: 'author', username: 'teacher', display_name: 'Преподаватель' },
  save_id: 'save',
  access_via: 'course',
  saved_at: '2026-10-01T00:00:00Z',
  has_updates: false,
  folder_id: null,
};

function renderWithRouter(path: string, element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path === '/sets' ? '/sets' : '/sets/:setId'} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.localStorage.clear();
});

afterEach(cleanup);

it('открывает сохранённый набор на странице выбора режима', async () => {
  vi.mocked(api.GET).mockImplementation(async (requestPath) => {
    if (requestPath === '/api/v1/library/sets') {
      return { data: [savedSet], response: new Response() } as never;
    }
    return { data: [], response: new Response() } as never;
  });

  renderWithRouter('/sets', <SetsPage />);

  expect((await screen.findByRole('link', { name: /Основы Git/ })).getAttribute('href')).toBe(
    '/sets/saved-set',
  );
});

it('показывает сохранённому набору все режимы, но не редактирование', async () => {
  vi.mocked(api.GET).mockImplementation(async (requestPath) => {
    if (requestPath === '/api/v1/sets/{set_id}') {
      return {
        data: {
          ...savedSet,
          slug: 'osnovy-git',
          visibility: 'public',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-10-01T00:00:00Z',
          can_edit: false,
          cards: [],
        },
        response: new Response(),
      } as never;
    }
    return {
      error: { code: 'NOT_FOUND', message: 'Нет данных' },
      response: new Response(),
    } as never;
  });

  renderWithRouter('/sets/saved-set', <SetPage />);

  expect(await screen.findByRole('link', { name: 'Заучивание' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Карточки' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Письмо' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Тест' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Аудирование' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Редактировать' })).toBeNull();
});
