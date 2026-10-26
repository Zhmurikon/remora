// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { ClassPage, ClassesPage, StudentReportPage } from './ClassesPage';

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

  expect(await screen.findByText('9Б — география')).toBeTruthy();
  expect(screen.queryByText('Биология')).toBeNull();
  await userEvent.click(screen.getByRole('tab', { name: /Учусь/ }));
  expect(screen.getByText('Биология')).toBeTruthy();
  expect(screen.queryByText('9Б — география')).toBeNull();
});

it('сразу открывает ученический список, если пользователь не преподаёт', async () => {
  vi.mocked(api.GET).mockResolvedValue({ data: [studentClass] } as never);
  mount('/classes');

  expect(await screen.findByText('Биология')).toBeTruthy();
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
  expect(screen.getByText('выполнено 1 из 1', { exact: false })).toBeTruthy();
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
