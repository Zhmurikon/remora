// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  PythonWorkerRequest,
  PythonWorkerResponse,
} from '../features/practice/python-runner-protocol';
import { findPythonTask, pythonTasks } from '../features/practice/python-tasks';
import { AppLayout } from '../layouts/AppLayout';
import { PracticePage, PythonPracticePage, PythonTaskPage } from './PracticePage';

const OriginalWorker = globalThis.Worker;

beforeEach(() => {
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
    expect(screen.getByText('1 из 20')).toBeTruthy();
  });
});

describe('демонстрационная задача', () => {
  it('имеет стабильный адрес и версию', () => {
    expect(pythonTasks).toHaveLength(1);
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
