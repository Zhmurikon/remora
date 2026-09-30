// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoursePage, CoursesPage, NewCoursePage } from './CoursesPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));
const course = {
  tags: [],
  is_published: false,
  moderation_status: 'pending',
  id: 'course-1',
  title: 'Алгебра',
  description: 'Основы',
  updated_at: '2026-09-16',
  sections: [
    {
      id: 'section-1',
      title: 'Основной раздел',
      articles: [{ id: 'article-1', title: 'Матрицы', set_id: 'set-1' }],
    },
  ],
};

function mount(path = '/courses') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/courses/new" element={<NewCoursePage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/courses/:courseId/edit" element={<CoursePage />} />
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

describe('Курсы в кабинете', () => {
  it('показывает сохранённые курсы и фильтрует авторские', async () => {
    vi.mocked(api.GET).mockImplementation(async (path) => {
      if (path === '/api/v1/courses') {
        return { data: [course], response: new Response() } as never;
      }
      return {
        data: [
          {
            id: 'saved-course',
            slug: 'fizika-saved',
            title: 'Физика',
            description: 'Механика',
            cards_count: 42,
            has_updates: true,
            author: { id: 'author', username: 'teacher', display_name: 'Преподаватель' },
          },
        ],
        response: new Response(),
      } as never;
    });
    mount();
    expect(await screen.findByText('Алгебра')).toBeTruthy();
    expect(await screen.findByText('Физика')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Учить весь курс' }).getAttribute('href')).toBe(
      '/courses/saved-course/learn',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Созданные мной' }));
    expect(screen.queryByText('Физика')).toBeNull();
    expect(screen.getByText('Алгебра')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Сохранённые' }));
    expect(screen.queryByText('Алгебра')).toBeNull();
    expect(screen.getByText('Физика')).toBeTruthy();
  });

  it('включает drag-and-drop по умолчанию и запоминает порядок', async () => {
    vi.mocked(api.GET).mockImplementation(async (path) => {
      if (path === '/api/v1/courses') {
        return {
          data: [
            course,
            { ...course, id: 'course-2', title: 'Геометрия', updated_at: '2026-09-20' },
          ],
          response: new Response(),
        } as never;
      }
      return { data: [], response: new Response() } as never;
    });

    window.localStorage.setItem('remora:sort:courses', 'title_asc');
    mount();
    await screen.findByText('Геометрия');
    expect((screen.getByLabelText('Сортировка курсов') as HTMLSelectElement).value).toBe('custom');
    expect(screen.queryByText('Перетащите')).toBeNull();
    const source = screen.getByText('Алгебра').closest('[draggable="true"]');
    const target = screen.getByText('Геометрия').closest('[draggable="true"]');
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    vi.spyOn(target!, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      right: 200,
      bottom: 100,
      left: 0,
      width: 200,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const values = new Map<string, string>();
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? '',
    };
    fireEvent.dragStart(source!, { dataTransfer });
    fireEvent.dragOver(target!, { dataTransfer, clientX: 1, clientY: 50 });
    fireEvent.drop(target!, { dataTransfer, clientX: 1, clientY: 50 });

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem('remora:order:courses') ?? '[]')).toEqual([
        'course-1',
        'course-2',
      ]),
    );
  });

  it('публикует курс с тегами и снимает с публикации после подтверждения', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: course, response: new Response() } as never);
    vi.mocked(api.POST)
      .mockResolvedValueOnce({
        data: { ...course, is_published: true, tags: ['математика'] },
        response: new Response(),
      } as never)
      .mockResolvedValueOnce({ data: course, response: new Response() } as never);
    mount('/courses/course-1');
    await userEvent.type(await screen.findByLabelText('Теги через запятую'), 'математика');
    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать курс' }));
    expect(await screen.findByText('Курс опубликован. Ссылкой можно поделиться.')).toBeTruthy();
    expect(api.POST).toHaveBeenCalledWith('/api/v1/courses/{course_id}/publish', {
      params: { path: { course_id: 'course-1' } },
      body: { tags: ['математика'] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Снять с публикации' }));
    expect(api.POST).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить снятие' }));
    expect(
      await screen.findByText('Курс снят с публикации. Ваши материалы сохранены.'),
    ).toBeTruthy();
  });

  it('блокирует публикацию несохранённых изменений и показывает ошибку пустого курса', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: course, response: new Response() } as never);
    vi.mocked(api.POST).mockResolvedValue({
      error: { code: 'CONFLICT' },
      response: new Response(),
    } as never);
    mount('/courses/course-1');
    const title = await screen.findByLabelText('Название курса');
    await userEvent.type(title, ' новая');
    expect(
      (screen.getByRole('button', { name: 'Опубликовать курс' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await userEvent.clear(title);
    await userEvent.type(title, course.title);
    await userEvent.click(screen.getByRole('button', { name: 'Опубликовать курс' }));
    expect((await screen.findByRole('alert')).textContent).toContain('хотя бы с одной карточкой');
  });
  it('показывает пустое состояние и повторяет неудачный запрос', async () => {
    vi.mocked(api.GET)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ data: [], response: new Response() } as never);
    mount();
    expect(await screen.findByRole('alert')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Ваш первый курс')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Найти курсы' }).getAttribute('href')).toBe(
      'http://localhost:3000/kursy',
    );
  });

  it('создаёт курс из выбранного набора и открывает его структуру', async () => {
    vi.mocked(api.GET).mockResolvedValue({
      data: [{ id: 'set-1', title: 'Матрицы' }],
      response: new Response(),
    } as never);
    vi.mocked(api.POST).mockResolvedValue({ data: course, response: new Response() } as never);
    mount('/courses/new');
    await userEvent.type(screen.getByLabelText('Название курса'), 'Алгебра');
    await userEvent.selectOptions(screen.getByLabelText('Первый набор карточек'), 'set-1');
    vi.mocked(api.GET).mockResolvedValue({ data: course, response: new Response() } as never);
    await userEvent.click(screen.getByRole('button', { name: 'Создать курс' }));
    expect(await screen.findByText('Материалы курса')).toBeTruthy();
    expect(api.POST).toHaveBeenCalledWith('/api/v1/courses', {
      body: { title: 'Алгебра', description: '', set_id: 'set-1' },
    });
    expect(screen.getByRole('link', { name: 'Редактировать карточки' }).getAttribute('href')).toBe(
      '/sets/set-1/edit',
    );
  });

  it('сохраняет название и описание', async () => {
    vi.mocked(api.GET).mockResolvedValue({ data: course, response: new Response() } as never);
    vi.mocked(api.PUT).mockResolvedValue({
      data: { ...course, title: 'Линейная алгебра' },
      response: new Response(),
    } as never);
    mount('/courses/course-1');
    const title = await screen.findByLabelText('Название курса');
    await userEvent.clear(title);
    await userEvent.type(title, 'Линейная алгебра');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Изменения сохранены')).toBeTruthy();
    expect(api.PUT).toHaveBeenCalledWith('/api/v1/courses/{course_id}', {
      params: { path: { course_id: 'course-1' } },
      body: { title: 'Линейная алгебра', description: 'Основы' },
    });
  });

  it('удаляет курс только после подтверждения и возвращает к списку', async () => {
    vi.mocked(api.GET)
      .mockResolvedValueOnce({ data: course, response: new Response() } as never)
      .mockResolvedValue({ data: [], response: new Response() } as never);
    vi.mocked(api.DELETE).mockResolvedValue({ response: new Response(null, { status: 204 }) });
    mount('/courses/course-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Удалить курс' }));
    expect(api.DELETE).not.toHaveBeenCalled();
    expect(screen.getByText('Удалить курс «Алгебра»? Это действие нельзя отменить.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));

    await waitFor(() =>
      expect(api.DELETE).toHaveBeenCalledWith('/api/v1/courses/{course_id}', {
        params: { path: { course_id: 'course-1' } },
      }),
    );
    expect(await screen.findByText('Ваш первый курс')).toBeTruthy();
  });

  it('сохраняет введённые данные при конфликте и позволяет повторить', async () => {
    vi.mocked(api.GET).mockResolvedValue({
      data: [{ id: 'set-1', title: 'Матрицы' }],
      response: new Response(),
    } as never);
    vi.mocked(api.POST).mockResolvedValue({
      error: { code: 'CONFLICT' },
      response: new Response(),
    } as never);
    mount('/courses/new');
    await userEvent.type(screen.getByLabelText('Название курса'), 'Алгебра');
    await userEvent.selectOptions(screen.getByLabelText('Первый набор карточек'), 'set-1');
    await userEvent.click(screen.getByRole('button', { name: 'Создать курс' }));
    expect((await screen.findByRole('alert')).textContent).toContain('уже входит в курс');
    expect((screen.getByLabelText('Название курса') as HTMLInputElement).value).toBe('Алгебра');
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Создать курс' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });
});
