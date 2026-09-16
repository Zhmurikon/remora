// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoursePage, CoursesPage, NewCoursePage } from './CoursesPage';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn() } }));
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe('Курсы в кабинете', () => {
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
