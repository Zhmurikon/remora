// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CourseEditorPage } from './CourseEditorPage';
import { CourseReaderPage, CopyCourseButton, CopySetButton } from './CourseReaderPage';
import { ArticleContent } from '@remora/ui';
import { api } from '../lib/api';
import { AppLayout } from '../layouts/AppLayout';

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
function mount(mode = 'structure') {
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
          <Route path="/courses/:courseId/structure" element={<CourseEditorPage />} />
          <Route element={<AppLayout />}>
            <Route path="/courses/:courseId" element={<CourseReaderPage />} />
            <Route path="/courses/:courseId/read" element={<CourseReaderPage />} />
          </Route>
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

it.each(['', 'read'])('открывает оглавление с навигацией кабинета: %s', async (path) => {
  mount(path);
  await screen.findByRole('heading', { name: 'Алгебра' });
  expect(screen.queryByText('Конспект')).toBeNull();
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Редактировать курс' }).getAttribute('href')).toBe(
    `/courses/${course.id}/edit`,
  );
  await userEvent.click(screen.getByRole('link', { name: /Определитель/ }));
  expect(await screen.findByText('Конспект')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'О курсе и оглавление' }));
  expect(await screen.findByRole('heading', { name: 'Разделы курса' })).toBeTruthy();
  expect(screen.queryByText('Конспект')).toBeNull();
});

it('сохраняет выбранный раздел при переходе в урок и обратно', async () => {
  const otherSection = {
    id: 'other-section',
    title: 'Векторы',
    articles: [{ id: 'other-article', set_id: 'other-set', title: 'Базис', body: 'Теория базиса' }],
  };
  vi.mocked(api.GET).mockResolvedValue({
    data: { ...course, sections: [...course.sections, otherSection] },
    response: new Response(),
  } as never);
  mount('read');
  await userEvent.click(await screen.findByRole('button', { name: /02.*Векторы/ }));
  expect(screen.queryByRole('link', { name: /Определитель/ })).toBeNull();
  await userEvent.click(screen.getByRole('link', { name: /Базис/ }));
  expect(await screen.findByText('Теория базиса')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Базис' }).getAttribute('aria-current')).toBe('page');
  await userEvent.click(screen.getByRole('button', { name: 'О курсе и оглавление' }));
  expect(await screen.findByRole('heading', { name: 'Векторы' })).toBeTruthy();
});

it('не открывает первый урок вместо отсутствующего', async () => {
  mount('read?article=missing');
  expect(
    await screen.findByText('Этот урок не найден. Выберите другой в оглавлении.'),
  ).toBeTruthy();
  expect(screen.queryByText('Конспект')).toBeNull();
});

it('сохраняет теорию на отдельной странице без перезаписи карточек', async () => {
  vi.mocked(api.PUT).mockResolvedValue({
    data: { ...course, revision: 'v2' },
    response: new Response(),
  } as never);
  mount('materials/article/edit');
  await userEvent.type(await screen.findByRole('textbox', { name: /Теория статьи/ }), ' дополнен');
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
  const body = await screen.findByRole('textbox', { name: /Теория статьи/ });
  await userEvent.type(body, ' мой');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить материал' }));
  expect((await screen.findByRole('alert')).textContent).toContain('другой вкладке');
  expect((body as HTMLTextAreaElement).value).toBe('Конспект мой');
});

it('переносит статью в другой раздел и оставляет её набор', async () => {
  mount();
  await screen.findByLabelText('Название раздела 1');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить раздел' }));
  await userEvent.click(screen.getByRole('button', { name: 'Действия с уроком 1.1' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Перенести в раздел…' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Новый раздел' }));
  expect(screen.getByLabelText('Статья 2.1')).toBeTruthy();
  expect(screen.queryByRole('menu')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Действия с уроком 2.1' }));
  expect(
    screen.getByRole('menuitem', { name: 'Редактировать карточки' }).getAttribute('href'),
  ).toBe('/sets/set/edit');
});

it('отменяет перенос с клавиатуры и сохраняет урок в выбранном разделе по команде', async () => {
  const user = userEvent.setup();
  const second = { id: 'second', title: 'Векторы', articles: [] };
  const detail = { ...course, sections: [...course.sections, second] };
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({
        data: path === '/api/v1/sets' ? [] : detail,
        response: new Response(),
      }) as never,
  );
  vi.mocked(api.PUT).mockResolvedValue({ data: detail, response: new Response() } as never);
  mount();
  const grip = await screen.findByRole('button', { name: 'Переместить «Определитель»' });
  grip.focus();
  await user.keyboard('[Space][ArrowRight][Escape]');
  expect(screen.getByLabelText('Статья 1.1')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Сохранить структуру' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.keyboard('[Space][ArrowRight][Enter]');
  expect(screen.getByLabelText('Статья 2.1')).toBeTruthy();
  expect(api.PUT).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Сохранить структуру' }));
  await screen.findByText('Структура сохранена');
  expect(vi.mocked(api.PUT).mock.calls[0]?.[1]).toMatchObject({
    body: {
      sections: [
        { ...course.sections[0], articles: [] },
        { ...second, articles: course.sections[0]!.articles },
      ],
    },
  });
});

it('показывает теорию и прямой переход к заучиванию', async () => {
  mount('read?article=article');
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
it('открывает меню строки с клавиатуры, пропускает недоступные действия и возвращает фокус', async () => {
  const user = userEvent.setup();
  mount();
  const trigger = await screen.findByRole('button', { name: 'Действия с уроком 1.1' });
  trigger.focus();
  await user.keyboard('[ArrowDown]');
  expect(document.activeElement).toBe(
    screen.getByRole('menuitem', { name: 'Редактировать карточки' }),
  );
  await user.keyboard('[ArrowDown]');
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Удалить урок' }));
  await user.keyboard('[Escape]');
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  await user.click(screen.getByLabelText('Статья 1.1'));
  expect(screen.queryByRole('menu')).toBeNull();
});

  expect(screen.getByRole('link', { name: 'Редактировать материал' }).getAttribute('href')).toBe(
    `/courses/${course.id}/materials/article/edit`,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Действия с уроком 1.1' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Удалить урок' }));
  await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(screen.getByLabelText('Статья 1.1')).toBeTruthy();
});

