import type { PythonTask } from './python-tasks';

import {
  capturePythonProgressScope,
  isPythonScopeCurrent,
  pythonStorageKey,
  type PythonProgressScope,
} from './python-progress-scope';

export type PythonTaskStatus = 'not_started' | 'in_progress' | 'solved';

export interface PythonTaskProgress {
  taskId: string;
  taskVersion: number;
  draft: string;
  status: PythonTaskStatus;
  attempts: number;
  updatedAt: string;
}

export function readPythonTaskProgress(
  task: PythonTask,
  scope: PythonProgressScope = capturePythonProgressScope(),
): PythonTaskProgress {
  const fallback = initialProgress(task);
  const { storage } = scope;
  if (!storage || !isPythonScopeCurrent(scope)) return fallback;

  const key = progressKey(task, scope);
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    const value = parseProgress(JSON.parse(raw) as unknown, task);
    if (value) return value;
    storage.removeItem(key);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Недоступное хранилище не должно блокировать практику.
    }
  }
  return fallback;
}

export function savePythonDraft(
  task: PythonTask,
  draft: string,
  scope: PythonProgressScope = capturePythonProgressScope(),
): PythonTaskProgress {
  const current = readPythonTaskProgress(task, scope);
  const status =
    current.status === 'solved'
      ? 'solved'
      : current.status === 'not_started' && draft === task.starterCode
        ? 'not_started'
        : 'in_progress';
  return writeProgress({ ...current, draft, status }, scope);
}

export function markPythonTaskStarted(
  task: PythonTask,
  draft: string,
  scope: PythonProgressScope = capturePythonProgressScope(),
): PythonTaskProgress {
  const current = readPythonTaskProgress(task, scope);
  return writeProgress(
    {
      ...current,
      draft,
      status: current.status === 'solved' ? 'solved' : 'in_progress',
    },
    scope,
  );
}

export function recordPythonCheck(
  task: PythonTask,
  draft: string,
  passed: boolean,
  scope: PythonProgressScope = capturePythonProgressScope(),
): PythonTaskProgress {
  const current = readPythonTaskProgress(task, scope);
  return writeProgress(
    {
      ...current,
      draft,
      attempts: current.attempts + 1,
      status: passed || current.status === 'solved' ? 'solved' : 'in_progress',
    },
    scope,
  );
}

export function pythonProgressSummary(
  tasks: readonly PythonTask[],
  scope: PythonProgressScope = capturePythonProgressScope(),
) {
  const progress = tasks.map((task) => readPythonTaskProgress(task, scope));
  return {
    progress,
    solved: progress.filter((item) => item.status === 'solved').length,
    inProgress: progress.filter((item) => item.status === 'in_progress').length,
  };
}

export function replacePythonTaskProgress(
  task: PythonTask,
  progress: PythonTaskProgress,
  scope: PythonProgressScope = capturePythonProgressScope(),
): PythonTaskProgress {
  if (progress.taskId !== task.id || progress.taskVersion !== task.version) {
    return readPythonTaskProgress(task, scope);
  }
  persistProgress(progress, scope);
  return progress;
}

export function deletePythonPracticeProgress(
  tasks: readonly PythonTask[],
  scope: PythonProgressScope = capturePythonProgressScope(),
): void {
  const { storage } = scope;
  if (!storage || !isPythonScopeCurrent(scope)) return;
  for (const task of tasks) {
    try {
      storage.removeItem(progressKey(task, scope));
    } catch {
      // Недоступное хранилище не должно мешать серверному сбросу прогресса.
      return;
    }
  }
}

function initialProgress(task: PythonTask): PythonTaskProgress {
  return {
    taskId: task.id,
    taskVersion: task.version,
    draft: task.starterCode,
    status: 'not_started',
    attempts: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

function writeProgress(progress: PythonTaskProgress, scope: PythonProgressScope) {
  const next = { ...progress, updatedAt: new Date().toISOString() };
  persistProgress(next, scope);
  return next;
}

function persistProgress(progress: PythonTaskProgress, scope: PythonProgressScope) {
  const { storage } = scope;
  if (!storage || !isPythonScopeCurrent(scope)) return;
  try {
    storage.setItem(
      pythonStorageKey(scope, `progress:${progress.taskId}:v${progress.taskVersion}`),
      JSON.stringify(progress),
    );
  } catch {
    // Переполненное или запрещённое хранилище не прерывает работу редактора.
  }
}

function progressKey(task: PythonTask, scope: PythonProgressScope) {
  return pythonStorageKey(scope, `progress:${task.id}:v${task.version}`);
}

function parseProgress(value: unknown, task: PythonTask): PythonTaskProgress | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<PythonTaskProgress>;
  const valid =
    item.taskId === task.id &&
    item.taskVersion === task.version &&
    typeof item.draft === 'string' &&
    (item.status === 'not_started' || item.status === 'in_progress' || item.status === 'solved') &&
    typeof item.attempts === 'number' &&
    Number.isInteger(item.attempts) &&
    item.attempts >= 0;
  if (!valid) return null;
  return {
    taskId: task.id,
    taskVersion: task.version,
    draft: item.draft as string,
    status: item.status as PythonTaskStatus,
    attempts: item.attempts as number,
    // Записи P3 не имели времени изменения; считаем их старыми, но не теряем.
    updatedAt:
      typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt))
        ? item.updatedAt
        : new Date(0).toISOString(),
  };
}
