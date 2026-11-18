// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, downloadFile } from '../lib/api';
import { ClassPage, ClassesPage, JoinClassPage, StudentReportPage } from './ClassesPage';

vi.mock('../lib/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn() },
  downloadFile: vi.fn(),
}));

const teacherClass = {
  id: 'class-1',
  title: '9Б — география',
  description: 'Столицы и страны',
  join_code: 'ABCDEFGH',
  requires_approval: false,
  archived_at: null,
  my_role: 'teacher',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  is_read_only: false,
  can_create_assignments: true,
};
const studentClass = { ...teacherClass, id: 'class-2', title: 'Биология', my_role: 'student' };
const assignment = {
  id: 'assignment-1',
  set_id: 'set-1',
  title: 'Выучить столицы',
  mode_required: 'learn',
  goal_type: 'cards_count',
  goal_value: 20,
  open_at: null,
  due_at: '2026-10-30T10:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  progress: null,
};

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/join" element={<JoinClassPage />} />
          <Route path="/classes/:classId" element={<ClassPage />} />
          <Route
            path="/classes/:classId/reports/students/:studentId"
            element={<StudentReportPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it('разделяет классы по роли и переключает ученический список', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: [teacherClass, studentClass] } as never);
  mount('/classes');

  expect(await screen.findByRole('button', { name: /9Б — география/ })).toBeTruthy();
  expect(screen.queryByText('Биология')).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: /Учусь/ }));
  expect(screen.getByRole('button', { name: /Биология/ })).toBeTruthy();
  expect(screen.queryByText('9Б — география')).toBeNull();
});

it('сразу открывает ученический список, если пользователь не преподаёт', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: [studentClass] } as never);
  mount('/classes');

  expect(await screen.findByRole('button', { name: /Биология/ })).toBeTruthy();
  expect(screen.getByRole('tab', { name: /Учусь/ }).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByText('Создайте первый класс')).toBeNull();
});

it('показывает преподавателю матрицу прогресса и ошибки карточек', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes/{class_id}') {
      return { data: { ...teacherClass, members: [] } } as never;
    }
    if (path === '/api/v1/classes/{class_id}/reports') {
      return {
        data: {
          class_id: 'class-1',
          generated_at: '2026-10-23T00:00:00Z',
          assignments: [{ ...assignment, set_title: 'Столицы' }],
          students: [
            {
              user_id: 'student-1',
              username: 'maria',
              display_name: 'Мария',
              assignments: {
                'assignment-1': {
                  progress_value: 12,
                  status: 'in_progress',
                  completed_at: null,
                  last_activity_at: '2026-10-22T10:00:00Z',
                },
              },
            },
          ],
        },
      } as never;
    }
    if (path === '/api/v1/classes/{class_id}/reports/cards') {
      return {
        data: {
          class_id: 'class-1',
          generated_at: '2026-10-23T00:00:00Z',
          cards: [
            {
              card_id: 'card-1',
              set_id: 'set-1',
              set_title: 'Столицы',
              term: 'Франция',
              definition: 'Париж',
              answers_count: 10,
              errors_count: 4,
              students_with_errors: 3,
              error_percent: 40,
            },
          ],
        },
      } as never;
    }
    return { data: [] } as never;
  });
  mount('/classes/class-1');

  expect(await screen.findByRole('heading', { name: 'Прогресс класса' })).toBeTruthy();
  expect(await screen.findByRole('link', { name: 'Мария' })).toBeTruthy();
  expect(screen.getByText('12 из 20')).toBeTruthy();
  expect(await screen.findByText('Франция')).toBeTruthy();
  expect(screen.getByLabelText('40 процентов ответов с ошибкой')).toBeTruthy();
});

it('объясняет режим просмотра и скрывает создание задания', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes/{class_id}') {
      return {
        data: {
          ...teacherClass,
          is_read_only: true,
          can_create_assignments: false,
          members: [],
        },
      } as never;
    }
    return { data: [] } as never;
  });
  mount('/classes/class-1');

  expect(await screen.findByRole('heading', { name: 'Класс доступен для просмотра' })).toBeTruthy();
  expect(
    screen.getByText('Материалы, ученики и прежние задания остаются на месте.', { exact: false }),
  ).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Новое задание' })).toBeNull();
});

