// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PythonWorkerRequest,
  PythonWorkerResponse,
} from '../features/practice/python-runner-protocol';
import {
  readPythonTaskProgress,
  recordPythonCheck,
  savePythonDraft,
} from '../features/practice/python-progress';
import { findPythonTask, pythonTasks } from '../features/practice/python-tasks';
import { AppLayout } from '../layouts/AppLayout';
import { PracticePage, PythonPracticePage, PythonTaskPage } from './PracticePage';

const syncMocks = vi.hoisted(() => ({
  flush: vi.fn().mockResolvedValue({ ok: true, pending: 0 }),
  pendingCount: vi.fn().mockReturnValue(0),
  queue: vi.fn(),
  sync: vi.fn().mockResolvedValue({ ok: true, pending: 0 }),
}));

vi.mock('../features/practice/python-progress-sync', () => ({
  flushPythonProgress: syncMocks.flush,
  pendingPythonProgressCount: syncMocks.pendingCount,
  queuePythonProgress: syncMocks.queue,
  syncPythonProgress: syncMocks.sync,
}));

const OriginalWorker = globalThis.Worker;

beforeEach(() => {
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
  localStorage.clear();
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: OriginalWorker,
  });
});

describe('раздел практики', () => {
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

  it('показывает статический каталог задач', () => {
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Python', level: 1 })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Приветствие по имени/ }).getAttribute('href')).toBe(
      '/practice/python/privetstvie-po-imeni',
    );
    expect(screen.getAllByText('18 задач')).toHaveLength(2);
    expect(
      screen
        .getByRole('progressbar', { name: 'Прогресс по задачам Python' })
        .getAttribute('aria-valuenow'),
    ).toBe('0');
  });

  it('показывает локальный прогресс и фильтрует задачи по статусу', () => {
    const task = pythonTasks[0];
    if (!task) throw new Error('Нет демонстрационной задачи');
    recordPythonCheck(task, 'print("готово")', true, localStorage);
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Решено 1 из 18')).toBeTruthy();
    expect(screen.getByText('6%')).toBeTruthy();
    expect(screen.getAllByText('Решено')).toHaveLength(2);

    fireEvent.change(screen.getByRole('combobox', { name: 'Статус' }), {
      target: { value: 'in_progress' },
    });
    expect(screen.getByText('Нет задач с такими фильтрами')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(screen.getByRole('link', { name: /Приветствие по имени/ })).toBeTruthy();
  });

  it('сообщает об офлайн-очереди, не блокируя каталог', async () => {
    syncMocks.sync.mockResolvedValueOnce({ ok: false, pending: 2 });
    syncMocks.pendingCount.mockReturnValue(2);
    render(
      <MemoryRouter>
        <PythonPracticePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Офлайн · в очереди 2')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Приветствие по имени/ })).toBeTruthy();
  });
});

describe('демонстрационная задача', () => {
  it('имеет стабильный адрес и версию', () => {
    expect(pythonTasks).toHaveLength(18);
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
    savePythonDraft(task, 'print("мой черновик")', localStorage);

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
    expect(readPythonTaskProgress(task, localStorage)).toMatchObject({
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