it('открывает квиз внутри урока и возвращает к материалу', async () => {
  mount('read?article=article');
  await userEvent.click(await screen.findByRole('button', { name: 'Пройти квиз' }));
  expect(await screen.findByRole('button', { name: 'Начать квиз' })).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Оглавление курса' })).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Материал' }));
  expect(await screen.findByText('Конспект')).toBeTruthy();
});

it('передаёт выбранные параметры квиза и позволяет повторить запуск при ошибке', async () => {
  const user = userEvent.setup();
  vi.mocked(api.POST).mockResolvedValue({ error: { message: 'Нет подходящих карточек' } } as never);
  mount('read?article=article&step=quiz');
  const start = (await screen.findByRole('button', { name: 'Начать квиз' })) as HTMLButtonElement;
  await user.click(screen.getByLabelText('Выбор из вариантов'));
  await user.click(screen.getByLabelText('Верно или нет'));
  expect(start.disabled).toBe(true);
  await user.click(screen.getByLabelText('Сопоставление'));
  await user.click(screen.getByLabelText('Ввод ответа'));
  const count = screen.getByRole('spinbutton', { name: 'Количество вопросов' });
  await user.clear(count);
  await user.type(count, '51');
  expect(start.disabled).toBe(true);
  await user.clear(count);
  await user.type(count, '5');
  await user.click(screen.getByRole('button', { name: 'Увеличить количество вопросов' }));
  const advanced = screen.getByText('Расширенные настройки');
  const details = advanced.closest('details')!;
  expect(details.open).toBe(false);
  expect(details.contains(start)).toBe(false);
  await user.click(advanced);
  expect(details.open).toBe(true);
  const options = within(details);
  await user.selectOptions(options.getByLabelText('Источник'), 'hard');
  await user.selectOptions(options.getByLabelText('Направление'), 'both');
  await user.click(options.getByLabelText('Учитывать результат в расписании повторений'));
  await user.click(advanced);
  expect(details.open).toBe(false);
  await user.click(start);
  expect((await screen.findByRole('alert')).textContent).toBe('Нет подходящих карточек');
  expect(vi.mocked(api.POST)).toHaveBeenCalledWith('/api/v1/study/sets/{set_id}/tests', {
    params: { path: { set_id: 'set' } },
    body: {
      question_count: 6,
      kinds: ['matching', 'typing'],
      source: 'hard',
      direction: 'both',
      write_to_schedule: false,
    },
  });
  await user.click(start);
  await waitFor(() => expect(vi.mocked(api.POST)).toHaveBeenCalledTimes(2));
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
  mount('read?article=article');
  await userEvent.click(await screen.findByRole('button', { name: 'Пройти квиз' }));
  await userEvent.click(screen.getByRole('button', { name: 'Начать квиз' }));
  await userEvent.type(await screen.findByRole('textbox', { name: 'Ответ на вопрос 1' }), '4');
  const request = vi.mocked(api.POST).mock.calls[0]?.[1] as unknown as {
    params: { path: { set_id: string } };
  };
  expect(request.params.path).toEqual({ set_id: 'set' });
  const toolbar = within(screen.getByRole('navigation', { name: 'Навигация по уроку' }));
  expect(
    (toolbar.getByRole('button', { name: 'Предыдущий урок' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  const confirmLeave = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    await userEvent.click(toolbar.getByRole('button', { name: 'Следующий урок' }));
    expect(confirmLeave).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole('textbox', { name: 'Ответ на вопрос 1' }) as HTMLInputElement).value,
    ).toBe('4');
  } finally {
    confirmLeave.mockRestore();
  }
  await userEvent.click(screen.getByRole('button', { name: 'Проверить' }));
  await screen.findByText('100% верно');
  await userEvent.click(toolbar.getByRole('button', { name: 'Следующий урок' }));
  expect(await screen.findByText('Новый материал')).toBeTruthy();
  const nextToolbar = within(screen.getByRole('navigation', { name: 'Навигация по уроку' }));
  expect(
    (nextToolbar.getByRole('button', { name: 'Следующий урок' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.click(nextToolbar.getByRole('button', { name: 'Предыдущий урок' }));
  expect(await screen.findByText('Конспект')).toBeTruthy();
});
