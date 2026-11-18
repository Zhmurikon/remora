import { Badge, Button, Card } from '@remora/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  PythonExecutionResult,
  PythonRunnerPhase,
} from '../features/practice/python-runner-protocol';
import { PythonRunner } from '../features/practice/python-runner';
import { findPythonTask, pythonTasks, type PythonTask } from '../features/practice/python-tasks';
import { PythonCodeEditor } from '../features/practice/PythonCodeEditor';
import {
  deletePythonPracticeProgress,
  markPythonTaskStarted,
  pythonProgressSummary,
  readPythonTaskProgress,
  recordPythonCheck,
  savePythonDraft,
  type PythonTaskProgress,
  type PythonTaskStatus,
} from '../features/practice/python-progress';
import {
  clearPendingPythonProgress,
  flushPythonProgress,
  pendingPythonProgressCount,
  queuePythonProgress,
  syncPythonProgress,
} from '../features/practice/python-progress-sync';
import { api } from '../lib/api';
import './practice-workspace.css';

const primaryLinkStyle = 'practice-primary';
const quietLinkStyle = 'practice-back';

export { PracticePage } from './PracticeStartPage';

export function PythonPracticePage() {
  const [topic, setTopic] = useState('all');
  const [status, setStatus] = useState<PythonTaskStatus | 'all'>('all');
  const [syncState, setSyncState] = useState<'syncing' | 'synced' | 'offline'>('syncing');
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetState, setResetState] = useState<'idle' | 'pending' | 'error'>('idle');
  const resetInProgress = useRef(false);
  const syncInProgress = useRef<Promise<unknown> | null>(null);
  const [, setSyncRevision] = useState(0);
  const summary = pythonProgressSummary(pythonTasks);
  const latest = summary.progress
    .filter((item) => item.status === 'in_progress')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const next = latest
    ? pythonTasks.find((task) => task.id === latest.taskId)
    : pythonTasks.find((_, index) => summary.progress[index]?.status !== 'solved');
  const loading =
    syncState === 'syncing' && !summary.progress.some((item) => Date.parse(item.updatedAt) > 0);
  const topics = [...new Set(pythonTasks.map((task) => task.topic))];
  const rows = pythonTasks
    .map((task, index) => ({ task, progress: summary.progress[index] }))
    .filter(
      (row): row is { task: PythonTask; progress: PythonTaskProgress } =>
        Boolean(row.progress) &&
        (topic === 'all' || row.task.topic === topic) &&
        (status === 'all' || row.progress?.status === status),
    );
  const solvedPercent = pythonTasks.length
    ? Math.round((summary.solved / pythonTasks.length) * 100)
    : 0;

  useEffect(() => {
    let active = true;
    const synchronize = async () => {
      if (resetInProgress.current) return;
      setSyncState('syncing');
      const request = syncPythonProgress(pythonTasks);
      syncInProgress.current = request;
      const result = await request;
      if (syncInProgress.current === request) syncInProgress.current = null;
      if (!active || resetInProgress.current) return;
      setSyncRevision((value) => value + 1);
      setSyncState(result.ok ? 'synced' : 'offline');
    };
    void synchronize();
    window.addEventListener('online', synchronize);
    return () => {
      active = false;
      window.removeEventListener('online', synchronize);
    };
  }, [syncAttempt]);

  async function resetPractice() {
    resetInProgress.current = true;
    setResetState('pending');
    try {
      await syncInProgress.current;
      const { error } = await api.DELETE('/api/v1/practice/python/progress');
      if (error) throw error;
      clearPendingPythonProgress();
      deletePythonPracticeProgress(pythonTasks);
      setTopic('all');
      setStatus('all');
      setSyncState('synced');
      setSyncRevision((value) => value + 1);
      setConfirmReset(false);
      setResetState('idle');
    } catch {
      // При сбое оставляем и черновики, и очередь: сброс ещё не подтверждён сервером.
      setResetState('error');
    } finally {
      resetInProgress.current = false;
    }
  }

  return (
    <div className="practice-page practice-catalog">
      <header className="practice-page-header">
        <Link className={quietLinkStyle} to="/practice">
          <span aria-hidden="true">←</span> Все тренажёры
        </Link>
        <div className="practice-title-line">
          <h1>Python</h1>
          <span className="practice-count">{pythonTasks.length} задач</span>
        </div>
        <p>
          От переменных и условий до анализа данных и графиков. Задачи расположены от простого к
          сложному.
        </p>
      </header>

      <section className="practice-progress" aria-label="Общий прогресс" aria-busy={loading}>
        <div className="practice-progress-copy">
          <div className="practice-progress-label">
            <h2>
              {loading
                ? 'Загружаем прогресс…'
                : `Решено ${summary.solved} из ${pythonTasks.length}`}
            </h2>
            {!loading && <span>{solvedPercent}%</span>}
          </div>
          {!loading && (
            <div
              className="practice-progress-track"
              role="progressbar"
              aria-label="Прогресс по задачам Python"
              aria-valuemin={0}
              aria-valuemax={pythonTasks.length}
              aria-valuenow={summary.solved}
            >
              <div style={{ width: `${solvedPercent}%` }} />
            </div>
          )}
          <div className="practice-sync" role="status">
            <span>
              {syncState === 'syncing'
                ? 'Синхронизируем…'
                : syncState === 'synced'
                  ? 'Сохранено в аккаунте'
                  : `Не удалось синхронизировать · в очереди ${pendingPythonProgressCount()}`}
            </span>
            {syncState === 'offline' && (
              <button type="button" onClick={() => setSyncAttempt((value) => value + 1)}>
                Повторить
              </button>
            )}
          </div>
        </div>
        {!loading &&
          (next ? (
            <Link className={primaryLinkStyle} to={`/practice/python/${next.slug}`}>
              <span>
                {latest ? 'Продолжить' : summary.solved ? 'Следующая задача' : 'Начать'}:{' '}
                {next.title}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <p className="practice-complete">
              Все задачи решены.
              <br />
              Можно повторить любую из списка.
            </p>
          ))}
      </section>

      <section aria-labelledby="tasks-title">
        <div className="practice-list-heading">
          <h2 id="tasks-title">Задачи</h2>
          <p aria-live="polite">
            {topic === 'all' && status === 'all'
              ? `${pythonTasks.length} задач`
              : `Показано ${rows.length} из ${pythonTasks.length}`}
          </p>
        </div>

        <div className="practice-filters" aria-label="Фильтры задач">
          <label className="text-sm font-medium">
            Тема
            <select
              className="border-border bg-surface mt-2 min-h-11 w-full rounded-lg border px-3"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            >
              <option value="all">Все темы</option>
              {topics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Статус
            <select
              className="border-border bg-surface mt-2 min-h-11 w-full rounded-lg border px-3"
              value={status}
              onChange={(event) => setStatus(event.target.value as PythonTaskStatus | 'all')}
            >
              <option value="all">Все статусы</option>
              <option value="not_started">Не начато</option>
              <option value="in_progress">В работе</option>
              <option value="solved">Решено</option>
            </select>
          </label>
        </div>

        {rows.length > 0 ? (
          <ol className="practice-task-list">
            {rows.map(({ task, progress }) => (
              <li key={task.id}>
                <TaskCard task={task} progress={progress} number={pythonTasks.indexOf(task) + 1} />
              </li>
            ))}
          </ol>
        ) : (
          <Card className="practice-empty">
            <h3 className="text-xl font-semibold">Нет задач с такими фильтрами</h3>
            <p className="text-fg-muted mt-2">Измените тему или статус, чтобы увидеть задачи.</p>
            <Button
              className="mt-5 min-h-11"
              variant="secondary"
              onClick={() => {
                setTopic('all');
                setStatus('all');
              }}
            >
              Сбросить фильтры
            </Button>
          </Card>
        )}
      </section>

      <details className="practice-reset">
        <summary>Сбросить практику</summary>
        <p className="text-fg-muted mt-2 max-w-2xl">
          Все решения, черновики и отметки о выполнении задач Python будут удалены из аккаунта и
          этого браузера. Начисленный опыт сохранится.
        </p>
        {confirmReset ? (
          <div className="mt-4 space-y-3">
            <p>Удалить весь прогресс практики? Это действие нельзя отменить.</p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="danger"
                className="min-h-11"
                loading={resetState === 'pending'}
                onClick={() => void resetPractice()}
              >
                Подтвердить удаление
              </Button>
              <Button
                variant="ghost"
                className="min-h-11"
                disabled={resetState === 'pending'}
                onClick={() => {
                  setConfirmReset(false);
                  setResetState('idle');
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" className="mt-4 min-h-11" onClick={() => setConfirmReset(true)}>
            Удалить прогресс практики
          </Button>
        )}
        {resetState === 'error' && (
          <p role="alert" className="text-danger mt-3 text-sm">
            Не удалось удалить прогресс. Проверьте соединение и повторите попытку.
          </p>
        )}
      </details>
    </div>
  );
}

function TaskCard({
  task,
  number,
  progress,
}: {
  task: PythonTask;
  number: number;
  progress: PythonTaskProgress;
}) {
  return (
    <Link
      to={`/practice/python/${task.slug}`}
      className={`practice-task-row practice-task-row--${progress.status}`}
    >
      <span className="practice-task-number" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <div className="practice-task-description">
        <h3>{task.title}</h3>
        <p>{task.summary}</p>
        <span className="practice-task-meta">
          {task.topic} <span aria-hidden="true">·</span> {task.difficulty}
        </span>
      </div>
      <ProgressBadge status={progress.status} />
      <span className="practice-task-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

function ProgressBadge({ status }: { status: PythonTaskStatus }) {
  const labels: Record<PythonTaskStatus, string> = {
    not_started: 'Не начато',
    in_progress: 'В работе',
    solved: 'Решено',
  };
  const tones = {
    not_started: 'neutral',
    in_progress: 'warning',
    solved: 'success',
  } as const;

  return <Badge tone={tones[status]}>{labels[status]}</Badge>;
}

export function PythonTaskPage() {
  const { taskSlug = '' } = useParams();
  const task = findPythonTask(taskSlug);

  if (!task) return <MissingTask />;
  const taskIndex = pythonTasks.indexOf(task);
  const nextTask = pythonTasks[taskIndex + 1];
  const functionTask = task.checks.every((check) => check.kind === 'function');

  return (
    <div className="practice-page practice-task">
      <header className="practice-page-header">
        <Link className={quietLinkStyle} to="/practice/python">
          <span aria-hidden="true">←</span> Все задачи Python
        </Link>
        <h1>{task.title}</h1>
        <div className="practice-task-context">
          <p>
            {task.topic} <span aria-hidden="true">·</span> {task.difficulty}
          </p>
          <span>
            {taskIndex + 1} из {pythonTasks.length}
          </span>
        </div>
      </header>

      <div className="practice-task-grid">
        <div className="practice-instructions">
          <section className="practice-condition" aria-labelledby="condition-title">
            <h2 id="condition-title">Условие</h2>
            <p>{task.statement}</p>
          </section>
          <section className="practice-examples" aria-labelledby="examples-title">
            <h2 id="examples-title">{task.examples.length > 1 ? 'Примеры' : 'Пример'}</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">{functionTask ? 'Вызов' : 'Ввод'}</th>
                  <th scope="col">{functionTask ? 'Результат' : 'Вывод'}</th>
                </tr>
              </thead>
              <tbody>
                {task.examples.map((example, index) => (
                  <tr key={index}>
                    <td>
                      <pre>{example.input}</pre>
                    </td>
                    <td>
                      <pre>{example.output}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {task.files && (
            <section className="practice-files" aria-labelledby="files-title">
              <h2 id="files-title">Встроенные файлы</h2>
              <p>Эти CSV уже доступны коду по указанным именам.</p>
              {Object.entries(task.files).map(([name, content]) => (
                <details key={name}>
                  <summary>{name}</summary>
                  <pre>{content}</pre>
                </details>
              ))}
            </section>
          )}
          <details className="practice-hint">
            <summary>Нужна подсказка?</summary>
            <p>{task.hint}</p>
          </details>
        </div>
        <PythonWorkspace key={`${task.id}:${task.version}`} task={task} nextTask={nextTask} />
      </div>
    </div>
  );
}

function PythonWorkspace({ task, nextTask }: { task: PythonTask; nextTask?: PythonTask }) {
  const runnerRef = useRef<PythonRunner | null>(null);
  const editedRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(() => readPythonTaskProgress(task));
  const [code, setCode] = useState(progress.draft);
  const [stdin, setStdin] = useState(task.examples[0]?.input ?? '');
  const [phase, setPhase] = useState<PythonRunnerPhase | 'idle'>('idle');
  const [result, setResult] = useState<PythonExecutionResult | null>(null);
  const [operation, setOperation] = useState<'run' | 'check'>('run');
  const active = phase === 'loading' || phase === 'running';
  const functionTask = task.checks.every((check) => check.kind === 'function');

  useEffect(() => {
    let active = true;
    void syncPythonProgress([task]).then((result) => {
      if (!active || !result.ok) return;
      const synced = readPythonTaskProgress(task);
      setProgress(synced);
      if (!editedRef.current) setCode(synced.draft);
    });
    const flushOnline = () => void flushPythonProgress([task]);
    window.addEventListener('online', flushOnline);
    return () => {
      active = false;
      runnerRef.current?.dispose();
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      window.removeEventListener('online', flushOnline);
    };
  }, [task]);

  const updateProgress = useCallback(
    (next: PythonTaskProgress) => {
      setProgress(next);
      queuePythonProgress(next);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => void flushPythonProgress([task]), 700);
    },
    [task],
  );

  const run = useCallback(async () => {
    const runner = (runnerRef.current ??= new PythonRunner());
    updateProgress(markPythonTaskStarted(task, code));
    setResult(null);
    setOperation('run');
    setPhase('loading');
    const nextResult = await runner.run(code, stdin, setPhase, task.packages, task.files);
    setResult(nextResult);
    setPhase('idle');
  }, [code, stdin, task, updateProgress]);

  async function check() {
    const runner = (runnerRef.current ??= new PythonRunner());
    setResult(null);
    setOperation('check');
    setPhase('loading');
    const nextResult = await runner.check(code, task.checks, setPhase, task.packages, task.files);
    updateProgress(recordPythonCheck(task, code, nextResult.status === 'passed'));
    setResult(nextResult);
    setPhase('idle');
  }

  function stop() {
    runnerRef.current?.stop();
  }

  return (
    <div className="practice-workspace">
      <Card className="practice-editor-panel">
        <div className="practice-editor-heading">
          <div>
            <h2>Код решения</h2>
            <div className="practice-libraries">
              <span>Python</span>
              {task.packages?.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
          </div>
          <div className="practice-editor-status">
            <ProgressBadge status={progress.status} />
            <Button
              variant="ghost"
              className="practice-reset-code"
              aria-label="Сбросить код"
              title="Вернуть исходный код задачи"
              disabled={active || code === task.starterCode}
              onClick={() => {
                setCode(task.starterCode);
                editedRef.current = true;
                updateProgress(savePythonDraft(task, task.starterCode));
                setResult(null);
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M4 10a8 8 0 1 1 1 7M4 4v6h6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          </div>
        </div>
        <PythonCodeEditor
          value={code}
          disabled={active}
          onRun={() => void run()}
          onChange={(value) => {
            editedRef.current = true;
            setCode(value);
            updateProgress(savePythonDraft(task, value));
            setResult(null);
          }}
        />
        {functionTask ? (
          <div className="practice-input">
            <p className="text-fg-muted text-sm">
              Автопроверка сама вызовет функцию с разными аргументами. Для пробного запуска можно
              временно добавить вызов print() в конец кода.
            </p>
          </div>
        ) : (
          <div className="practice-input">
            <label htmlFor="python-stdin" className="text-sm font-medium">
              Входные данные
            </label>
            <textarea
              id="python-stdin"
              rows={2}
              className="border-border bg-surface mt-2 w-full resize-y rounded-xl border p-3 font-mono text-sm"
              value={stdin}
              spellCheck={false}
              disabled={active}
              aria-describedby="stdin-hint"
              onChange={(event) => {
                setStdin(event.target.value);
                setResult(null);
              }}
            />
            <p id="stdin-hint" className="text-fg-subtle mt-2 text-sm">
              Каждый вызов input() прочитает следующую строку.
            </p>
          </div>
        )}
        <div className="practice-editor-actions">
          <div className="practice-run-buttons">
            <Button
              variant="secondary"
              disabled={active || !code.trim()}
              onClick={() => void run()}
            >
              Запустить
            </Button>
            {active && (
              <Button variant="secondary" onClick={stop}>
                Остановить
              </Button>
            )}
            <Button disabled={active || !code.trim()} onClick={() => void check()}>
              Проверить решение
            </Button>
          </div>
          <div className="practice-editor-footnote">
            <p>Ctrl/⌘ + Enter — запустить код</p>
            <p>Проверок: {progress.attempts}</p>
          </div>
        </div>
      </Card>

      <ExecutionOutput phase={phase} result={result} operation={operation} />

      {progress.status === 'solved' && (
        <Card className="practice-solved">
          <h2 className="text-lg font-semibold">Задача решена</h2>
          <p className="text-fg-muted mt-2 text-sm">
            Решение и результат сохранены в этом браузере.
          </p>
          <details className="border-success/30 mt-4 min-w-0 border-t pt-4">
            <summary className="focus-visible:outline-primary min-h-11 cursor-pointer rounded-md font-medium focus-visible:outline focus-visible:outline-2">
              Посмотреть разбор и эталонное решение
            </summary>
            <p className="text-fg-muted mt-3 text-sm">{task.explanation}</p>
            <pre className="bg-surface mt-3 max-w-full overflow-x-auto rounded-xl p-4 font-mono text-sm leading-6">
              {task.referenceSolution}
            </pre>
          </details>
          {nextTask ? (
            <Link className={`${primaryLinkStyle} mt-4`} to={`/practice/python/${nextTask.slug}`}>
              Следующая задача
            </Link>
          ) : (
            <Link className={`${quietLinkStyle} mt-3`} to="/practice/python">
              Вернуться к списку задач
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}

function ExecutionOutput({
  phase,
  result,
  operation,
}: {
  phase: PythonRunnerPhase | 'idle';
  result: PythonExecutionResult | null;
  operation: 'run' | 'check';
}) {
  const labels: Record<PythonExecutionResult['status'], string> = {
    completed: 'Выполнено',
    passed: 'Все проверки пройдены',
    failed: 'Есть неверный ответ',
    runtime_error: 'Ошибка Python',
    timeout: 'Время вышло',
    stopped: 'Остановлено',
  };
  const tones = {
    completed: 'success',
    passed: 'success',
    failed: 'danger',
    runtime_error: 'danger',
    timeout: 'warning',
    stopped: 'neutral',
  } as const;

  return (
    <Card className="practice-output" aria-live="polite" aria-busy={phase !== 'idle'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {operation === 'check' ? 'Результат проверки' : 'Результат запуска'}
        </h2>
        {result && <Badge tone={tones[result.status]}>{labels[result.status]}</Badge>}
      </div>

      {phase === 'loading' && (
        <p className="text-fg-muted mt-4" role="status">
          Загружаем Python… Первый запуск может занять несколько секунд.
        </p>
      )}
      {phase === 'running' && (
        <p className="text-fg-muted mt-4" role="status">
          {operation === 'check' ? 'Проверяем решение…' : 'Выполняем программу…'}
        </p>
      )}
      {phase === 'idle' && !result && (
        <p className="text-fg-muted mt-4">Нажмите «Запустить», чтобы увидеть вывод программы.</p>
      )}
      {result && (
        <div className="mt-4 space-y-4">
          {result.status === 'timeout' && (
            <p className="text-warning">Программа работала дольше 3 секунд и была остановлена.</p>
          )}
          {result.checks && result.checks.length > 0 && (
            <CheckResults checks={result.checks} status={result.status} />
          )}
          {operation === 'run' && result.stdout ? (
            <OutputBlock title="Вывод" value={result.stdout} />
          ) : (
            operation === 'run' &&
            result.status === 'completed' && (
              <p className="text-fg-muted">Программа завершилась без вывода.</p>
            )
          )}
          {result.stderr && <OutputBlock title="Ошибка" value={result.stderr} error />}
          {result.plots && result.plots.length > 0 && (
            <div className="practice-plots" aria-label="Графики программы">
              {result.plots.map((plot, index) => (
                <figure
                  key={`${plot.dataUrl.slice(-24)}-${index}`}
                  className="border-border bg-surface-muted overflow-hidden rounded-xl border p-3"
                >
                  <img
                    className="bg-surface mx-auto h-auto max-h-[32rem] w-full object-contain"
                    src={plot.dataUrl}
                    alt={plot.alt}
                  />
                  <figcaption className="text-fg-subtle mt-2 text-center text-sm">
                    {plot.alt}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
          {result.truncated && (
            <p className="text-warning text-sm">Вывод сокращён: показаны первые 32 000 символов.</p>
          )}
          <p className="text-fg-subtle text-sm">
            Время выполнения: {Math.max(1, Math.round(result.durationMs))} мс
          </p>
        </div>
      )}
    </Card>
  );
}

function CheckResults({
  checks,
  status,
}: {
  checks: NonNullable<PythonExecutionResult['checks']>;
  status: PythonExecutionResult['status'];
}) {
  return (
    <ol className="practice-checks" aria-label="Проверочные сценарии">
      {checks.map((check) => {
        const pythonError = !check.passed && status === 'runtime_error';
        return (
          <li
            key={check.name}
            className={check.passed ? 'practice-check--passed' : 'practice-check--failed'}
          >
            <div className="flex items-start gap-3">
              <span className={check.passed ? 'text-success' : 'text-danger'} aria-hidden="true">
                {check.passed ? '✓' : '×'}
              </span>
              <div className="min-w-0">
                <h3 className="font-medium">{check.name}</h3>
                <p className={`mt-1 text-sm ${check.passed ? 'text-success' : 'text-danger'}`}>
                  {check.passed ? 'Пройдено' : pythonError ? 'Ошибка Python' : 'Ответ не совпал'}
                </p>
                {check.message && (
                  <pre className="text-fg mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-sm">
                    {check.message}
                  </pre>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OutputBlock({
  title,
  value,
  error = false,
}: {
  title: string;
  value: string;
  error?: boolean;
}) {
  return (
    <div>
      <h3 className={`text-sm font-medium ${error ? 'text-danger' : 'text-fg-muted'}`}>{title}</h3>
      <pre
        className="bg-surface-muted mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl p-4 font-mono text-sm leading-6"
        role={error ? 'alert' : undefined}
      >
        {value}
      </pre>
    </div>
  );
}

function MissingTask() {
  return (
    <Card className="practice-page practice-missing" role="alert">
      <span
        className="bg-surface-muted text-fg-muted mx-auto grid h-14 w-14 place-items-center rounded-2xl text-2xl"
        aria-hidden="true"
      >
        ?
      </span>
      <h1 className="mt-5 text-2xl font-semibold">Задача не найдена</h1>
      <p className="text-fg-muted mt-2">
        Возможно, ссылка устарела. Вернитесь в каталог и выберите доступную задачу.
      </p>
      <Link className={`${primaryLinkStyle} mt-6`} to="/practice/python">
        Вернуться к задачам
      </Link>
    </Card>
  );
}
