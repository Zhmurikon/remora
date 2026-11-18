import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../features/auth/auth-store';
import notebook from '../features/practice/assets/notebook.webp';
import { pythonProgressSummary } from '../features/practice/python-progress';
import {
  pendingPythonProgressCount,
  syncPythonProgress,
} from '../features/practice/python-progress-sync';
import { pythonTasks } from '../features/practice/python-tasks';
import {
  capturePythonProgressScope,
  pythonStorageKey,
} from '../features/practice/python-progress-scope';
import './practice-start.css';

export function PracticePage() {
  const userId = useAuthStore((state) => state.user?.id);
  return <PracticeStart key={userId ?? 'guest'} userId={userId} />;
}

function PracticeStart({ userId }: { userId: string | undefined }) {
  const [scope] = useState(() => capturePythonProgressScope());
  const sync = useQuery({
    queryKey: ['practice', 'python', 'progress', userId, scope.session],
    queryFn: () => syncPythonProgress(pythonTasks, scope),
    enabled: Boolean(userId),
    staleTime: 0,
    retry: false,
    networkMode: 'always',
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: 'always',
  });
  const { refetch } = sync;
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key.startsWith(pythonStorageKey(scope, ''))) {
        void refetch();
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refetch, scope]);

  // Каталог и редактор сохраняют черновики локально: читаем их заново и при возврате назад.
  const summary = pythonProgressSummary(pythonTasks, scope);
  const latest = summary.progress
    .filter((item) => item.status === 'in_progress')
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  const next = latest
    ? pythonTasks.find((task) => task.id === latest.taskId)
    : pythonTasks.find((_, index) => summary.progress[index]?.status !== 'solved');
  const total = pythonTasks.length;
  const complete = total > 0 && summary.solved === total;
  const hasLocalProgress = summary.solved > 0 || summary.inProgress > 0;
  const loading = !hasLocalProgress && sync.isPending;
  const failed = sync.isError || sync.data?.ok === false;
  const localOnly = failed && !sync.isFetching;
  const pending = pendingPythonProgressCount(scope);
  const percent = total ? Math.round((summary.solved / total) * 100) : 0;
  const destination = next ? `/practice/python/${next.slug}` : '/practice/python';
  const action = complete
    ? 'Повторить задачи'
    : latest
      ? 'Продолжить задачу'
      : summary.solved > 0
        ? 'Следующая задача'
        : 'Начать практику';

  return (
    <div className="practice-start">
      <header className="practice-start-header">
        <h1>Практика</h1>
        <p>Решайте задачи и возвращайтесь к начатому.</p>
      </header>

      <section
        className="practice-start-hero"
        aria-labelledby="practice-next-title"
        aria-busy={loading}
      >
        <span className="practice-start-tab">
          {loading
            ? 'Python'
            : complete
              ? 'Практика завершена'
              : hasLocalProgress
                ? 'Продолжить Python'
                : 'Начать Python'}
        </span>
        <div className="practice-start-copy">
          <h2 id="practice-next-title">
            {loading
              ? 'Загружаем прогресс…'
              : complete
                ? 'Все задачи решены'
                : (next?.title ?? 'Практика Python')}
          </h2>
          <p className="practice-start-meta">
            {loading
              ? 'Проверяем сохранённые решения'
              : complete
                ? `${total} из ${total}`
                : `${next?.topic ?? 'Python'} · ${latest ? 'В работе' : 'Не начато'}`}
          </p>
          <p className="practice-start-description">
            {loading
              ? 'Каталог задач уже доступен ниже.'
              : complete
                ? 'Можно вернуться к любой задаче и попробовать другое решение.'
                : next?.summary}
          </p>
          {loading ? (
            <span className="practice-start-placeholder" aria-hidden="true" />
          ) : (
            <Link className="practice-start-primary" to={destination}>
              {action}
              <span className="practice-start-arrow" aria-hidden="true">
                →
              </span>
            </Link>
          )}
        </div>
        <div className="practice-start-notebook" aria-hidden="true">
          <div className="practice-start-drawing">
            <img src={notebook} width="560" height="560" alt="" />
            <svg viewBox="0 0 1280 1280" focusable="false">
              <path
                className="practice-ink-base"
                d="m445 398 354 21m-376 48 220 13m-244 55 312 18"
              />
              <path className="practice-ink-stroke" d="m445 398 354 21" />
              <path className="practice-ink-stroke practice-ink-second" d="m423 467 220 13" />
              <path className="practice-ink-stroke practice-ink-third" d="m399 535 312 18" />
              <path className="practice-ink-base" d="m692 605 60 4-11 57-60-4z" />
              <path className="practice-ink-stroke practice-ink-tick" d="m692 631 16 18 42-47" />
            </svg>
          </div>
        </div>
      </section>

      <section className="practice-start-progress" aria-label="Прогресс Python" aria-busy={loading}>
        <div className="practice-start-progress-heading">
          <h2>
            {loading
              ? 'Загружаем прогресс'
              : `${localOnly ? 'В этом браузере решено' : 'Решено'} ${summary.solved} из ${total} задач`}
          </h2>
          {!loading && <span>{percent}%</span>}
        </div>
        {loading ? (
          <div className="practice-start-track" aria-hidden="true" />
        ) : (
          <div
            className="practice-start-track"
            role="progressbar"
            aria-label="Прогресс по задачам Python"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={summary.solved}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        )}
        <div className="practice-start-sync">
          {summary.inProgress > 0 && <p>В работе: {summary.inProgress}</p>}
          <p role="status">
            {sync.isFetching
              ? 'Синхронизируем…'
              : failed
                ? `Не удалось синхронизировать. Прогресс доступен в этом браузере.${pending > 0 ? ` В очереди: ${pending}.` : ''}`
                : 'Сохранено в аккаунте'}
          </p>
          {failed && (
            <button type="button" disabled={sync.isFetching} onClick={() => void refetch()}>
              Повторить синхронизацию
            </button>
          )}
        </div>
      </section>

      <section className="practice-start-trainers" aria-labelledby="practice-trainers-title">
        <div className="practice-start-trainers-heading">
          <h2 id="practice-trainers-title">Тренажёры</h2>
          <p>Доступен 1</p>
        </div>
        <div className="practice-start-trainer">
          <span className="practice-start-py" aria-hidden="true">
            Py
          </span>
          <div className="practice-start-trainer-copy">
            <h3>Python</h3>
            <p>Задачи по Python, анализу данных и визуализации — от основ до SciPy.</p>
            <p className="practice-start-topics">
              Основы Python · NumPy · pandas · SciPy · matplotlib
            </p>
          </div>
          <Link
            className="practice-start-catalog"
            to="/practice/python"
            aria-label={`Все ${total} задач Python`}
          >
            Все {total} задач <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
