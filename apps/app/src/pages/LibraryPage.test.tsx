// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { SavedArticlePage } from './SavedArticlePage';
import { LibraryPage } from './LibraryPage';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('показывает изменения и применяет их по кнопке', async () => {
  vi.mocked(api.GET)
    .mockResolvedValueOnce({
      data: [
        {
          id: 'save-1',
          target_type: 'set',
          target_id: 'set-1',
          course_id: 'course-1',
          course_slug: 'course',
          course_title: 'Курс',
          article_id: 'article-1',
          article_title: 'Статья',
          set_id: 'set-1',
          set_title: 'Набор',
          cards_count: 2,
          saved_at: '2026-09-17T00:00:00Z',
          accepted_at: '2026-09-17T00:00:00Z',
          has_updates: true,
        },
      ],
    } as never)
    .mockResolvedValueOnce({
      data: {
        save_id: 'save-1',
        has_updates: true,
        accepted_at: '2026-09-17T00:00:00Z',
        summary: ['Добавлено карточек: 1'],
      },
    } as never);
  vi.mocked(api.POST).mockResolvedValue({ data: {} } as never);
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LibraryPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );

  expect(screen.getByRole('link', { name: 'Найти курсы' }).getAttribute('href')).toBe(
    'http://localhost:3000/kursy',
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Обновить «Набор»' }));
  expect(await screen.findByText('Добавлено карточек: 1')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Применить обновление' }));
  await waitFor(() =>
    expect(api.POST).toHaveBeenCalledWith('/api/v1/library/{save_id}/accept', {
      params: { path: { save_id: 'save-1' } },
    }),
  );
});

it('открывает из библиотеки сохранённый текст без тренировки', async () => {
  vi.mocked(api.GET)
    .mockResolvedValueOnce({
      data: [
        {
          id: 'save',
          target_type: 'article',
          article_id: 'article',
          article_title: 'Название',
          course_slug: 'course',
          course_title: 'Курс',
          course_id: 'course',
          set_id: null,
          cards_count: 0,
          author: { username: 'Автор' },
        },
      ],
    } as never)
    .mockResolvedValueOnce({
      data: { title: 'Название', body: 'Сохранённый текст урока.', media: [] },
    } as never);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/library/manage']}>
        <Routes>
          <Route path="/library/manage" element={<LibraryPage />} />
          <Route path="/library/:saveId/read" element={<SavedArticlePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole('link', { name: 'Название' }));
  expect(await screen.findByText('Сохранённый текст урока.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Начать учиться' })).toBeNull();
  expect(api.GET).toHaveBeenCalledWith('/api/v1/library/{save_id}/article', {
    params: { path: { save_id: 'save' } },
  });
});
