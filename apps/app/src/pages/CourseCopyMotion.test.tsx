// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { CourseCopyPage } from './CourseReaderPage';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it('подключает движение к карточке и действию копирования', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: {
      id: 'course-1',
      slug: 'teoriya-veroyatnostey',
      title: 'Теория вероятностей',
      author: { username: 'teacher', display_name: 'Анна Орлова' },
      sections: [],
    },
    response: new Response(),
  } as never);

  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/courses/copy/teoriya-veroyatnostey']}>
        <Routes>
          <Route path="/courses/copy/:slug" element={<CourseCopyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Теория вероятностей' })).toBeTruthy();
  expect(document.querySelector('.course-copy-motion')).toBeTruthy();
  expect(document.querySelector('.course-copy-card')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Создать копию курса' }).closest('.course-copy-action'),
  ).toBeTruthy();
});
