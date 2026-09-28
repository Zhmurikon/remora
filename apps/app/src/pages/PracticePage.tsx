import { Badge, Button, Card } from '@remora/ui';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  PythonExecutionResult,
  PythonRunnerPhase,
} from '../features/practice/python-runner-protocol';
import { PythonRunner } from '../features/practice/python-runner';
import { findPythonTask, pythonTasks, type PythonTask } from '../features/practice/python-tasks';

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
              Начните с переменных и вывода. Новые темы будут открываться по мере наполнения
              тренажёра.
            </p>
          </div>
          <Badge tone="primary" className="mt-1 px-3 py-1">
            Демоверсия
          </Badge>
        </div>
      </header>

      <section aria-labelledby="tasks-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="tasks-title" className="text-2xl font-semibold">
            Задачи
          </h2>
          <p className="text-fg-subtle text-sm">{pythonTasks.length} из 20</p>
        </div>

        {pythonTasks.length > 0 ? (
          <ol className="mt-4 space-y-3">
            {pythonTasks.map((task, index) => (
              <li key={task.id}>
                <TaskCard task={task} number={index + 1} />
              </li>
            ))}
          </ol>
        ) : (
          <Card className="mt-4 p-8 text-center">
            <h3 className="text-xl font-semibold">Задачи ещё готовятся</h3>
            <p className="text-fg-muted mt-2">Загляните сюда позже.</p>
          </Card>
        )}
      </section>
    </div>
  );
}

function TaskCard({ task, number }: { task: PythonTask; number: number }) {
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

export function PythonTaskPage() {
  const { taskSlug = '' } = useParams();
  const task = findPythonTask(taskSlug);

  if (!task) return <MissingTask />;

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
                  <dt className="text-fg-muted text-sm font-medium">Ввод</dt>
                  <dd className="bg-surface-muted mt-2 overflow-x-auto rounded-lg p-3 font-mono text-sm">
                    {example.input}
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-muted text-sm font-medium">Вывод</dt>
                  <dd className="bg-surface-muted mt-2 overflow-x-auto rounded-lg p-3 font-mono text-sm">
                    {example.output}
                  </dd>
                </div>
              </dl>
            ))}
          </Card>

          <Card className="bg-primary-subtle border-primary/20 p-5">
            <h2 className="text-lg font-semibold">Что будет дальше</h2>
            <p className="text-fg-muted mt-2 text-sm">
              Сейчас можно изменить код и запустить его с собственными входными данными. На этапе P2
              добавим подсветку синтаксиса и автоматическую проверку решения.
            </p>
          </Card>
        </div>

        <PythonWorkspace key={task.id} task={task} />
      </div>
    </div>
  );
}

function PythonWorkspace({ task }: { task: PythonTask }) {
  const runnerRef = useRef<PythonRunner | null>(null);
  const [code, setCode] = useState(task.starterCode);
  const [stdin, setStdin] = useState(task.examples[0]?.input ?? '');
  const [phase, setPhase] = useState<PythonRunnerPhase | 'idle'>('idle');
  const [result, setResult] = useState<PythonExecutionResult | null>(null);
  const active = phase === 'loading' || phase === 'running';

  useEffect(() => () => runnerRef.current?.dispose(), []);

  async function run() {
    const runner = (runnerRef.current ??= new PythonRunner());
    setResult(null);
    setPhase('loading');
    const nextResult = await runner.run(code, stdin, setPhase);
    setResult(nextResult);
    setPhase('idle');
  }

  function stop() {
    runnerRef.current?.stop();
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="font-semibold">Код решения</h2>
            <p className="text-fg-subtle text-sm">Подсветка синтаксиса появится в P2</p>
          </div>
          <Badge>Python</Badge>
        </div>
        <label htmlFor="python-code" className="sr-only">
          Код решения
        </label>
        <textarea
          id="python-code"
          className="bg-surface-muted min-h-72 w-full resize-y p-5 font-mono text-sm leading-6 focus-visible:outline-offset-[-2px]"
          value={code}
          spellCheck={false}
          disabled={active}
          onChange={(event) => {
            setCode(event.target.value);
            setResult(null);
          }}
        />
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
        <div className="border-border flex flex-wrap items-center gap-3 border-t p-4">
          <Button disabled={active || !code.trim()} onClick={() => void run()}>
            Запустить
          </Button>
          {active && (
            <Button variant="secondary" onClick={stop}>
              Остановить
            </Button>
          )}
          <Button variant="secondary" disabled aria-describedby="check-status">
            Проверить решение
          </Button>
          <Button
            variant="ghost"
            disabled={active || code === task.starterCode}
            onClick={() => {
              setCode(task.starterCode);
              setResult(null);
            }}
          >
            Сбросить код
          </Button>
          <p id="check-status" className="text-fg-subtle text-sm">
            Проверка решения появится в P2.
          </p>
        </div>
      </Card>

      <ExecutionOutput phase={phase} result={result} />
    </div>
  );
}

function ExecutionOutput({
  phase,
  result,
}: {
  phase: PythonRunnerPhase | 'idle';
  result: PythonExecutionResult | null;
}) {
  const labels: Record<PythonExecutionResult['status'], string> = {
    completed: 'Выполнено',
    runtime_error: 'Ошибка Python',
    timeout: 'Время вышло',
    stopped: 'Остановлено',
  };
  const tones = {
    completed: 'success',
    runtime_error: 'danger',
    timeout: 'warning',
    stopped: 'neutral',
  } as const;

  return (
    <Card className="p-5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Результат запуска</h2>
        {result && <Badge tone={tones[result.status]}>{labels[result.status]}</Badge>}
      </div>

      {phase === 'loading' && (
        <p className="text-fg-muted mt-4" role="status">
          Загружаем Python… Первый запуск может занять несколько секунд.
        </p>
      )}
      {phase === 'running' && (
        <p className="text-fg-muted mt-4" role="status">
          Выполняем программу…
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
          {result.stdout ? (
            <OutputBlock title="Вывод" value={result.stdout} />
          ) : (
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
