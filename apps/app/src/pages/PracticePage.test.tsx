// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render as renderUI,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PythonWorkerRequest,
  PythonWorkerResponse,
} from '../features/practice/python-runner-protocol';
import {
  readPythonTaskProgress,
  recordPythonCheck,
  replacePythonTaskProgress,
  savePythonDraft,
} from '../features/practice/python-progress';
import { findPythonTask, pythonTasks } from '../features/practice/python-tasks';
import { useAuthStore, type User } from '../features/auth/auth-store';
import { api } from '../lib/api';
import { AppLayout } from '../layouts/AppLayout';
import { PracticePage, PythonPracticePage, PythonTaskPage } from './PracticePage';

const syncMocks = vi.hoisted(() => ({
  flush: vi.fn().mockResolvedValue({ ok: true, pending: 0 }),
  pendingCount: vi.fn().mockReturnValue(0),
  queue: vi.fn(),
  clear: vi.fn(),
  sync: vi.fn().mockResolvedValue({ ok: true, pending: 0 }),
}));

vi.mock('../features/practice/python-progress-sync', () => ({
  clearPendingPythonProgress: syncMocks.clear,
  flushPythonProgress: syncMocks.flush,
  pendingPythonProgressCount: syncMocks.pendingCount,
  queuePythonProgress: syncMocks.queue,
  syncPythonProgress: syncMocks.sync,
}));

const OriginalWorker = globalThis.Worker;

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return renderUI(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', user: { id: 'page-owner' } as User });
  syncMocks.sync.mockResolvedValue({ ok: true, pending: 0 });
  syncMocks.pendingCount.mockReturnValue(0);
  FakeBrowserWorker.instances = [];
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: FakeBrowserWorker,
  });
});

afterEach(() => {
  cleanup();
  useAuthStore.getState().becomeGuest();
  vi.restoreAllMocks();
  syncMocks.clear.mockClear();
  localStorage.clear();
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: OriginalWorker,
  });
});

