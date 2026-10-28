import type { components } from '@remora/api-client';
import { Button, Card, Input } from '@remora/ui/base';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AdminActionConfirmation } from '../features/security/AdminActionConfirmation';
import { api, getErrorMessage } from '../lib/api';

type JobList = components['schemas']['AdminJobList'];
type JobItem = components['schemas']['AdminJobItem'];
type JobKind = JobItem['kind'];

const PAGE_SIZE = 25;
const kindLabels: Record<JobKind, string> = {
  import: 'Импорт',
  export: 'Экспорт',
  transcription: 'Расшифровка',
  media: 'Медиа',
  search: 'Поиск',
};
const statusLabels: Record<string, string> = {
  uploading: 'Загрузка',
  queued: 'В очереди',
  processing: 'Выполняется',
  converting: 'Конвертация',
  transcribing: 'Распознавание',
  completed: 'Завершена',
  failed: 'Ошибка',
  pending: 'Проверяется',
  ready: 'Готово',
  rejected: 'Отклонено',
};

export function JobsPage() {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<JobKind | ''>('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [retrying, setRetrying] = useState<JobItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ['admin', 'jobs', query, kind, status, offset],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/admin/jobs', {
        params: {
          query: {
            query: query || undefined,
            kind: kind || undefined,
            status: status || undefined,
            offset,
            limit: PAGE_SIZE,
          },
        },
      });
      if (!data) throw new Error(getErrorMessage(error, 'Не удалось загрузить операции'));
      return data;
    },
    placeholderData: (previous) => previous,
    refetchInterval: 15_000,
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(input.trim());
  }

  async function retry(confirmation: string, reason: string) {
    if (!retrying) return;
    const { data, error } = await api.POST('/api/v1/admin/jobs/{kind}/{job_id}/retry', {
      params: {
        path: { kind: retrying.kind, job_id: retrying.id },
        header: {
          'X-Admin-Confirmation': confirmation,
          'Idempotency-Key': crypto.randomUUID(),
        },
      },
      body: { reason },
    });
    if (!data) throw new Error(getErrorMessage(error, 'Не удалось повторить операцию'));
    setRetrying(null);
    setMessage('Операция безопасно возвращена в очередь.');
    await queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
  }

  return (
    <section aria-labelledby="jobs-title">
      <h1 id="jobs-title" className="text-3xl font-semibold tracking-tight">
        Фоновые операции
      </h1>
      <p className="text-fg-muted mt-2 max-w-3xl">
        Импорты, экспорты, обработка медиа и очередь поискового индекса без исходных файлов и
        служебных ключей.
      </p>

      {message && (
        <p
          className="bg-success-subtle text-success mt-5 rounded-md px-4 py-3 text-sm"
          role="status"
        >
          {message}
        </p>
      )}

      <form
        className="mt-7 grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto] md:items-end"
        onSubmit={submitSearch}
      >
        <Input
          label="Пользователь или UUID операции"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <FilterSelect
          label="Тип"
          value={kind}
          onChange={(value) => {
            setKind(value as JobKind | '');
            setOffset(0);
          }}
          options={Object.entries(kindLabels)}
        />
        <FilterSelect
          label="Состояние"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setOffset(0);
          }}
          options={[
            ['queued', 'В очереди'],
            ['processing', 'Выполняется'],
            ['completed', 'Завершена'],
            ['failed', 'Ошибка'],
            ['pending', 'Проверяется'],
            ['rejected', 'Отклонено'],
          ]}
        />
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      {jobs.isPending ? (
        <p className="text-fg-muted mt-7" aria-live="polite">
          Загружаем операции…
        </p>
      ) : jobs.isError ? (
        <p className="text-danger mt-7" role="alert">
          {jobs.error.message}
        </p>
      ) : jobs.data.items.length === 0 ? (
        <Card className="mt-7 p-8 text-center shadow-none">
          <h2 className="font-semibold">Операций не найдено</h2>
          <p className="text-fg-muted mt-2 text-sm">Измените запрос или фильтры.</p>
        </Card>
      ) : (
        <JobsTable data={jobs.data} offset={offset} onOffset={setOffset} onRetry={setRetrying} />
      )}

      {retrying && (
        <div className="mt-7">
          <AdminActionConfirmation
            title="Повторить фоновую операцию"
            consequences={[
              `Операция «${retrying.label}» будет поставлена в очередь повторно.`,
              'Повтор фиксируется в административном аудите.',
              'Пользовательские исходные файлы и секреты не раскрываются.',
            ]}
            submitLabel="Повторить"
            onConfirmed={retry}
            onCancel={() => setRetrying(null)}
          />
        </div>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <select
        className="border-border bg-surface focus-visible:ring-primary mt-1 min-h-11 w-full rounded-md border px-3 focus-visible:outline-none focus-visible:ring-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Все</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function JobsTable({
  data,
  offset,
  onOffset,
  onRetry,
}: {
  data: JobList;
  offset: number;
  onOffset: (value: number) => void;
  onRetry: (job: JobItem) => void;
}) {
  return (
    <>
      <div className="border-border bg-surface mt-7 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[880px] text-left text-sm">
          <caption className="sr-only">Фоновые операции продукта</caption>
          <thead className="bg-surface-muted text-fg-muted">
            <tr>
              <th className="px-4 py-3">Операция</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Состояние</th>
              <th className="px-4 py-3">Прогресс</th>
              <th className="px-4 py-3">Создана</th>
              <th className="px-4 py-3">
                <span className="sr-only">Действия</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((job) => (
              <tr key={`${job.kind}-${job.id}`} className="border-border border-t align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{job.label}</p>
                  <p className="text-fg-subtle mt-1 font-mono text-xs">{job.id}</p>
                  <p className="text-fg-subtle mt-1 text-xs">{kindLabels[job.kind]}</p>
                </td>
                <td className="px-4 py-3">
                  {job.username ? (
                    <>
                      <p>{job.username}</p>
                      <p className="text-fg-subtle text-xs">{job.email}</p>
                    </>
                  ) : (
                    <span className="text-fg-subtle">Системная</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Status job={job} />
                  {job.error && <p className="text-danger mt-2 max-w-xs text-xs">{job.error}</p>}
                </td>
                <td className="px-4 py-3">{job.progress === null ? '—' : `${job.progress}%`}</td>
                <td className="px-4 py-3">{formatDate(job.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  {job.retryable && (
                    <Button variant="secondary" size="sm" onClick={() => onRetry(job)}>
                      Повторить
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-fg-subtle text-sm">Всего: {data.total}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={offset === 0}
            onClick={() => onOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Назад
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => onOffset(offset + PAGE_SIZE)}
          >
            Далее
          </Button>
        </div>
      </div>
    </>
  );
}

function Status({ job }: { job: JobItem }) {
  const tone =
    job.status === 'failed' || job.status === 'rejected'
      ? 'bg-danger-subtle text-danger'
      : job.status === 'completed' || job.status === 'ready'
        ? 'bg-success-subtle text-success'
        : job.stale
          ? 'bg-warning-subtle text-warning'
          : 'bg-surface-muted text-fg-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {job.stale ? 'Зависла' : (statusLabels[job.status] ?? job.status)}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}
