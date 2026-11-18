import { useAuthStore, type User } from '../auth/auth-store';
import { capturePythonProgressScope, pythonStorageKey } from './python-progress-scope';
beforeEach(() => useAuthStore.setState({ status: 'authenticated', user: { id: 'owner' } as User }));
import { beforeEach, describe, expect, it } from 'vitest';
import type { PythonTask } from './python-tasks';
import {
  deletePythonPracticeProgress,
  markPythonTaskStarted,
  pythonProgressSummary,
  readPythonTaskProgress,
  recordPythonCheck,
  savePythonDraft,
} from './python-progress';

describe('локальный прогресс Python', () => {
  it('сохраняет черновик и отделяет версии одной задачи', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    const first = task(1);
    const second = task(2);

    savePythonDraft(first, 'print("черновик")', scope);

    expect(readPythonTaskProgress(first, scope)).toMatchObject({
      draft: 'print("черновик")',
      status: 'in_progress',
    });
    expect(readPythonTaskProgress(second, scope)).toMatchObject({
      draft: second.starterCode,
      status: 'not_started',
    });
  });

  it('восстанавливается после повреждённой записи', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    const currentTask = task(1);
    storage.setItem(pythonStorageKey(scope, 'progress:demo:v1'), '{не json');

    expect(readPythonTaskProgress(currentTask, scope)).toEqual({
      taskId: 'demo',
      taskVersion: 1,
      draft: currentTask.starterCode,
      status: 'not_started',
      attempts: 0,
      updatedAt: new Date(0).toISOString(),
    });
    expect(storage.length).toBe(0);
  });

  it('считает проверки и не понижает уже решённую задачу', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    const currentTask = task(1);

    markPythonTaskStarted(currentTask, currentTask.starterCode, scope);
    recordPythonCheck(currentTask, 'print("ok")', true, scope);
    const progress = recordPythonCheck(currentTask, 'print("ошибка")', false, scope);

    expect(progress).toMatchObject({ status: 'solved', attempts: 2, draft: 'print("ошибка")' });
    expect(pythonProgressSummary([currentTask], scope)).toMatchObject({
      solved: 1,
      inProgress: 0,
    });
  });

  it('продолжает работу, когда localStorage недоступен для записи', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    storage.failWrites = true;

    expect(savePythonDraft(task(1), 'print(1)', scope)).toMatchObject({
      draft: 'print(1)',
      status: 'in_progress',
    });
  });

  it('сохраняет локальный черновик прежнего формата без времени изменения', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    const currentTask = task(1);
    storage.setItem(
      pythonStorageKey(scope, 'progress:demo:v1'),
      JSON.stringify({
        taskId: 'demo',
        taskVersion: 1,
        draft: 'старый черновик',
        status: 'in_progress',
        attempts: 3,
      }),
    );

    expect(readPythonTaskProgress(currentTask, scope)).toMatchObject({
      draft: 'старый черновик',
      status: 'in_progress',
      attempts: 3,
      updatedAt: new Date(0).toISOString(),
    });
  });

  it('удаляет локальный прогресс всех переданных задач', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    const first = task(1);
    const second = task(2);
    savePythonDraft(first, 'первый', scope);
    savePythonDraft(second, 'второй', scope);

    deletePythonPracticeProgress([first, second], scope);

    expect(storage.length).toBe(0);
    expect(readPythonTaskProgress(first, scope).status).toBe('not_started');
    expect(readPythonTaskProgress(second, scope).status).toBe('not_started');
  });
  it('сброс и поздний результат одного сеанса не затрагивают другого владельца', () => {
    const storage = new MemoryStorage();
    const owner = capturePythonProgressScope(storage);
    savePythonDraft(task(1), 'owner draft', owner);
    useAuthStore.getState().authenticate({ id: 'other' } as User);
    const other = capturePythonProgressScope(storage);
    savePythonDraft(task(1), 'other draft', other);
    recordPythonCheck(task(1), 'late owner result', true, owner);
    deletePythonPracticeProgress([task(1)], owner);
    expect(readPythonTaskProgress(task(1), other).draft).toBe('other draft');
    deletePythonPracticeProgress([task(1)], other);
    useAuthStore.getState().authenticate({ id: 'owner' } as User);
    expect(readPythonTaskProgress(task(1), capturePythonProgressScope(storage)).draft).toBe(
      'owner draft',
    );
  });
});

function task(version: number): PythonTask {
  return {
    id: 'demo',
    slug: 'demo',
    version,
    title: 'Демо',
    topic: 'Основы',
    difficulty: 'Начальная',
    summary: 'Описание',
    statement: 'Условие',
    starterCode: '# код\n',
    examples: [],
    checks: [],
    hint: 'Подсказка',
    explanation: 'Разбор',
    referenceSolution: 'pass\n',
    commonWrongSolutions: ['raise NotImplementedError\n'],
  };
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  failWrites = false;

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    this.values.set(key, value);
  }
}
