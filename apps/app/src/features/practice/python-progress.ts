import type { PythonTask } from './python-tasks';

const STORAGE_PREFIX = 'remora.practice.python.progress';

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
  storage: Storage | null = browserStorage(),
): PythonTaskProgress {
  const fallback = initialProgress(task);
  if (!storage) return fallback;

  const key = progressKey(task);
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
  storage: Storage | null = browserStorage(),
): PythonTaskProgress {
  const current = readPythonTaskProgress(task, storage);
  const status =
    current.status === 'solved'
      ? 'solved'
      : current.status === 'not_started' && draft === task.starterCode
        ? 'not_started'
        : 'in_progress';
  return writeProgress({ ...current, draft, status }, storage);
}

export function markPythonTaskStarted(
  task: PythonTask,
  draft: string,
  storage: Storage | null = browserStorage(),
): PythonTaskProgress {
  const current = readPythonTaskProgress(task, storage);
  return writeProgress(
    {
      ...current,
      draft,
      status: current.status === 'solved' ? 'solved' : 'in_progress',
    },
    storage,
  );
}

export function recordPythonCheck(
  task: PythonTask,
  draft: string,
  passed: boolean,
  storage: Storage | null = browserStorage(),
): PythonTaskProgress {
  const current = readPythonTaskProgress(task, storage);
  return writeProgress(
    {
      ...current,
      draft,
      attempts: current.attempts + 1,
      status: passed || current.status === 'solved' ? 'solved' : 'in_progress',
    },
    storage,
  );
}

export function pythonProgressSummary(tasks: readonly PythonTask[], storage?: Storage | null) {
  const progress = tasks.map((task) => readPythonTaskProgress(task, storage ?? browserStorage()));
  return {
    progress,
    solved: progress.filter((item) => item.status === 'solved').length,
    inProgress: progress.filter((item) => item.status === 'in_progress').length,
  };
}

export function replacePythonTaskProgress(
  task: PythonTask,
  progress: PythonTaskProgress,
  storage: Storage | null = browserStorage(),
): PythonTaskProgress {
  if (progress.taskId !== task.id || progress.taskVersion !== task.version) {
    return readPythonTaskProgress(task, storage);
  }
  persistProgress(progress, storage);
  return progress;
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

function writeProgress(progress: PythonTaskProgress, storage: Storage | null) {
  const next = { ...progress, updatedAt: new Date().toISOString() };
  persistProgress(next, storage);
  return next;
}

function persistProgress(progress: PythonTaskProgress, storage: Storage | null) {
  if (!storage) return;
  try {
    storage.setItem(
      `${STORAGE_PREFIX}:${progress.taskId}:v${progress.taskVersion}`,
      JSON.stringify(progress),
    );
  } catch {
    // Переполненное или запрещённое хранилище не прерывает работу редактора.
  }
}

function progressKey(task: PythonTask) {
  return `${STORAGE_PREFIX}:${task.id}:v${task.version}`;
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

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
