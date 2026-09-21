// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CourseEditorPage } from './CourseEditorPage';
import { CourseReaderPage, CopyCourseButton, CopySetButton } from './CourseReaderPage';
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
      <MemoryRouter initialEntries={[`/courses/${course.id}/${mode}`]}>
        <Routes>
          <Route
            path="/courses/:courseId/materials/:articleId/edit"
            element={<CourseEditorPage />}
          />
          <Route path="/courses/:courseId/edit" element={<CourseEditorPage />} />
          <Route path="/courses/:courseId/read" element={<CourseReaderPage />} />
          <Route path="/courses/:courseId/copy" element={<CopyCourseButton courseId="course" />} />
          <Route path="/courses/:courseId/copy-set" element={<CopySetButton setId="set" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  course.id = crypto.randomUUID();
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({ data: path === '/api/v1/sets' ? [] : course, response: new Response() }) as never,
  );
});
afterEach(cleanup);

it('сохраняет теорию на отдельной странице без перезаписи карточек', async () => {
  vi.mocked(api.PUT).mockResolvedValue({
    data: { ...course, revision: 'v2' },
    response: new Response(),
  } as never);
  mount('materials/article/edit');
  await userEvent.type(await screen.findByLabelText(/Теория статьи/), ' дополнен');
  expect(screen.queryByRole('button', { name: 'Добавить раздел' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить материал' }));
  await screen.findByText('Материал сохранён');
  const input = vi.mocked(api.PUT).mock.calls[0]?.[1] as unknown as {
    body: { revision: string; sections: typeof course.sections };
    headers: Record<string, string>;
  };
  expect(input.body.revision).toBe('v1');
  expect(input.body.sections).toHaveLength(1);
  expect(input.body.sections[0]?.articles[0]?.body).toBe('Конспект дополнен');
  expect(input.headers['Idempotency-Key']).toBeTruthy();
});

it('сохраняет текст материала при конфликте', async () => {
  vi.mocked(api.PUT).mockResolvedValue({
    error: { code: 'CONFLICT', details: { reason: 'stale_revision' } },
    response: new Response(),
  } as never);
  mount('materials/article/edit');
  const body = await screen.findByLabelText(/Теория статьи/);
  await userEvent.type(body, ' мой');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить материал' }));
  expect((await screen.findByRole('alert')).textContent).toContain('другой вкладке');
  expect((body as HTMLTextAreaElement).value).toBe('Конспект мой');
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

it('копирует отдельный набор и повторяет запрос тем же ключом', async () => {
  vi.mocked(api.POST)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      data: { id: 'copied-set' },
      response: new Response(),
    } as never);
  mount('copy-set');
  await userEvent.click(screen.getByRole('button', { name: 'Создать копию набора' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Создать копию набора' }));
  await waitFor(() => expect(api.POST).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.POST).mock.calls[0]?.[0]).toBe('/api/v1/sets/{set_id}/copy');
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

it('разделяет структуру и текст и подтверждает удаление статьи', async () => {
  mount();
  await screen.findByLabelText('Статья 1.1');
  expect(screen.queryByLabelText(/Теория статьи/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Редактировать материал' }).getAttribute('href')).toBe(
    `/courses/${course.id}/materials/article/edit`,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Удалить статью' }));
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.getByLabelText('Статья 1.1')).toBeTruthy();
});

it('открывает квиз внутри урока и возвращает к материалу', async () => {
  mount('read');
  await userEvent.click(await screen.findByRole('button', { name: 'Пройти квиз' }));
  expect(await screen.findByRole('button', { name: 'Начать тест' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Оглавление курса' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: '1. Материал' }));
  expect(await screen.findByText('Конспект')).toBeTruthy();
});

it('сохраняет теорию при изменении структуры', async () => {
  vi.mocked(api.PUT).mockResolvedValue({
    data: { ...course, revision: 'v2' },
    response: new Response(),
  } as never);
  mount();
  await userEvent.click(await screen.findByRole('button', { name: 'Добавить раздел' }));
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить структуру' }));
  await screen.findByText('Структура сохранена');
  const input = vi.mocked(api.PUT).mock.calls[0]?.[1] as unknown as {
    body: { sections: typeof course.sections };
  };
  expect(input.body.sections).toHaveLength(2);
  expect(input.body.sections[0]?.articles[0]?.body).toBe('Конспект');
});

it('проверяет квиз по набору урока и позволяет продолжить курс после результата', async () => {
  const expanded = {
    ...course,
    sections: [
      {
        ...course.sections[0]!,
        articles: [
          ...course.sections[0]!.articles,
          { id: 'next', set_id: 'next-set', title: 'Следующая тема', body: 'Новый материал' },
        ],
      },
    ],
  };
  vi.mocked(api.GET).mockResolvedValue({ data: expanded, response: new Response() } as never);
  const attempt = {
    id: 'attempt',
    set_title: 'Определитель',
    questions: [{ id: 'q1', kind: 'typing', prompt: 'Сколько?', options: [] }],
  };
  vi.mocked(api.POST).mockImplementation(
    async (path) =>
      ({
        data: String(path).endsWith('/submit')
          ? { score: 100, correct_count: 1, total: 1, wrong_card_ids: [], review: [] }
          : attempt,
        response: new Response(),
      }) as never,
  );
  mount('read');
  await userEvent.click(await screen.findByRole('button', { name: 'Пройти квиз' }));
  await userEvent.click(screen.getByRole('button', { name: 'Начать тест' }));
  await userEvent.type(await screen.findByRole('textbox', { name: 'Ответ на вопрос 1' }), '4');
  const request = vi.mocked(api.POST).mock.calls[0]?.[1] as unknown as {
    params: { path: { set_id: string } };
  };
  expect(request.params.path).toEqual({ set_id: 'set' });
  expect(screen.queryByRole('button', { name: 'Следующий урок' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
  await screen.findByText('100% верно');
  await userEvent.click(screen.getByRole('button', { name: 'Следующий урок' }));
  expect(await screen.findByText('Новый материал')).toBeTruthy();
});
