import { describe, expect, it } from 'vitest';
import type { PythonTask } from './python-tasks';
import {
  markPythonTaskStarted,
  pythonProgressSummary,
  readPythonTaskProgress,
  recordPythonCheck,
  savePythonDraft,
} from './python-progress';

describe('локальный прогресс Python', () => {
  it('сохраняет черновик и отделяет версии одной задачи', () => {
    const storage = new MemoryStorage();
    const first = task(1);
    const second = task(2);

    savePythonDraft(first, 'print("черновик")', storage);

    expect(readPythonTaskProgress(first, storage)).toMatchObject({
      draft: 'print("черновик")',
      status: 'in_progress',
    });
    expect(readPythonTaskProgress(second, storage)).toMatchObject({
      draft: second.starterCode,
      status: 'not_started',
    });
  });

  it('восстанавливается после повреждённой записи', () => {
    const storage = new MemoryStorage();
    const currentTask = task(1);
    storage.setItem('remora.practice.python.progress:demo:v1', '{не json');

    expect(readPythonTaskProgress(currentTask, storage)).toEqual({
      taskId: 'demo',
      taskVersion: 1,
      draft: currentTask.starterCode,
      status: 'not_started',
      attempts: 0,
    });
    expect(storage.length).toBe(0);
  });

  it('считает проверки и не понижает уже решённую задачу', () => {
    const storage = new MemoryStorage();
    const currentTask = task(1);

    markPythonTaskStarted(currentTask, currentTask.starterCode, storage);
    recordPythonCheck(currentTask, 'print("ok")', true, storage);
    const progress = recordPythonCheck(currentTask, 'print("ошибка")', false, storage);

    expect(progress).toMatchObject({ status: 'solved', attempts: 2, draft: 'print("ошибка")' });
    expect(pythonProgressSummary([currentTask], storage)).toMatchObject({
      solved: 1,
      inProgress: 0,
    });
  });

  it('продолжает работу, когда localStorage недоступен для записи', () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;

    expect(savePythonDraft(task(1), 'print(1)', storage)).toMatchObject({
      draft: 'print(1)',
      status: 'in_progress',
    });
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