describe('раздел практики', () => {
  it('не выдаёт нулевой прогресс за данные аккаунта во время загрузки', async () => {
    let finish!: () => void;
    syncMocks.sync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true, pending: 0 });
        }),
    );
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Загружаем прогресс…' })).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('link', { name: 'Все 46 задач Python' })).toBeTruthy();
    await act(async () => finish());
    expect(
      (await screen.findByRole('link', { name: 'Начать практику' })).getAttribute('href'),
    ).toBe('/practice/python/privetstvie-po-imeni');
  });

  it('выбирает последний незавершённый черновик и сохраняет его при ошибке синхронизации', async () => {
    const [first, second, third] = pythonTasks;
    if (!first || !second || !third) throw new Error('Нет задач');
    for (const [task, date] of [
      [first, '2026-11-16'],
      [second, '2026-11-17'],
    ] as const) {
      replacePythonTaskProgress(task, {
        ...readPythonTaskProgress(task),
        status: 'in_progress',
        draft: 'my draft',
        updatedAt: `${date}T00:00:00Z`,
      });
    }
    recordPythonCheck(third, 'done', true);
    syncMocks.sync.mockResolvedValueOnce({ ok: false, pending: 1 });
    syncMocks.pendingCount.mockReturnValue(1);
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Продолжить задачу' }).getAttribute('href')).toBe(
      `/practice/python/${second.slug}`,
    );
    expect(await screen.findByText(/В этом браузере решено 1 из 46 задач/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('В очереди: 1');
    expect(readPythonTaskProgress(second).draft).toBe('my draft');
    fireEvent.click(screen.getByRole('button', { name: 'Повторить синхронизацию' }));
    await screen.findByText('Сохранено в аккаунте');
    expect(screen.getByRole('link', { name: 'Продолжить задачу' }).getAttribute('href')).toBe(
      `/practice/python/${second.slug}`,
    );
  });

  it('показывает пришедший с сервера прогресс и переход к первой нерешённой задаче', async () => {
    const [first, second] = pythonTasks;
    if (!first || !second) throw new Error('Нет задач');
    syncMocks.sync.mockImplementationOnce(async () => {
      recordPythonCheck(first, 'saved on server', true);
      return { ok: true, pending: 0 };
    });
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );
    expect(
      (await screen.findByRole('link', { name: 'Следующая задача' })).getAttribute('href'),
    ).toBe(`/practice/python/${second.slug}`);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
  });

  it('после решения всех задач предлагает каталог без сброса решений', async () => {
    for (const task of pythonTasks) recordPythonCheck(task, 'saved solution', true);
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Все задачи решены' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Повторить задачи' }).getAttribute('href')).toBe(
      '/practice/python',
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('46');
    await screen.findByText('Сохранено в аккаунте');
    expect(pythonTasks.every((task) => readPythonTaskProgress(task).status === 'solved')).toBe(
      true,
    );
  });

  it('оставляет начало и каталог доступными после сетевого исключения', async () => {
    syncMocks.sync.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Начать практику' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Все 46 задач Python' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Не удалось синхронизировать');
    expect(screen.queryByText('Сохранено в аккаунте')).toBeNull();
  });

  it('добавлен в основную навигацию', () => {
    render(
      <MemoryRouter initialEntries={['/practice']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="practice" element={<PracticePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Практика' }).getAttribute('href')).toBe('/practice');
    expect(screen.getByRole('heading', { name: 'Практика', level: 1 })).toBeTruthy();
  });

  it('ведёт из списка тренажёров в каталог Python', () => {
    render(
      <MemoryRouter>
        <PracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Python/ }).getAttribute('href')).toBe(
      '/practice/python',
    );
  });

  it('показывает каталог во время загрузки и настоящий прогресс после неё', async () => {
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Python', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Приветствие по имени/ }).getAttribute('href')).toBe(
      '/practice/python/privetstvie-po-imeni',
    );
    expect(screen.getAllByText('46 задач')).toHaveLength(2);
    expect(screen.queryByRole('progressbar')).toBeNull();
    await screen.findByText('Сохранено в аккаунте');
    expect(
      screen
        .getByRole('progressbar', { name: 'Прогресс по задачам Python' })
        .getAttribute('aria-valuenow'),
    ).toBe('0');
  });

  it('показывает локальный прогресс и фильтрует задачи по статусу', () => {
    const task = pythonTasks[0];
    if (!task) throw new Error('Нет демонстрационной задачи');
    recordPythonCheck(task, 'print("готово")', true);
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Решено 1 из 46')).toBeTruthy();
    expect(screen.getByText('2%')).toBeTruthy();
    expect(screen.getAllByText('Решено')).toHaveLength(2);

    fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), {
      target: { value: 'in_progress' },
    });
    expect(screen.getByText('Нет задач с такими фильтрами')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(screen.getAllByRole('link', { name: /Приветствие по имени/ }).length).toBeGreaterThan(0);
  });

  it('сообщает об офлайн-очереди, не блокируя каталог', async () => {
    syncMocks.sync.mockResolvedValueOnce({ ok: false, pending: 2 });
    syncMocks.pendingCount.mockReturnValue(2);
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Не удалось синхронизировать · в очереди 2')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Приветствие по имени/ }).length).toBeGreaterThan(0);
  });
  it('продолжает последний черновик независимо от фильтра', async () => {
    const task = pythonTasks[3]!;
    savePythonDraft(task, 'number = 8');
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );
    await screen.findByText('Сохранено в аккаунте');
    fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), {
      target: { value: 'solved' },
    });
    expect(
      screen.getByRole('link', { name: 'Продолжить: Чётное число' }).getAttribute('href'),
    ).toBe(`/practice/python/${task.slug}`);
    expect(screen.getByText('Показано 0 из 46')).toBeTruthy();
  });

  it('повторяет синхронизацию каталога после ошибки', async () => {
    syncMocks.sync.mockResolvedValueOnce({ ok: false, pending: 0 });
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Сохранено в аккаунте')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull();
  });

  it('не удаляет черновик при отмене и сетевом сбое, позволяет повторить сброс', async () => {
    const task = pythonTasks[0]!;
    savePythonDraft(task, 'print("бережём черновик")');
    const remove = vi.spyOn(api, 'DELETE').mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );
    await screen.findByText('Сохранено в аккаунте');
    fireEvent.click(screen.getByText('Сбросить практику'));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить прогресс практики' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Удалить прогресс практики' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Не удалось удалить прогресс. Проверьте соединение и повторите попытку.',
    );
    expect(readPythonTaskProgress(task).draft).toContain('бережём черновик');
    expect(syncMocks.clear).not.toHaveBeenCalled();
    remove.mockResolvedValueOnce({
      data: undefined,
      response: new Response(null, { status: 204 }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    await waitFor(() => expect(syncMocks.clear).toHaveBeenCalledOnce());
    expect(readPythonTaskProgress(task).draft).toBe(task.starterCode);
    expect(screen.getByText('Решено 0 из 46')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('поздний сброс прошлого аккаунта не удаляет прогресс нового', async () => {
    const task = pythonTasks[0]!;
    savePythonDraft(task, 'owner draft');
    let finish!: (value: Awaited<ReturnType<typeof api.DELETE>>) => void;
    const remove = vi.spyOn(api, 'DELETE').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );
    await screen.findByText('Сохранено в аккаунте');
    fireEvent.click(screen.getByText('Сбросить практику'));
    fireEvent.click(screen.getByRole('button', { name: 'Удалить прогресс практики' }));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }));
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    const signal = (remove.mock.calls[0]?.[1] as unknown as { signal: AbortSignal }).signal;
    await act(async () => {
      useAuthStore.getState().authenticate({ id: 'other' } as User);
      savePythonDraft(task, 'other draft');
      finish({ data: undefined, response: new Response(null, { status: 204 }) });
    });
    expect(signal.aborted).toBe(true);
    expect(readPythonTaskProgress(task).draft).toBe('other draft');
  });
});

