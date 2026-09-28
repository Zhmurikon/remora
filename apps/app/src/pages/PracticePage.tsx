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
  markPythonTaskStarted,
  pythonProgressSummary,
  readPythonTaskProgress,
  recordPythonCheck,
  savePythonDraft,
  type PythonTaskProgress,
  type PythonTaskStatus,
} from '../features/practice/python-progress';
import {
  flushPythonProgress,
  pendingPythonProgressCount,
  queuePythonProgress,
  syncPythonProgress,
} from '../features/practice/python-progress-sync';

const primaryLinkStyle =
  'bg-primary text-primary-fg hover:bg-primary-hover inline-flex min-h-11 items-center justify-center rounded-md px-4 font-medium transition-colors';
const quietLinkStyle =
  'text-primary inline-flex min-h-11 items-center rounded-lg underline underline-offset-4';

export function PracticePage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="text-primary text-sm font-medium">Учимся через действие</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Практика</h1>
        <p className="text-fg-muted mt-3 max-w-2xl">
          Решайте небольшие задачи, запускайте код прямо в браузере и сразу разбирайте ошибки.
        </p>
      </header>

      <section aria-labelledby="trainers-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="trainers-title" className="text-2xl font-semibold">
              Тренажёры
            </h2>
            <p className="text-fg-muted mt-1">Начнём с основ Python.</p>
          </div>
          <p className="text-fg-subtle text-sm">Доступен 1 тренажёр</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Link
            to="/practice/python"
            className="focus-visible:outline-primary rounded-lg focus-visible:outline focus-visible:outline-2"
          >
            <Card interactive className="h-full p-6">
              <div className="flex items-start justify-between gap-4">
                <span
                  className="bg-primary-subtle text-primary grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-mono text-xl font-semibold"
                  aria-hidden="true"
                >
                  Py
                </span>
                <Badge tone="primary">Первый тренажёр</Badge>
              </div>
              <h3 className="mt-6 text-2xl font-semibold">Python</h3>
              <p className="text-fg-muted mt-2">
                Короткие задачи по синтаксису, условиям, циклам и функциям — от простого к сложному.
              </p>
              <p className="text-primary mt-6 font-medium">Открыть задачи →</p>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}