it('открывает подробный отчёт ученика', async () => {
  vi.mocked(api.GET).mockResolvedValue({
    data: {
      class_id: 'class-1',
      user_id: 'student-1',
      username: 'maria',
      display_name: 'Мария',
      generated_at: '2026-10-23T00:00:00Z',
      assignments: [
        {
          ...assignment,
          set_title: 'Столицы',
          progress: {
            progress_value: 20,
            status: 'done',
            completed_at: '2026-10-22T10:00:00Z',
            last_activity_at: '2026-10-22T10:00:00Z',
          },
        },
      ],
    },
  } as never);
  mount('/classes/class-1/reports/students/student-1');

  expect(await screen.findByRole('heading', { name: 'Мария' })).toBeTruthy();
  expect(screen.getByText('Выполнено 1 из 1', { exact: false })).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Прогресс: Выучить столицы' })).toBeTruthy();
});

it('показывает ученику задания и переход в требуемый режим', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes/{class_id}') {
      return { data: { ...studentClass, members: [] } } as never;
    }
    if (path === '/api/v1/classes/{class_id}/assignments') {
      return {
        data: [
          {
            ...assignment,
            progress: {
              progress_value: 12,
              status: 'in_progress',
              completed_at: null,
              last_activity_at: '2026-10-22T10:00:00Z',
            },
          },
        ],
      } as never;
    }
    return { data: [{ set_id: 'set-1', title: 'Столицы', cards_count: 20 }] } as never;
  });
  mount('/classes/class-2');

  expect(await screen.findByRole('heading', { name: 'Мои задания' })).toBeTruthy();
  const progress = await screen.findByRole('progressbar', {
    name: 'Прогресс задания Выучить столицы',
  });
  expect(progress.getAttribute('aria-valuenow')).toBe('12');
  expect(progress.getAttribute('aria-valuemax')).toBe('20');
  expect(screen.getByRole('link', { name: 'Продолжить' }).getAttribute('href')).toBe(
    '/sets/set-1/learn',
  );
  expect(screen.getByRole('link', { name: /Столицы/ }).getAttribute('href')).toBe('/sets/set-1');
});

function mockClasses(items = [teacherClass, studentClass]) {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes') return { data: items } as never;
    if (path === '/api/v1/classes/{class_id}')
      return { data: { ...items[0], members: [] } } as never;
    if (path === '/api/v1/classes/{class_id}/reports')
      return { data: { assignments: [], students: [] } } as never;
    if (path === '/api/v1/classes/{class_id}/reports/cards')
      return { data: { cards: [] } } as never;
    return { data: [] } as never;
  });
}

it('позволяет ученику открыть пустую преподавательскую вкладку с клавиатуры', async () => {
  mockClasses([studentClass]);
  mount('/classes');
  const learning = await screen.findByRole('tab', { name: /Учусь/ });
  await waitFor(() => expect(learning.getAttribute('aria-selected')).toBe('true'));
  learning.focus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(screen.getByRole('tab', { name: /Преподаю/ }).getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Преподаю/ }));
  expect(screen.getByRole('heading', { name: 'Создайте первый класс' })).toBeTruthy();
});

