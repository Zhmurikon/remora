import type { components } from '@remora/api-client';
import { api } from '../../lib/api';
import {
  readPythonTaskProgress,
  replacePythonTaskProgress,
  type PythonTaskProgress,
  type PythonTaskStatus,
} from './python-progress';
import type { PythonTask } from './python-tasks';

import {
  capturePythonProgressScope,
  isPythonScopeCurrent,
  pythonScopeRequest,
  pythonStorageKey,
  type PythonProgressScope,
} from './python-progress-scope';

type ServerProgress = components['schemas']['PythonProgressOut'];

interface PendingProgress extends PythonTaskProgress {
  mutationId: string;
}

export interface PythonSyncResult {
  ok: boolean;
  pending: number;
}

export function queuePythonProgress(
  progress: PythonTaskProgress,
  scope: PythonProgressScope = capturePythonProgressScope(),
): void {
  const queue = readQueue(scope).filter(
    (item) => item.taskId !== progress.taskId || item.taskVersion !== progress.taskVersion,
  );
  queue.push({ ...progress, mutationId: crypto.randomUUID() });
  writeQueue(queue, scope);
}

export function pendingPythonProgressCount(
  scope: PythonProgressScope = capturePythonProgressScope(),
): number {
  return readQueue(scope).length;
}

export function clearPendingPythonProgress(
  scope: PythonProgressScope = capturePythonProgressScope(),
): void {
  writeQueue([], scope);
}

const flushes = new Map<
  string,
  { scope: PythonProgressScope; promise: Promise<PythonSyncResult> }
>();

export function flushPythonProgress(
  tasks: readonly PythonTask[],
  scope: PythonProgressScope = capturePythonProgressScope(),
): Promise<PythonSyncResult> {
  if (!isPythonScopeCurrent(scope)) return Promise.resolve({ ok: false, pending: 0 });
  const key = `${scope.userId}:${scope.session}`;
  const existing = flushes.get(key);
  if (existing && existing.scope.storage === scope.storage) return existing.promise;
  const promise = runFlush(tasks, scope)
    .catch(() => ({ ok: false, pending: pendingPythonProgressCount(scope) }))
    .finally(() => {
      if (flushes.get(key)?.promise === promise) flushes.delete(key);
    });
  flushes.set(key, { scope, promise });
  return promise;
}

export async function syncPythonProgress(
  tasks: readonly PythonTask[],
  scope: PythonProgressScope = capturePythonProgressScope(),
): Promise<PythonSyncResult> {
  const request = pythonScopeRequest(scope);
  try {
    request.signal.throwIfAborted();
    await flushPythonProgress(tasks, scope);
    request.signal.throwIfAborted();
    const { data, error } = await api.GET('/api/v1/practice/python/progress', {
      signal: request.signal,
    });
    request.signal.throwIfAborted();
    if (error || !data) return { ok: false, pending: pendingPythonProgressCount(scope) };

    const currentTasks = new Map(tasks.map((task) => [`${task.id}:${task.version}`, task]));
    for (const server of data) {
      const task = currentTasks.get(`${server.task_id}:${server.task_version}`);
      if (!task) continue;
      const local = readPythonTaskProgress(task, scope);
      const merged = mergeProgress(local, fromServer(server));
      replacePythonTaskProgress(task, merged, scope);
      if (isLocalAhead(merged, fromServer(server))) queuePythonProgress(merged, scope);
    }

    for (const task of tasks) {
      const hasServer = data.some(
        (item) => item.task_id === task.id && item.task_version === task.version,
      );
      if (!hasServer) {
        const local = readPythonTaskProgress(task, scope);
        if (
          local.status !== 'not_started' ||
          local.attempts > 0 ||
          local.draft !== task.starterCode
        ) {
          queuePythonProgress(local, scope);
        }
      }
    }
    return await flushPythonProgress(tasks, scope);
  } catch {
    // fetch отклоняет Promise при обрыве сети: оставляем черновики и очередь для повтора.
    return { ok: false, pending: pendingPythonProgressCount(scope) };
  } finally {
    request.dispose();
  }
}

export function mergeProgress(
  local: PythonTaskProgress,
  remote: PythonTaskProgress,
): PythonTaskProgress {
  const localIsNewer = Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt);
  return {
    taskId: local.taskId,
    taskVersion: local.taskVersion,
    status: betterStatus(local.status, remote.status),
    attempts: Math.max(local.attempts, remote.attempts),
    draft: localIsNewer ? local.draft : remote.draft,
    updatedAt: localIsNewer ? local.updatedAt : remote.updatedAt,
  };
}

async function runFlush(
  tasks: readonly PythonTask[],
  scope: PythonProgressScope,
): Promise<PythonSyncResult> {
  const request = pythonScopeRequest(scope);
  try {
    request.signal.throwIfAborted();
    let queue = readQueue(scope);
    while (queue.length > 0) {
      request.signal.throwIfAborted();
      const item = queue[0];
      if (!item) break;
      const { data, error } = await api.PUT('/api/v1/practice/python/progress/{task_id}', {
        signal: request.signal,
        params: { path: { task_id: item.taskId } },
        body: {
          task_version: item.taskVersion,
          status: item.status,
          attempts: item.attempts,
          draft: item.draft,
          client_updated_at: item.updatedAt,
          client_mutation_id: item.mutationId,
        },
      });
      request.signal.throwIfAborted();
      if (error || !data) return { ok: false, pending: queue.length };

      const task = tasks.find(
        (candidate) => candidate.id === item.taskId && candidate.version === item.taskVersion,
      );
      if (task) {
        const local = readPythonTaskProgress(task, scope);
        replacePythonTaskProgress(task, mergeProgress(local, fromServer(data)), scope);
      }
      const current = readQueue(scope);
      queue = current.filter((candidate) => candidate.mutationId !== item.mutationId);
      writeQueue(queue, scope);
    }
    return { ok: true, pending: 0 };
  } finally {
    request.dispose();
  }
}

function fromServer(progress: ServerProgress): PythonTaskProgress {
  return {
    taskId: progress.task_id,
    taskVersion: progress.task_version,
    status: progress.status,
    attempts: progress.attempts,
    draft: progress.draft,
    updatedAt: progress.draft_updated_at,
  };
}

function isLocalAhead(local: PythonTaskProgress, remote: PythonTaskProgress) {
  return (
    statusRank(local.status) > statusRank(remote.status) ||
    local.attempts > remote.attempts ||
    Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)
  );
}

function betterStatus(left: PythonTaskStatus, right: PythonTaskStatus): PythonTaskStatus {
  return statusRank(left) >= statusRank(right) ? left : right;
}

function statusRank(status: PythonTaskStatus) {
  return { not_started: 0, in_progress: 1, solved: 2 }[status];
}

function readQueue(scope: PythonProgressScope): PendingProgress[] {
  const { storage } = scope;
  if (!storage || !isPythonScopeCurrent(scope)) return [];
  try {
    const parsed = JSON.parse(
      storage.getItem(pythonStorageKey(scope, 'pending-progress')) ?? '[]',
    ) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingProgress[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingProgress[], scope: PythonProgressScope): void {
  const { storage } = scope;
  if (!storage || !isPythonScopeCurrent(scope)) return;
  try {
    storage.setItem(pythonStorageKey(scope, 'pending-progress'), JSON.stringify(queue));
  } catch {
    // Недоступное хранилище не должно блокировать решение задачи.
  }
}
