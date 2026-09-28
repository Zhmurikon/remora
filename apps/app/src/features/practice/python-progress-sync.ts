import type { components } from '@remora/api-client';
import { api } from '../../lib/api';
import {
  readPythonTaskProgress,
  replacePythonTaskProgress,
  type PythonTaskProgress,
  type PythonTaskStatus,
} from './python-progress';
import type { PythonTask } from './python-tasks';

const QUEUE_KEY = 'remora.practice.python.pending-progress';

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
  storage: Storage | null = browserStorage(),
): void {
  const queue = readQueue(storage).filter(
    (item) => item.taskId !== progress.taskId || item.taskVersion !== progress.taskVersion,
  );
  queue.push({ ...progress, mutationId: crypto.randomUUID() });
  writeQueue(queue, storage);
}

export function pendingPythonProgressCount(storage: Storage | null = browserStorage()): number {
  return readQueue(storage).length;
}

let flushInFlight: Promise<PythonSyncResult> | null = null;

export function flushPythonProgress(
  tasks: readonly PythonTask[],
  storage: Storage | null = browserStorage(),
): Promise<PythonSyncResult> {
  flushInFlight ??= runFlush(tasks, storage).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

export async function syncPythonProgress(
  tasks: readonly PythonTask[],
  storage: Storage | null = browserStorage(),
): Promise<PythonSyncResult> {
  await flushPythonProgress(tasks, storage);
  const { data, error } = await api.GET('/api/v1/practice/python/progress');
  if (error || !data) return { ok: false, pending: pendingPythonProgressCount(storage) };

  const currentTasks = new Map(tasks.map((task) => [`${task.id}:${task.version}`, task]));
  for (const server of data) {
    const task = currentTasks.get(`${server.task_id}:${server.task_version}`);
    if (!task) continue;
    const local = readPythonTaskProgress(task, storage);
    const merged = mergeProgress(local, fromServer(server));
    replacePythonTaskProgress(task, merged, storage);
    if (isLocalAhead(merged, fromServer(server))) queuePythonProgress(merged, storage);
  }

  for (const task of tasks) {
    const hasServer = data.some(
      (item) => item.task_id === task.id && item.task_version === task.version,
    );
    if (!hasServer) {
      const local = readPythonTaskProgress(task, storage);
      if (
        local.status !== 'not_started' ||
        local.attempts > 0 ||
        local.draft !== task.starterCode
      ) {
        queuePythonProgress(local, storage);
      }
    }
  }
  return flushPythonProgress(tasks, storage);
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
  storage: Storage | null,
): Promise<PythonSyncResult> {
  let queue = readQueue(storage);
  while (queue.length > 0) {
    const item = queue[0];
    if (!item) break;
    const { data, error } = await api.PUT('/api/v1/practice/python/progress/{task_id}', {
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
    if (error || !data) return { ok: false, pending: queue.length };

    const task = tasks.find(
      (candidate) => candidate.id === item.taskId && candidate.version === item.taskVersion,
    );
    if (task) {
      const local = readPythonTaskProgress(task, storage);
      replacePythonTaskProgress(task, mergeProgress(local, fromServer(data)), storage);
    }
    const current = readQueue(storage);
    queue = current.filter((candidate) => candidate.mutationId !== item.mutationId);
    writeQueue(queue, storage);
  }
  return { ok: true, pending: 0 };
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

function readQueue(storage: Storage | null): PendingProgress[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(QUEUE_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as PendingProgress[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingProgress[], storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Недоступное хранилище не должно блокировать решение задачи.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
