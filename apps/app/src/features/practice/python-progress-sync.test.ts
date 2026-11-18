import { useAuthStore, type User } from '../auth/auth-store';
import { capturePythonProgressScope } from './python-progress-scope';
beforeEach(() => useAuthStore.setState({ status: 'authenticated', user: { id: 'owner' } as User }));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPythonTaskProgress, replacePythonTaskProgress } from './python-progress';
import {
  clearPendingPythonProgress,
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
  it('обрабатывает отклонённый fetch, сохраняя черновик и очередь до повторной отправки', async () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    const local = progress({ draft: 'offline draft' });
    replacePythonTaskProgress(currentTask, local, scope);
    queuePythonProgress(local, scope);
    apiMocks.put.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await flushPythonProgress([currentTask], scope)).toEqual({ ok: false, pending: 1 });
    expect(readPythonTaskProgress(currentTask, scope).draft).toBe('offline draft');
    expect(pendingPythonProgressCount(scope)).toBe(1);

    apiMocks.put.mockResolvedValueOnce({ data: server({ draft: 'offline draft' }) });
    apiMocks.get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await syncPythonProgress([currentTask], scope)).toEqual({ ok: false, pending: 0 });
    expect(readPythonTaskProgress(currentTask, scope).draft).toBe('offline draft');

    apiMocks.get.mockResolvedValueOnce({ data: [server({ draft: 'offline draft' })] });
    expect(await syncPythonProgress([currentTask], scope)).toEqual({ ok: true, pending: 0 });
  });

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
    const scope = capturePythonProgressScope(storage);
    queuePythonProgress(progress({ draft: 'first' }), scope);
    queuePythonProgress(progress({ draft: 'second', attempts: 2 }), scope);
    expect(pendingPythonProgressCount(scope)).toBe(1);

    apiMocks.put.mockResolvedValueOnce({ error: { code: 'NETWORK' } });
    expect(await flushPythonProgress([currentTask], scope)).toEqual({
      ok: false,
      pending: 1,
    });
    expect(pendingPythonProgressCount(scope)).toBe(1);

    apiMocks.put.mockResolvedValueOnce({ data: server({ draft: 'second', attempts: 2 }) });
    expect(await flushPythonProgress([currentTask], scope)).toEqual({ ok: true, pending: 0 });
    expect(pendingPythonProgressCount(scope)).toBe(0);
  });

  it('объединяет серверный прогресс с локальным и не понижает решение', async () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    replacePythonTaskProgress(
      currentTask,
      progress({ status: 'solved', attempts: 3, draft: 'local', updatedAt: oldTime }),
      scope,
    );
    apiMocks.get.mockResolvedValueOnce({
      data: [server({ status: 'in_progress', attempts: 5, draft: 'remote', updatedAt: newTime })],
    });
    apiMocks.put.mockResolvedValueOnce({
      data: server({ status: 'solved', attempts: 5, draft: 'remote', updatedAt: newTime }),
    });

    expect(await syncPythonProgress([currentTask], scope)).toEqual({ ok: true, pending: 0 });
    expect(readPythonTaskProgress(currentTask, scope)).toMatchObject({
      status: 'solved',
      attempts: 5,
      draft: 'remote',
    });
  });

  it('очищает офлайн-очередь при удалении практики', () => {
    const storage = new MemoryStorage();
    const scope = capturePythonProgressScope(storage);
    queuePythonProgress(progress(), scope);

    clearPendingPythonProgress(scope);

    expect(pendingPythonProgressCount(scope)).toBe(0);
  });
  it('не читает и не отправляет черновики и очередь другого аккаунта', async () => {
    const storage = new MemoryStorage();
    const owner = capturePythonProgressScope(storage);
    replacePythonTaskProgress(
      currentTask,
      progress({ draft: 'owner draft', status: 'solved' }),
      owner,
    );
    queuePythonProgress(progress({ draft: 'owner draft', status: 'solved' }), owner);
    useAuthStore.getState().authenticate({ id: 'other' } as User);
    const other = capturePythonProgressScope(storage);
    apiMocks.get.mockResolvedValueOnce({ data: [] });
    expect(await syncPythonProgress([currentTask], other)).toEqual({ ok: true, pending: 0 });
    expect(apiMocks.put).not.toHaveBeenCalled();
    expect(readPythonTaskProgress(currentTask, other).draft).toBe(currentTask.starterCode);
    clearPendingPythonProgress(other);
    useAuthStore.getState().authenticate({ id: 'owner' } as User);
    const again = capturePythonProgressScope(storage);
    expect(readPythonTaskProgress(currentTask, again).draft).toBe('owner draft');
    expect(pendingPythonProgressCount(again)).toBe(1);
  });

  it('отменяет PUT при смене владельца и не задерживает очередь нового аккаунта', async () => {
    const storage = new MemoryStorage();
    const owner = capturePythonProgressScope(storage);
    queuePythonProgress(progress({ draft: 'owner draft' }), owner);
    let finish!: (value: unknown) => void;
    apiMocks.put.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = flushPythonProgress([currentTask], owner);
    const signal = apiMocks.put.mock.calls[0]![1].signal as AbortSignal;
    useAuthStore.getState().authenticate({ id: 'other' } as User);
    expect(signal.aborted).toBe(true);
    const other = capturePythonProgressScope(storage);
    queuePythonProgress(progress({ draft: 'other draft' }), other);
    apiMocks.put.mockResolvedValueOnce({ data: server({ draft: 'other draft' }) });
    expect(await flushPythonProgress([currentTask], other)).toEqual({ ok: true, pending: 0 });
    finish({ data: server({ draft: 'owner draft' }) });
    expect((await first).ok).toBe(false);
    expect(readPythonTaskProgress(currentTask, other).draft).toBe('other draft');
    useAuthStore.getState().authenticate({ id: 'owner' } as User);
    expect(pendingPythonProgressCount(capturePythonProgressScope(storage))).toBe(1);
  });

  it('игнорирует поздний GET предыдущего аккаунта', async () => {
    const storage = new MemoryStorage();
    const owner = capturePythonProgressScope(storage);
    let finish!: (value: unknown) => void;
    apiMocks.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = syncPythonProgress([currentTask], owner);
    await vi.waitFor(() => expect(apiMocks.get).toHaveBeenCalledOnce());
    const signal = apiMocks.get.mock.calls[0]![1].signal as AbortSignal;
    useAuthStore.getState().becomeGuest();
    useAuthStore.getState().authenticate({ id: 'other' } as User);
    finish({ data: [server({ draft: 'owner only', status: 'solved' })] });
    expect((await first).ok).toBe(false);
    expect(signal.aborted).toBe(true);
    const other = capturePythonProgressScope(storage);
    expect(readPythonTaskProgress(currentTask, other).status).toBe('not_started');
    expect(pendingPythonProgressCount(other)).toBe(0);
    expect(apiMocks.put).not.toHaveBeenCalled();
  });

  it('не возобновляет старый сеанс после повторного входа того же пользователя', async () => {
    const storage = new MemoryStorage();
    const old = capturePythonProgressScope(storage);
    useAuthStore.getState().becomeGuest();
    useAuthStore.getState().authenticate({ id: 'owner' } as User);
    queuePythonProgress(progress({ draft: 'late result' }), old);
    expect((await syncPythonProgress([currentTask], old)).ok).toBe(false);
    expect(apiMocks.get).not.toHaveBeenCalled();
    expect(apiMocks.put).not.toHaveBeenCalled();
    expect(storage.length).toBe(0);
  });

  it('не синхронизирует гостя и не присваивает записи без владельца', async () => {
    const storage = new MemoryStorage();
    const legacy = JSON.stringify(progress({ draft: 'unattributed' }));
    storage.setItem(`remora.practice.python.progress:${currentTask.id}:v1`, legacy);
    const legacyQueue = JSON.stringify([{ ...progress(), mutationId: 'legacy' }]);
    storage.setItem('remora.practice.python.pending-progress', legacyQueue);
    useAuthStore.getState().becomeGuest();
    expect((await syncPythonProgress([currentTask], capturePythonProgressScope(storage))).ok).toBe(
      false,
    );
    expect(apiMocks.get).not.toHaveBeenCalled();
    useAuthStore.getState().authenticate({ id: 'owner' } as User);
    const owner = capturePythonProgressScope(storage);
    apiMocks.get.mockResolvedValueOnce({ data: [] });
    expect((await syncPythonProgress([currentTask], owner)).ok).toBe(true);
    expect(apiMocks.put).not.toHaveBeenCalled();
    expect(readPythonTaskProgress(currentTask, owner).draft).toBe(currentTask.starterCode);
    expect(storage.getItem(`remora.practice.python.progress:${currentTask.id}:v1`)).toBe(legacy);
    expect(storage.getItem('remora.practice.python.pending-progress')).toBe(legacyQueue);
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