it('выбирает класс из адреса и раскрывает полное описание без потери названия', async () => {
  const description = 'Учебный материал. '.repeat(30) + 'Последняя строка описания.';
  mockClasses([
    teacherClass,
    {
      ...teacherClass,
      id: 'long',
      title: 'Длинное название класса для подготовки к экзаменам',
      description,
    },
  ]);
  mount('/classes?role=teaching&class=long');
  expect(await screen.findByRole('heading', { name: /Длинное название класса/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Открыть класс' }).getAttribute('href')).toBe(
    '/classes/long',
  );
  expect(screen.queryByText(/Последняя строка описания/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Полное описание' }));
  expect(screen.getByText(description)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /9Б — география/ }));
  expect(screen.getByRole('heading', { name: '9Б — география' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Свернуть описание' })).toBeNull();
});

it('сохраняет введённое название при сетевой ошибке и создаёт класс после повтора', async () => {
  mockClasses();
  vi.mocked(api.POST)
    .mockRejectedValueOnce(new Error('Соединение потеряно'))
    .mockResolvedValueOnce({ data: teacherClass } as never);
  mount('/classes');
  await screen.findByRole('button', { name: /9Б — география/ });
  const trigger = screen.getByRole('button', { name: 'Создать класс' });
  await userEvent.click(trigger);
  const input = screen.getByRole('textbox', { name: 'Название' });
  expect(document.activeElement).toBe(input);
  await userEvent.type(input, '  Новый класс  ');
  await userEvent.click(screen.getByRole('button', { name: 'Создать и открыть' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Соединение потеряно');
  expect(input).toHaveProperty('value', '  Новый класс  ');
  await userEvent.click(screen.getByRole('button', { name: 'Создать и открыть' }));
  expect(await screen.findByRole('heading', { name: 'Прогресс класса' })).toBeTruthy();
  expect(api.POST).toHaveBeenLastCalledWith('/api/v1/classes', {
    body: { title: 'Новый класс', description: '', requires_approval: false },
  });
});

it('возвращает фокус после закрытия формы и сохраняет черновик названия', async () => {
  mockClasses();
  mount('/classes');
  await screen.findByRole('button', { name: /9Б — география/ });
  const trigger = screen.getByRole('button', { name: 'Создать класс' });
  await userEvent.click(trigger);
  await userEvent.type(screen.getByRole('textbox', { name: 'Название' }), 'Черновик');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await userEvent.click(trigger);
  expect(screen.getByRole('textbox', { name: 'Название' })).toHaveProperty('value', 'Черновик');
});

it('отправляет нормализованный код один раз и показывает успешную заявку', async () => {
  mockClasses();
  let resolveJoin: (value: never) => void = () => {};
  vi.mocked(api.POST).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveJoin = resolve;
      }),
  );
  mount('/classes');
  await userEvent.click(screen.getByRole('button', { name: 'Вступить по коду' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Код приглашения' }), ' abcdefgh ');
  const submit = screen.getByRole('button', { name: 'Вступить' });
  await userEvent.dblClick(submit);
  expect(api.POST).toHaveBeenCalledTimes(1);
  expect(api.POST).toHaveBeenCalledWith('/api/v1/classes/join', {
    body: { join_code: 'ABCDEFGH' },
  });
  resolveJoin({
    data: { class_id: 'pending', class_title: 'Новый класс', status: 'pending' },
  } as never);
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'Заявка в класс «Новый класс» отправлена. Класс появится после одобрения преподавателем.',
  );
  expect(screen.getByRole('button', { name: 'Заявка отправлена' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('открывает класс при вступлении без одобрения', async () => {
  mockClasses([studentClass]);
  vi.mocked(api.POST).mockResolvedValue({
    data: { class_id: 'class-2', status: 'active' },
  } as never);
  mount('/classes');
  await screen.findByRole('button', { name: /Биология/ });
  await userEvent.click(screen.getByRole('button', { name: 'Вступить по коду' }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Код приглашения' }), 'ABCDEFGH');
  await userEvent.click(screen.getByRole('button', { name: 'Вступить' }));
  expect(await screen.findByRole('heading', { name: 'Мои задания' })).toBeTruthy();
});

it('приглашение требует нажатия и показывает ожидание одобрения без ошибки', async () => {
  mockClasses();
  vi.mocked(api.POST).mockResolvedValue({
    data: { class_id: 'class-1', status: 'pending' },
  } as never);
  mount('/classes/join?code=abcdefgh');
  expect(api.POST).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Вступить в класс' }));
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'Заявка отправлена. Класс появится после одобрения преподавателем.',
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('не отправляет приглашение с некорректной длиной кода', () => {
  mount('/classes/join?code=ABCDEFGH12345');
  expect(screen.getByRole('button', { name: 'Вступить в класс' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect(screen.getByRole('alert').textContent).toContain('В ссылке нет действующего кода');
  expect(api.POST).not.toHaveBeenCalled();
});

it('не предлагает ассистенту приглашения, сохраняя материалы, задания и отчёт', async () => {
  mockClasses([{ ...teacherClass, my_role: 'assistant' }]);
  mount('/classes/class-1');
  expect(await screen.findByRole('heading', { name: 'Прогресс класса' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Скопировать приглашение' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Скачать XLSX' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Новое задание' })).toBeTruthy();
});

const material = { set_id: 'set-1', title: 'Столицы', cards_count: 20 };
const pendingMember = {
  id: 'member-1',
  user_id: 'student-1',
  username: 'maria',
  display_name: 'Мария',
  status: 'pending',
  role: 'student',
};
function mockWorkspace(overrides: Record<string, unknown> = {}) {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes/{class_id}')
      return { data: { ...teacherClass, members: [pendingMember], ...overrides } } as never;
    if (path === '/api/v1/classes/{class_id}/reports')
      return { data: { assignments: [], students: [] } } as never;
    if (path === '/api/v1/classes/{class_id}/reports/cards')
      return { data: { cards: [] } } as never;
    if (path === '/api/v1/classes/{class_id}/sets') return { data: [material] } as never;
    if (path === '/api/v1/sets')
      return { data: [{ id: 'set-2', title: 'Реки', cards_count: 12 }] } as never;
    return { data: [] } as never;
  });
}

it('сохраняет черновик задания после обрыва сети и публикует правильную цель после повтора', async () => {
  mockWorkspace();
  vi.mocked(api.POST)
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce({ data: assignment } as never);
  mount('/classes/class-1');
  const title = await screen.findByLabelText('Название задания');
  await userEvent.type(title, '  Проверка столиц  ');
  await userEvent.selectOptions(screen.getByLabelText('Набор'), 'set-1');
  await userEvent.selectOptions(screen.getByLabelText('Цель'), 'test_score');
  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать задание' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.',
  );
  expect(title).toHaveProperty('value', '  Проверка столиц  ');
  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать задание' }));
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'Задание опубликовано для класса.',
  );
  expect(api.POST).toHaveBeenLastCalledWith('/api/v1/classes/{class_id}/assignments', {
    params: { path: { class_id: 'class-1' } },
    body: {
      set_id: 'set-1',
      title: 'Проверка столиц',
      goal_type: 'test_score',
      goal_value: 80,
      mode_required: 'test',
      due_at: null,
      open_at: null,
    },
  });
  expect(title).toHaveProperty('value', '');
});

it('не отправляет дубликат задания, пока публикация не завершилась', async () => {
  mockWorkspace();
  vi.mocked(api.POST).mockImplementation(() => new Promise(() => {}));
  mount('/classes/class-1');
  await userEvent.type(await screen.findByLabelText('Название задания'), 'Столицы');
  await userEvent.selectOptions(screen.getByLabelText('Набор'), 'set-1');
  await userEvent.dblClick(screen.getByRole('button', { name: 'Опубликовать задание' }));
  expect(api.POST).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Название задания').closest('fieldset')?.disabled).toBe(true);
});

it('ассистенту недоступны заявки и приглашение, но доступны задания и материалы', async () => {
  mockWorkspace({ my_role: 'assistant' });
  mount('/classes/class-1');
  await screen.findByRole('heading', { name: 'Прогресс класса' });
  expect(screen.queryByRole('button', { name: 'Принять' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Заявки на вступление' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Скопировать приглашение' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Опубликовать задание' })).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Добавить в класс' })).toBeTruthy();
});

it('в режиме просмотра сохраняет материалы и отчёт, скрывает изменяющие действия', async () => {
  mockWorkspace({ is_read_only: true, can_create_assignments: false });
  mount('/classes/class-1');
  await screen.findByRole('heading', { name: 'Класс доступен для просмотра' });
  expect(await screen.findByRole('link', { name: /Столицы/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Скачать XLSX' })).toBeTruthy();
  for (const name of [
    'Принять',
    'Опубликовать задание',
    'Добавить в класс',
    'Скопировать приглашение',
  ])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(api.GET).not.toHaveBeenCalledWith('/api/v1/sets');
});

it('добавляет материал после сетевой ошибки без потери выбора', async () => {
  mockWorkspace();
  vi.mocked(api.POST)
    .mockRejectedValueOnce(new Error('Связь прервалась'))
    .mockResolvedValueOnce({ data: material } as never);
  mount('/classes/class-1');
  await screen.findByLabelText('Добавить мой набор');
  await userEvent.selectOptions(screen.getByLabelText('Добавить мой набор'), 'set-2');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить в класс' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Связь прервалась');
  expect(screen.getByLabelText('Добавить мой набор')).toHaveProperty('value', 'set-2');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить в класс' }));
  expect(await screen.findByRole('status')).toHaveProperty(
    'textContent',
    'Набор добавлен в класс.',
  );
  expect(api.POST).toHaveBeenLastCalledWith('/api/v1/classes/{class_id}/sets', {
    params: { path: { class_id: 'class-1' } },
    body: { set_id: 'set-2' },
  });
});

it('принимает заявку и сообщает результат', async () => {
  mockWorkspace();
  vi.mocked(api.POST).mockResolvedValue({ data: {} } as never);
  mount('/classes/class-1');
  await userEvent.click(await screen.findByRole('button', { name: 'Принять' }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Заявка принята.');
  expect(api.POST).toHaveBeenCalledWith('/api/v1/classes/{class_id}/members/{member_id}/approve', {
    params: { path: { class_id: 'class-1', member_id: 'member-1' } },
  });
});

it('показывает ошибку выгрузки и позволяет повторить её', async () => {
  mockWorkspace();
  vi.mocked(downloadFile)
    .mockRejectedValueOnce(new Error('Не удалось подготовить документ'))
    .mockResolvedValueOnce();
  mount('/classes/class-1');
  await userEvent.click(await screen.findByRole('button', { name: 'Скачать XLSX' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Не удалось подготовить документ',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Скачать XLSX' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(downloadFile).toHaveBeenLastCalledWith(
    '/api/v1/classes/class-1/reports.xlsx',
    'Отчёт — 9Б — география.xlsx',
  );
});

it('при обрыве сети в приглашении разрешает повтор и открывает класс после вступления', async () => {
  mockWorkspace({ my_role: 'student' });
  vi.mocked(api.POST)
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce({ data: { class_id: 'class-1', status: 'active' } } as never);
  mount('/classes/join?code=abcdefgh');
  await userEvent.click(screen.getByRole('button', { name: 'Вступить в класс' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Не удалось связаться с сервером. Проверьте соединение и попробуйте ещё раз.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Вступить в класс' }));
  expect(await screen.findByRole('heading', { name: 'Мои задания' })).toBeTruthy();
});

it('сохраняет обучение после дедлайна и скрывает переход до даты открытия', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes/{class_id}')
      return { data: { ...studentClass, members: [] } } as never;
    if (path === '/api/v1/classes/{class_id}/assignments')
      return {
        data: [
          {
            ...assignment,
            id: 'late',
            mode_required: null,
            goal_type: 'test_score',
            progress: { status: 'late', progress_value: 10 },
          },
          {
            ...assignment,
            id: 'future',
            title: 'Будущее задание',
            open_at: '2099-01-01T00:00:00Z',
          },
        ],
      } as never;
    return { data: [material] } as never;
  });
  mount('/classes/class-2');
  const link = await screen.findByRole('link', { name: 'Продолжить' });
  expect(link.getAttribute('href')).toBe('/sets/set-1/test');
  expect(screen.getByText('Просрочено')).toBeTruthy();
  expect(screen.getByText(/Откроется/)).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'Продолжить' })).toHaveLength(1);
});

it('не выдаёт отсутствие прогресса за нулевой результат и ограничивает aria-значение целью', async () => {
  vi.mocked(api.GET).mockImplementation(async (path) => {
    if (path === '/api/v1/classes/{class_id}')
      return { data: { ...teacherClass, members: [] } } as never;
    return {
      data: {
        username: 'maria',
        assignments: [
          { ...assignment, id: 'missing', title: 'Без данных', progress: null },
          { ...assignment, progress: { status: 'done', progress_value: 24 } },
        ],
      },
    } as never;
  });
  mount('/classes/class-1/reports/students/student-1');
  expect(await screen.findByText('Нет данных о прогрессе')).toBeTruthy();
  expect(screen.getByText('24 из 20')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('20');
  expect(screen.getByRole('progressbar').getAttribute('aria-valuetext')).toBe('24 из 20');
});