describe('демонстрационная задача', () => {
  it('не переносит результат старого worker в аккаунт, открывший ту же задачу', async () => {
    const task = pythonTasks[0]!;
    savePythonDraft(task, 'owner private draft');
    renderTask(`/practice/python/${task.slug}`);
    fireEvent.click(screen.getByRole('button', { name: 'Проверить решение' }));
    const worker = FakeBrowserWorker.instances[0];
    await act(async () => useAuthStore.getState().authenticate({ id: 'other' } as User));
    expect(screen.getByRole('textbox', { name: 'Код решения' }).textContent).toContain(
      'name = input()',
    );
    act(() =>
      worker?.emit({
        type: 'result',
        id: 1,
        result: { status: 'passed', stdout: '', stderr: '', durationMs: 1, truncated: false },
      }),
    );
    expect(readPythonTaskProgress(task).status).toBe('not_started');
    expect(screen.queryByRole('heading', { name: 'Задача решена' })).toBeNull();
  });

  it('имеет стабильный адрес и версию', () => {
    expect(pythonTasks).toHaveLength(46);
    expect(findPythonTask('privetstvie-po-imeni')).toMatchObject({
      id: 'python-greeting-by-name',
      version: 1,
    });
  });

  it('показывает условие, пример, редактируемый код и настоящий запуск', () => {
    renderTask('/practice/python/privetstvie-po-imeni');

    expect(screen.getByRole('heading', { name: 'Приветствие по имени', level: 1 })).toBeTruthy();
    expect(screen.getByText('Привет, Мира!')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Код решения' }).textContent).toContain(
      'name = input()',
    );
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Входные данные' }).value).toBe(
      'Мира',
    );
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Запустить' }).disabled).toBe(
      false,
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Проверить решение' }).disabled,
    ).toBe(false);
    expect(screen.getByText('Ctrl/⌘ + Enter — запустить код')).toBeTruthy();
    expect(screen.getByText('Нажмите «Запустить», чтобы увидеть вывод программы.')).toBeTruthy();
    fireEvent.click(screen.getByText('Нужна подсказка?'));
    expect(screen.getByText(/используйте f-строку/)).toBeTruthy();
  });

  it('восстанавливает черновик для текущей версии задачи', () => {
    const task = pythonTasks[0];
    if (!task) throw new Error('Нет демонстрационной задачи');
    savePythonDraft(task, 'print("мой черновик")');

    renderTask('/practice/python/privetstvie-po-imeni');

    expect(screen.getByRole('textbox', { name: 'Код решения' }).textContent).toContain(
      'print("мой черновик")',
    );
    expect(screen.getByText('В работе')).toBeTruthy();
  });

  it('запускает тест-кейсы и показывает первую полезную ошибку', async () => {
    renderTask('/practice/python/privetstvie-po-imeni');

    fireEvent.click(screen.getByRole('button', { name: 'Проверить решение' }));
    const worker = FakeBrowserWorker.instances[0];
    expect(worker?.message).toMatchObject({ type: 'check' });
    expect(worker?.message?.type === 'check' ? worker.message.checks : []).toHaveLength(3);

    act(() => {
      worker?.emit({
        type: 'result',
        id: 1,
        result: {
          status: 'failed',
          stdout: 'Мира\n',
          stderr: '',
          durationMs: 4,
          truncated: false,
          checks: [
            {
              name: 'Основной пример',
              passed: false,
              message: 'Ожидалось: «Привет, Мира!»\nПолучено: «Мира»',
            },
          ],
        },
      });
    });

    expect(await screen.findByText('Есть неверный ответ')).toBeTruthy();
    expect(screen.getByText('Ответ не совпал')).toBeTruthy();
    expect(screen.getByText(/Получено: «Мира»/)).toBeTruthy();
  });

  it('запускает код по Ctrl+Enter из редактора', async () => {
    renderTask('/practice/python/privetstvie-po-imeni');

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Код решения' }), {
      key: 'Enter',
      code: 'Enter',
      ctrlKey: true,
    });

    await waitFor(() => {
      expect(FakeBrowserWorker.instances[0]?.message).toMatchObject({ type: 'run' });
    });
  });

  it('отличает ошибку Python от неверного ответа', async () => {
    renderTask('/practice/python/privetstvie-po-imeni');

    fireEvent.click(screen.getByRole('button', { name: 'Проверить решение' }));
    act(() => {
      FakeBrowserWorker.instances[0]?.emit({
        type: 'result',
        id: 1,
        result: {
          status: 'runtime_error',
          stdout: '',
          stderr: 'SyntaxError: скобка не закрыта',
          durationMs: 2,
          truncated: false,
          checks: [
            {
              name: 'Основной пример',
              passed: false,
              message: 'Код завершился с ошибкой Python.',
            },
          ],
        },
      });
    });

    expect(await screen.findAllByText('Ошибка Python')).toHaveLength(2);
    expect(screen.queryByText('Ответ не совпал')).toBeNull();
    expect(screen.getByText(/SyntaxError/)).toBeTruthy();
  });

  it('показывает график matplotlib с доступной подписью', async () => {
    renderTask('/practice/python/matplotlib-lineynyy-grafik');

    fireEvent.click(screen.getByRole('button', { name: 'Запустить' }));
    act(() => {
      FakeBrowserWorker.instances[0]?.emit({
        type: 'result',
        id: 1,
        result: {
          status: 'completed',
          stdout: '',
          stderr: '',
          durationMs: 12,
          truncated: false,
          plots: [{ dataUrl: 'data:image/png;base64,cG5n', alt: 'Динамика' }],
        },
      });
    });

    const image = await screen.findByRole('img', { name: 'Динамика' });
    expect(image.getAttribute('src')).toBe('data:image/png;base64,cG5n');
    expect(screen.getByText('Динамика')).toBeTruthy();
  });

  it('сохраняет успешную проверку, показывает разбор и предлагает следующую задачу', async () => {
    const task = pythonTasks[0];
    if (!task) throw new Error('Нет демонстрационной задачи');
    renderTask('/practice/python/privetstvie-po-imeni');

    fireEvent.click(screen.getByRole('button', { name: 'Проверить решение' }));
    act(() => {
      FakeBrowserWorker.instances[0]?.emit({
        type: 'result',
        id: 1,
        result: {
          status: 'passed',
          stdout: '',
          stderr: '',
          durationMs: 3,
          truncated: false,
          checks: task.checks.map((check) => ({ name: check.name, passed: true })),
        },
      });
    });

    expect(await screen.findByRole('heading', { name: 'Задача решена' })).toBeTruthy();
    expect(screen.getByText('Проверок: 1')).toBeTruthy();
    fireEvent.click(screen.getByText('Посмотреть разбор и эталонное решение'));
    expect(screen.getByText(/input\(\) возвращает строку целиком/)).toBeTruthy();
    expect(screen.getByText(/print\(f"Привет/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Следующая задача' }).getAttribute('href')).toBe(
      '/practice/python/summa-dvuh-chisel',
    );
    expect(readPythonTaskProgress(task)).toMatchObject({
      status: 'solved',
      attempts: 1,
    });
  });

  it('объясняет, что делать при неизвестном адресе', () => {
    renderTask('/practice/python/net-takoy-zadachi');

    expect(screen.getByRole('alert').textContent).toContain('Задача не найдена');
    expect(screen.getByRole('link', { name: 'Вернуться к задачам' }).getAttribute('href')).toBe(
      '/practice/python',
    );
  });
});

function renderTask(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="practice/python/:taskSlug" element={<PythonTaskPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

class FakeBrowserWorker {
  static instances: FakeBrowserWorker[] = [];

  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<PythonWorkerResponse>) => void) | null = null;
  message: PythonWorkerRequest | null = null;

  constructor() {
    FakeBrowserWorker.instances.push(this);
  }

  postMessage(message: PythonWorkerRequest) {
    this.message = message;
  }

  terminate() {}

  emit(message: PythonWorkerResponse) {
    this.onmessage?.({ data: message } as MessageEvent<PythonWorkerResponse>);
  }
}
