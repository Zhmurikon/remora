import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPythonTaskProgress, replacePythonTaskProgress } from './python-progress';
import {
  flushPythonProgress,
  mergeProgress,
  pendingPythonProgressCount,
  queuePythonProgress,
  syncPythonProgress,
} from './python-progress-sync';
import type { PythonTask } from './python-tasks';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  api: { GET: apiMocks.get, PUT: apiMocks.put },
}));

const currentTask = task();
const oldTime = '2026-09-28T01:00:00.000Z';
const newTime = '2026-09-28T02:00:00.000Z';

afterEach(() => {
  apiMocks.get.mockReset();
  apiMocks.put.mockReset();
});

describe('синхронизация прогресса Python', () => {
  it('берёт лучший статус, максимум попыток и самый свежий черновик', () => {
    expect(
      mergeProgress(
        progress({ status: 'solved', attempts: 2, draft: 'old', updatedAt: oldTime }),
        progress({ status: 'in_progress', attempts: 5, draft: 'new', updatedAt: newTime }),
      ),
    ).toMatchObject({ status: 'solved', attempts: 5, draft: 'new', updatedAt: newTime });
  });

  it('схлопывает изменения задачи и сохраняет очередь после сетевой ошибки', async () => {
    const storage = new MemoryStorage();
    queuePythonProgress(progress({ draft: 'first' }), storage);
    queuePythonProgress(progress({ draft: 'second', attempts: 2 }), storage);
    expect(pendingPythonProgressCount(storage)).toBe(1);

    apiMocks.put.mockResolvedValueOnce({ error: { code: 'NETWORK' } });
    expect(await flushPythonProgress([currentTask], storage)).toEqual({
      ok: false,
      pending: 1,
    });
    expect(pendingPythonProgressCount(storage)).toBe(1);

    apiMocks.put.mockResolvedValueOnce({ data: server({ draft: 'second', attempts: 2 }) });
    expect(await flushPythonProgress([currentTask], storage)).toEqual({ ok: true, pending: 0 });
    expect(pendingPythonProgressCount(storage)).toBe(0);
  });

  it('объединяет серверный прогресс с локальным и не понижает решение', async () => {
    const storage = new MemoryStorage();
    replacePythonTaskProgress(
      currentTask,
      progress({ status: 'solved', attempts: 3, draft: 'local', updatedAt: oldTime }),
      storage,
    );
    apiMocks.get.mockResolvedValueOnce({
      data: [server({ status: 'in_progress', attempts: 5, draft: 'remote', updatedAt: newTime })],
    });
    apiMocks.put.mockResolvedValueOnce({
      data: server({ status: 'solved', attempts: 5, draft: 'remote', updatedAt: newTime }),
    });

    expect(await syncPythonProgress([currentTask], storage)).toEqual({ ok: true, pending: 0 });
    expect(readPythonTaskProgress(currentTask, storage)).toMatchObject({
      status: 'solved',
      attempts: 5,
      draft: 'remote',
    });
  });
});

function progress(overrides: Partial<ReturnType<typeof readPythonTaskProgress>> = {}) {
  return {
    taskId: currentTask.id,
    taskVersion: currentTask.version,
    status: 'in_progress' as const,
    attempts: 1,
    draft: 'draft',
    updatedAt: oldTime,
    ...overrides,
  };
}

function server(
  overrides: Partial<{
    status: 'not_started' | 'in_progress' | 'solved';
    attempts: number;
    draft: string;
    updatedAt: string;
  }> = {},
) {
  const value = {
    status: 'in_progress' as const,
    attempts: 1,
    draft: 'draft',
    updatedAt: oldTime,
    ...overrides,
  };
  return {
    task_id: currentTask.id,
    task_version: currentTask.version,
    status: value.status,
    attempts: value.attempts,
    draft: value.draft,
    draft_updated_at: value.updatedAt,
    updated_at: value.updatedAt,
    last_client_mutation_id: '00000000-0000-4000-8000-000000000001',
  };
}

function task(): PythonTask {
  return {
    id: 'python-demo',
    slug: 'demo',
    version: 1,
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
    this.values.set(key, value);
  }
}
