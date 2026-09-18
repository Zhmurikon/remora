// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CourseEditorPage } from './CourseEditorPage';
import { CourseReaderPage, CopyCourseButton } from './CourseReaderPage';
import { ArticleContent } from '@remora/ui';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }));
const course = {
  id: 'course',
  title: 'Алгебра',
  description: '',
  revision: 'v1',
  is_published: false,
  sections: [
    {
      id: 'section',
      title: 'Матрицы',
      articles: [{ id: 'article', set_id: 'set', title: 'Определитель', body: 'Конспект' }],
    },
  ],
};
function mount(mode = 'edit') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/courses/course/${mode}`]}>
        <Routes>
          <Route path="/courses/:courseId/edit" element={<CourseEditorPage />} />
          <Route path="/courses/:courseId/read" element={<CourseReaderPage />} />
          <Route path="/courses/:courseId/copy" element={<CopyCourseButton courseId="course" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({ data: path === '/api/v1/sets' ? [] : course, response: new Response() }) as never,
  );
});
afterEach(cleanup);

it('сохраняет теорию и новый раздел без перезаписи карточек', async () => {
  vi.mocked(api.PUT).mockResolvedValue({
    data: { ...course, revision: 'v2' },
    response: new Response(),
  } as never);
  mount();
  await userEvent.type(await screen.findByLabelText(/Теория статьи/), ' дополнен');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить раздел' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить материалы' }));
  await screen.findByText('Структура и теория сохранены');
  const input = vi.mocked(api.PUT).mock.calls[0]?.[1] as unknown as {
    body: { revision: string; sections: typeof course.sections };
    headers: Record<string, string>;
  };
  expect(input.body.revision).toBe('v1');
  expect(input.body.sections).toHaveLength(2);
  expect(input.body.sections[0]?.articles[0]?.body).toBe('Конспект дополнен');
  expect(input.headers['Idempotency-Key']).toBeTruthy();
});

it('сохраняет текст при конфликте и требует подтверждения удаления', async () => {
  vi.mocked(api.PUT).mockResolvedValue({
    error: { code: 'CONFLICT', details: { reason: 'stale_revision' } },
    response: new Response(),
  } as never);
  mount();
  const body = await screen.findByLabelText(/Теория статьи/);
  await userEvent.type(body, ' мой');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить материалы' }));
  expect((await screen.findByRole('alert')).textContent).toContain('другой вкладке');
  expect((body as HTMLTextAreaElement).value).toBe('Конспект мой');
  await userEvent.click(screen.getByRole('button', { name: /^Удалить статью$/ }));
  expect(screen.getByLabelText(/Теория статьи/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.getByLabelText(/Теория статьи/)).toBeTruthy();
});

it('переносит статью в другой раздел и оставляет её набор', async () => {
  mount();
  await screen.findByLabelText('Название раздела 1');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить раздел' }));
  const select = screen.getByLabelText('Раздел статьи 1.1') as HTMLSelectElement;
  await userEvent.selectOptions(select, select.options[1]!.value);
  expect(screen.getByLabelText('Статья 2.1')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Редактировать карточки' }).getAttribute('href')).toBe(
    '/sets/set/edit',
  );
});

it('показывает теорию и прямой переход к заучиванию', async () => {
  mount('read');
  expect(await screen.findByText('Конспект')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Начать заучивание' }).getAttribute('href')).toBe(
    '/sets/set/learn',
  );
});

it('повторяет копирование с тем же ключом после сетевой ошибки', async () => {
  vi.mocked(api.POST).mockRejectedValue(new Error('offline'));
  mount('copy');
  await userEvent.click(screen.getByRole('button', { name: 'Создать копию курса' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Создать копию курса' }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.POST).mock.calls[0]?.[1]).toEqual(vi.mocked(api.POST).mock.calls[1]?.[1]);
});

it('не исполняет HTML и отображает безопасную разметку теории', () => {
  const view = render(
    <ArticleContent
      value={'# Заголовок\n\n**Важно**\n\n- Пункт\n\n<img src=x onerror=alert(1)>'}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeTruthy();
  expect(view.container.querySelector('strong')?.textContent).toBe('Важно');
  expect(view.container.querySelector('img')).toBeNull();
});