export function PythonPracticePage() {
  const [topic, setTopic] = useState('all');
  const [status, setStatus] = useState<PythonTaskStatus | 'all'>('all');
  const [syncState, setSyncState] = useState<'syncing' | 'synced' | 'offline'>('syncing');
  const [, setSyncRevision] = useState(0);
  const summary = pythonProgressSummary(pythonTasks);
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
      setSyncState('syncing');
      const result = await syncPythonProgress(pythonTasks);
      if (!active) return;
      setSyncRevision((value) => value + 1);
      setSyncState(result.ok ? 'synced' : 'offline');
    };
    void synchronize();
    window.addEventListener('online', synchronize);
    return () => {
      active = false;
      window.removeEventListener('online', synchronize);
    };
  }, []);

  return (
    <div className="space-y-7">
      <header>
        <Link className={quietLinkStyle} to="/practice">
          Все тренажёры
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-primary text-sm font-medium">Практика</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Python</h1>
            <p className="text-fg-muted mt-3 max-w-2xl">
              Пройдите путь от переменных и условий до списков и функций. Задачи расположены от
              простого к сложному.
            </p>
          </div>
          <Badge tone="primary" className="mt-1 px-3 py-1">
            18 задач
          </Badge>
        </div>
      </header>

      <section aria-labelledby="tasks-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tasks-title" className="text-2xl font-semibold">
            Задачи
          </h2>
          <p className="text-fg-subtle text-sm">{pythonTasks.length} задач</p>
        </div>

        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="font-semibold">Общий прогресс</h3>
              <p className="text-fg-muted mt-1 text-sm">
                Решено {summary.solved} из {pythonTasks.length}
                {summary.inProgress > 0 ? ` · в работе ${summary.inProgress}` : ''}
              </p>
            </div>
            <div className="text-right">
              <span className="text-primary block text-2xl font-semibold">{solvedPercent}%</span>
              <span className="text-fg-subtle mt-1 block text-xs" aria-live="polite">
                {syncState === 'syncing'
                  ? 'Синхронизируем…'
                  : syncState === 'synced'
                    ? 'Сохранено в аккаунте'
                    : `Офлайн · в очереди ${pendingPythonProgressCount()}`}
              </span>
            </div>
          </div>
          <div
            className="bg-surface-muted mt-4 h-2 overflow-hidden rounded-full"
            role="progressbar"
            aria-label="Прогресс по задачам Python"
            aria-valuemin={0}
            aria-valuemax={pythonTasks.length}
            aria-valuenow={summary.solved}
          >
            <div
              className="bg-primary h-full rounded-full"
              style={{ width: `${solvedPercent}%` }}
            />
          </div>
        </Card>

        <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Фильтры задач">
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
          <ol className="mt-4 space-y-3">
            {rows.map(({ task, progress }) => (
              <li key={task.id}>
                <TaskCard task={task} progress={progress} number={pythonTasks.indexOf(task) + 1} />
              </li>
            ))}
          </ol>
        ) : (
          <Card className="mt-4 p-8 text-center">
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
      className="focus-visible:outline-primary block rounded-lg focus-visible:outline focus-visible:outline-2"
    >
      <Card interactive className="flex items-start gap-4 p-5">
        <span
          className="bg-surface-muted text-fg-muted grid h-11 w-11 shrink-0 place-items-center rounded-xl font-semibold"
          aria-hidden="true"
        >
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold">{task.title}</h3>
            <Badge>{task.difficulty}</Badge>
            <ProgressBadge status={progress.status} />
          </div>
          <p className="text-fg-muted mt-1">{task.summary}</p>
          <p className="text-fg-subtle mt-3 text-sm">{task.topic}</p>
        </div>
        <span className="text-primary mt-2 text-xl" aria-hidden="true">
          →
        </span>
      </Card>
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
    <div className="space-y-6">
      <Link className={quietLinkStyle} to="/practice/python">
        Все задачи Python
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{task.topic}</Badge>
          <Badge>{task.difficulty}</Badge>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{task.title}</h1>
        <p className="text-fg-muted mt-3 max-w-3xl">{task.statement}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-xl font-semibold">Пример</h2>
            {task.examples.map((example, index) => (
              <dl key={`${example.input}-${index}`} className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-fg-muted text-sm font-medium">
                    {functionTask ? 'Вызов' : 'Ввод'}
                  </dt>
                  <dd className="bg-surface-muted mt-2 overflow-x-auto rounded-lg p-3 font-mono text-sm">
                    {example.input}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-muted text-sm font-medium">
                    {functionTask ? 'Результат' : 'Вывод'}
                  </dt>
                  <dd className="bg-surface-muted mt-2 overflow-x-auto rounded-lg p-3 font-mono text-sm">
                    {example.output}
                  </dd>
                </div>
              </dl>
            ))}
          </Card>

          <Card className="bg-primary-subtle border-primary/20 p-5">
            <details>
              <summary className="focus-visible:outline-primary min-h-11 cursor-pointer rounded-md font-semibold focus-visible:outline focus-visible:outline-2">
                Нужна подсказка?
              </summary>
              <p className="text-fg-muted mt-2 text-sm">{task.hint}</p>
            </details>
          </Card>
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
    const nextResult = await runner.run(code, stdin, setPhase);
    setResult(nextResult);
    setPhase('idle');
  }, [code, stdin, task, updateProgress]);

  async function check() {
    const runner = (runnerRef.current ??= new PythonRunner());
    setResult(null);
    setOperation('check');
    setPhase('loading');
    const nextResult = await runner.check(code, task.checks, setPhase);
    updateProgress(recordPythonCheck(task, code, nextResult.status === 'passed'));
    setResult(nextResult);
    setPhase('idle');
  }

  function stop() {
    runnerRef.current?.stop();
  }

  return (
    <div className="min-w-0 space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Код решения</h2>
            <p className="text-fg-subtle text-sm">Ctrl/⌘ + Enter — запустить код</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProgressBadge status={progress.status} />
            <Badge>Python</Badge>
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
          <div className="border-border border-t p-4">
            <p className="text-fg-muted text-sm">
              Автопроверка сама вызовет функцию с разными аргументами. Для пробного запуска можно
              временно добавить вызов print() в конец кода.
            </p>
          </div>
        ) : (
          <div className="border-border border-t p-4">
            <label htmlFor="python-stdin" className="text-sm font-medium">
              Входные данные
            </label>
            <textarea
              id="python-stdin"
              rows={3}
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
        <div className="border-border flex flex-wrap items-center gap-3 border-t p-4">
          <Button className="min-h-11" disabled={active || !code.trim()} onClick={() => void run()}>
            Запустить
          </Button>
          {active && (
            <Button className="min-h-11" variant="secondary" onClick={stop}>
              Остановить
            </Button>
          )}
          <Button
            className="min-h-11"
            variant="secondary"
            disabled={active || !code.trim()}
            onClick={() => void check()}
          >
            Проверить решение
          </Button>
          <Button
            className="min-h-11"
            variant="ghost"
            disabled={active || code === task.starterCode}
            onClick={() => {
              setCode(task.starterCode);
              editedRef.current = true;
              updateProgress(savePythonDraft(task, task.starterCode));
              setResult(null);
            }}
          >
            Сбросить код
          </Button>
          <p className="text-fg-subtle text-sm">Проверок: {progress.attempts}</p>
        </div>
      </Card>

      <ExecutionOutput phase={phase} result={result} operation={operation} />

      {progress.status === 'solved' && (
        <Card className="border-success/30 bg-success-subtle p-5">
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
    <Card className="p-5" aria-live="polite">
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
    <ol className="space-y-3" aria-label="Проверочные сценарии">
      {checks.map((check) => {
        const pythonError = !check.passed && status === 'runtime_error';
        return (
          <li
            key={check.name}
            className={`rounded-xl border p-4 ${
              check.passed
                ? 'border-success/30 bg-success-subtle'
                : 'border-danger/30 bg-danger-subtle'
            }`}
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
    <Card className="mx-auto max-w-xl p-8 text-center" role="alert">
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
