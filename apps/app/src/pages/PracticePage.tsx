import { Badge, Card } from '@remora/ui';
import { Link, useParams } from 'react-router-dom';
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
              В следующем этапе здесь появятся запуск кода, вывод программы и понятные сообщения об
              ошибках. Код будет выполняться в браузере, без нагрузки на сервер.
            </p>
          </Card>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="font-semibold">Стартовый код</h2>
              <p className="text-fg-subtle text-sm">Редактор появится в P2</p>
            </div>
            <Badge>Python</Badge>
          </div>
          <pre className="bg-surface-muted min-h-72 overflow-x-auto p-5 font-mono text-sm leading-6">
            <code>{task.starterCode}</code>
          </pre>
          <div className="border-border flex flex-wrap items-center gap-3 border-t p-4">
            <button
              type="button"
              disabled
              aria-describedby="runner-status"
              className={`${primaryLinkStyle} disabled:pointer-events-none disabled:opacity-50`}
            >
              Запустить
            </button>
            <button
              type="button"
              disabled
              aria-describedby="runner-status"
              className="border-border bg-surface text-fg inline-flex min-h-11 items-center justify-center rounded-md border px-4 font-medium disabled:pointer-events-none disabled:opacity-50"
            >
              Проверить решение
            </button>
            <p id="runner-status" className="text-fg-subtle text-sm">
              Запуск кода появится на этапе P1.
            </p>
          </div>
        </Card>
      </div>
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
