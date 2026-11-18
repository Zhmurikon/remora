// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CourseEditorPage } from './CourseEditorPage';
import {
  CourseReaderPage,
  CourseCopyPage,
  CopyCourseButton,
  CopySetButton,
} from './CourseReaderPage';
import { ArticleContent } from '@remora/ui';
import { api } from '../lib/api';
import { AppLayout } from '../layouts/AppLayout';
import { useAuthStore } from '../features/auth/auth-store';
import {
  readLocalArticleDrafts,
  writeLocalArticleDraft,
} from '../features/article-editor/local-drafts';

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
function structureInput(value: unknown) {
  return value as {
    body: { revision: string; sections: typeof course.sections };
    headers: Record<string, string>;
  };
}
function mount(mode = 'structure') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/courses/${course.id}/${mode}`]}>
        <Routes>
          <Route path="/courses/:courseId/structure" element={<CourseEditorPage />} />
          <Route element={<AppLayout />}>
            <Route
              path="/courses/:courseId/materials/:articleId/edit"
              element={<CourseEditorPage />}
            />

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
  localStorage.clear();
  useAuthStore.setState({ user: null });
  course.id = crypto.randomUUID();
  vi.mocked(api.GET).mockImplementation(
    async (path) =>
      ({ data: path === '/api/v1/sets' ? [] : course, response: new Response() }) as never,
  );
});
afterEach(cleanup);

it('записывает правки локально до запроса и удаляет копию после сохранения', async () => {
  useAuthStore.setState({ user: { id: 'draft-owner' } as never });
  vi.mocked(api.PUT).mockImplementation(
    async (_path, options) =>
      ({
        data: { ...course, revision: 'v2', sections: structureInput(options).body.sections },
        response: new Response(),
      }) as never,
  );
  mount('materials/article/edit');
  const title = await screen.findByRole('textbox', { name: 'Название статьи' });
  fireEvent.change(title, { target: { value: 'Локальное название' } });
  expect(api.PUT).not.toHaveBeenCalled();
  expect(readLocalArticleDrafts('draft-owner', course.id)[0]).toMatchObject({
    title: 'Локальное название',
    body: 'Конспект',
    base: { title: 'Определитель', body: 'Конспект' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить материал' }));
  await screen.findByText('Материал сохранён');
  expect(readLocalArticleDrafts('draft-owner', course.id)).toEqual([]);
});

it('восстанавливает конфликтующий черновик с обязательной ручной проверкой', async () => {
  useAuthStore.setState({ user: { id: 'draft-owner' } as never });
  writeLocalArticleDraft({
    version: 1,
    writer: 'closed-tab',
    userId: 'draft-owner',
    courseId: course.id,
    articleId: 'article',
    title: 'Восстановленное название',
    body: 'Локальный текст',
    base: { title: 'Определитель', body: 'Старая серверная версия' },
    updatedAt: Date.now(),
    needsReview: false,
  });
  mount('materials/article/edit');
  await userEvent.click(await screen.findByRole('button', { name: 'Восстановить черновик' }));
  expect(
    await screen.findByText(/Статья на сервере изменилась после создания черновика/),
  ).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'Название статьи' }) as HTMLInputElement).value).toBe(
    'Восстановленное название',
  );
  expect(
    readLocalArticleDrafts('draft-owner', course.id).find((d) => d.writer !== 'closed-tab'),
  ).toMatchObject({ body: 'Локальный текст', needsReview: true });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1400));
  });
  expect(api.PUT).not.toHaveBeenCalled();
});

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
  expect(
    screen.getByRole('navigation', { name: 'Основная навигация' }).closest('.dashboard-shell'),
  ).toBeTruthy();
  expect(document.querySelector('.dashboard-brand img')).toBeTruthy();
  await userEvent.click(await screen.findByRole('button', { name: 'Другие действия' }));
  await userEvent.click(screen.getByRole('button', { name: 'Исходный Markdown' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Исходный Markdown' }), ' дополнен');
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
  await userEvent.click(await screen.findByRole('button', { name: 'Другие действия' }));
  await userEvent.click(screen.getByRole('button', { name: 'Исходный Markdown' }));
  const body = screen.getByRole('textbox', { name: 'Исходный Markdown' });
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

it('разделяет структуру и текст и подтверждает удаление статьи', async () => {
  mount();
  await screen.findByLabelText('Статья 1.1');
  expect(screen.queryByLabelText(/Теория статьи/)).toBeNull();
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

it('автосохраняет новые правки после ответа на предыдущий снимок, сохраняя ввод доступным', async () => {
  let completeFirst!: (value: never) => void;
  vi.mocked(api.PUT).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        completeFirst = resolve;
      }),
  );
  vi.mocked(api.PUT).mockImplementation(
    async (_path, options) =>
      ({
        data: { ...course, revision: 'v3', sections: structureInput(options).body.sections },
        response: new Response(),
      }) as never,
  );
  mount('materials/article/edit');
  await userEvent.click(await screen.findByRole('button', { name: 'Другие действия' }));
  await userEvent.click(screen.getByRole('button', { name: 'Исходный Markdown' }));
  const body = screen.getByRole('textbox', { name: 'Исходный Markdown' }) as HTMLTextAreaElement;
  fireEvent.change(body, { target: { value: 'Первый снимок' } });
  await waitFor(() => expect(api.PUT).toHaveBeenCalledTimes(1), { timeout: 2500 });
  expect(body.disabled).toBe(false);
  fireEvent.change(body, { target: { value: 'Первый снимок и продолжение' } });
  await act(async () =>
    completeFirst({
      data: {
        ...course,
        revision: 'v2',
        sections: structureInput(vi.mocked(api.PUT).mock.calls[0]![1]).body.sections,
      },
      response: new Response(),
    } as never),
  );
  expect(body.value).toBe('Первый снимок и продолжение');
  await waitFor(() => expect(api.PUT).toHaveBeenCalledTimes(2), { timeout: 2500 });
  const sent = structureInput(vi.mocked(api.PUT).mock.calls[1]![1]).body;
  expect(sent.revision).toBe('v2');
  expect(sent.sections[0]!.articles[0]!.body).toBe('Первый снимок и продолжение');
  await screen.findByText('Материал сохранён');
}, 10000);

it('после обрыва связи повторяет прежний запрос и затем автоматически сохраняет новые правки', async () => {
  vi.mocked(api.PUT).mockRejectedValueOnce(new TypeError('Failed to fetch'));
  vi.mocked(api.PUT).mockImplementation(
    async (_path, options) =>
      ({
        data: { ...course, revision: 'v2', sections: structureInput(options).body.sections },
        response: new Response(),
      }) as never,
  );
  mount('materials/article/edit');
  await userEvent.click(await screen.findByRole('button', { name: 'Другие действия' }));
  await userEvent.click(screen.getByRole('button', { name: 'Исходный Markdown' }));
  const body = screen.getByRole('textbox', { name: 'Исходный Markdown' }) as HTMLTextAreaElement;
  fireEvent.change(body, { target: { value: 'До обрыва' } });
  await screen.findByRole('alert', {}, { timeout: 2500 });
  fireEvent.change(body, { target: { value: 'После обрыва' } });
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(api.PUT).toHaveBeenCalledTimes(3), { timeout: 3000 });
  const calls = vi.mocked(api.PUT).mock.calls;
  expect(structureInput(calls[0]![1]).body).toEqual(structureInput(calls[1]![1]).body);
  expect(structureInput(calls[0]![1]).headers).toEqual(structureInput(calls[1]![1]).headers);
  expect(structureInput(calls[2]![1]).headers).not.toEqual(structureInput(calls[1]![1]).headers);
  expect(structureInput(calls[2]![1]).body.sections[0]!.articles[0]!.body).toBe('После обрыва');
  expect(body.value).toBe('После обрыва');
  await screen.findByText('Материал сохранён');
}, 10000);

it('сохраняет пробел в конце названия после ответа автосохранения', async () => {
  vi.mocked(api.PUT).mockImplementation(async (_path, options) => {
    const sections = structureInput(options).body.sections.map((s) => ({
      ...s,
      articles: s.articles.map((a) => ({ ...a, title: a.title.trim() })),
    }));
    return { data: { ...course, revision: 'v2', sections }, response: new Response() } as never;
  });
  mount('materials/article/edit');
  const title = (await screen.findByRole('textbox', {
    name: 'Название статьи',
  })) as HTMLTextAreaElement;
  fireEvent.change(title, { target: { value: 'Первое слово ' } });
  await screen.findByText('Материал сохранён', {}, { timeout: 2500 });
  expect(title.value).toBe('Первое слово ');
});

it('отправляет отложенные правки при закрытии страницы редактора', async () => {
  vi.mocked(api.PUT).mockImplementation(
    async (_path, options) =>
      ({
        data: { ...course, revision: 'v2', sections: structureInput(options).body.sections },
        response: new Response(),
      }) as never,
  );
  const page = mount('materials/article/edit');
  const title = await screen.findByRole('textbox', { name: 'Название статьи' });
  fireEvent.change(title, { target: { value: 'Правка перед уходом' } });
  expect(api.PUT).not.toHaveBeenCalled();
  page.unmount();
  await waitFor(() => expect(api.PUT).toHaveBeenCalledTimes(1));
  expect(
    structureInput(vi.mocked(api.PUT).mock.calls[0]![1]).body.sections[0]!.articles[0]!.title,
  ).toBe('Правка перед уходом');
});

it('ссылка на копию только статьи передаёт режим текста в API', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: { ...course, author: { username: 'author' } },
  } as never);
  vi.mocked(api.POST).mockResolvedValue({ error: {} } as never);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/courses/copy/sample?article=article&text_only=1']}>
        <Routes>
          <Route path="/courses/copy/:slug" element={<CourseCopyPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Создать копию текста статьи' }));
  expect(api.POST).toHaveBeenCalledWith(
    '/api/v1/courses/{course_id}/copy',
    expect.objectContaining({
      body: { article_id: 'article', text_only: true },
    }),
  );
});
