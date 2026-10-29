import { isLimitExceeded, type components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiRequestError, uploadTranscriptionChunk } from '../lib/api';

type Transcription = components['schemas']['TranscriptionPublic'];
type Entitlements = components['schemas']['EntitlementsPublic'];
type JobStatus = components['schemas']['TranscriptionStatus'];

const CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const TRANSCRIPTION_LIMIT = 'ai.transcription_minutes_per_week';
const busyStatuses = new Set<JobStatus>(['uploading', 'queued', 'converting', 'transcribing']);

const statusLabels: Record<JobStatus, string> = {
  uploading: 'Загружаем файл',
  queued: 'В очереди',
  converting: 'Готовим аудио',
  transcribing: 'Распознаём речь',
  completed: 'Готово',
  failed: 'Ошибка',
};

type LimitDetails = {
  limit: number;
  current: number;
  requested: number;
  resetsAt: string | null;
};

export function TranscriptionsPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(jobId === 'new');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [limitDetails, setLimitDetails] = useState<LimitDetails | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Transcription | null>(null);

  const jobsQuery = useQuery({
    queryKey: ['transcriptions'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/transcriptions');
      if (error || !data) throw new Error(apiMessage(error, 'Не удалось загрузить расшифровки'));
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.some((job) => busyStatuses.has(job.status)) ? 5_000 : false,
  });
  const entitlementsQuery = useQuery({
    queryKey: ['billing-entitlements'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/billing/entitlements');
      if (error || !data) throw new Error(apiMessage(error, 'Не удалось загрузить лимиты'));
      return data;
    },
  });

  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const selected = useMemo(() => {
    if (creating || jobId === 'new') return null;
    if (jobId) return jobs.find((job) => job.id === jobId) ?? null;
    return jobs.find((job) => job.status === 'completed') ?? jobs[0] ?? null;
  }, [creating, jobId, jobs]);
  const activeJobs = jobs.filter((job) => busyStatuses.has(job.status));
  const showUploader = creating || jobId === 'new' || (!jobsQuery.isLoading && !selected);

  function startCreating() {
    setCreating(true);
    setLibraryOpen(false);
    navigate('/transcriptions/new');
  }

  function openJob(job: Transcription) {
    setCreating(false);
    setLibraryOpen(false);
    navigate(`/transcriptions/${job.id}`);
  }

  async function refreshAfterUpload(job: Transcription) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transcriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] }),
    ]);
    setCreating(false);
    navigate(`/transcriptions/${job.id}`);
  }

  if (jobsQuery.isLoading) {
    return <PageMessage>Загружаем библиотеку…</PageMessage>;
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {showUploader ? (
            <UploadWorkspace
              entitlements={entitlementsQuery.data}
              onLimit={setLimitDetails}
              onUploaded={(job) => void refreshAfterUpload(job)}
              onOpenLibrary={() => setLibraryOpen(true)}
            />
          ) : selected ? (
            <DocumentWorkspace job={selected} />
          ) : (
            <PageMessage>Расшифровка не найдена.</PageMessage>
          )}
        </section>

        <UtilityRail
          selected={selected}
          jobs={activeJobs}
          entitlements={entitlementsQuery.data}
          onCreate={startCreating}
          onOpenLibrary={() => setLibraryOpen(true)}
          onOpenJob={openJob}
          onDelete={setDeleteTarget}
        />
      </div>

      {libraryOpen ? (
        <LibraryDrawer jobs={jobs} onClose={() => setLibraryOpen(false)} onOpen={openJob} />
      ) : null}
      {limitDetails ? (
        <LimitDialog details={limitDetails} onClose={() => setLimitDetails(null)} />
      ) : null}
      {deleteTarget ? (
        <DeleteDialog
          job={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            void queryClient.invalidateQueries({ queryKey: ['transcriptions'] });
            void queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] });
            startCreating();
          }}
        />
      ) : null}
    </div>
  );
}

function UploadWorkspace({
  entitlements,
  onLimit,
  onUploaded,
  onOpenLibrary,
}: {
  entitlements?: Entitlements;
  onLimit: (details: LimitDetails) => void;
  onUploaded: (job: Transcription) => void;
  onOpenLibrary: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('ru');
  const [dragging, setDragging] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [durationError, setDurationError] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  async function chooseFile(next: File | undefined) {
    if (!next) return;
    setError('');
    setProgress(0);
    if (next.size > MAX_FILE_BYTES) {
      setError('Файл должен быть не больше 1 ГБ.');
      return;
    }
    setFile(next);
    setDurationSeconds(null);
    setDurationError(false);
    try {
      setDurationSeconds(await readMediaDuration(next));
    } catch {
      setDurationError(true);
    }
  }

  async function upload() {
    if (!file || uploading) return;
    const seconds = durationSeconds ?? Math.round(Number(manualMinutes) * 60);
    if (!Number.isFinite(seconds) || seconds < 1) {
      setError('Укажите длительность записи, чтобы проверить недельный лимит.');
      return;
    }
    const requested = Math.ceil(seconds / 60);
    const remaining = entitlements?.remaining[TRANSCRIPTION_LIMIT];
    if (remaining !== null && remaining !== undefined && remaining < requested) {
      onLimit({
        limit: entitlements?.limits[TRANSCRIPTION_LIMIT] ?? 0,
        current: entitlements?.usage[TRANSCRIPTION_LIMIT] ?? 0,
        requested,
        resetsAt: entitlements?.resets_at[TRANSCRIPTION_LIMIT] ?? null,
      });
      return;
    }

    setUploading(true);
    setError('');
    try {
      const totalParts = Math.ceil(file.size / CHUNK_BYTES);
      const created = await api.POST('/api/v1/transcriptions', {
        body: {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          size_bytes: file.size,
          total_parts: totalParts,
          duration_seconds: seconds,
          language: language || null,
        },
      });
      if (created.error || !created.data) {
        if (isLimitExceeded(created.error)) {
          onLimit(limitFromError(created.error, entitlements));
          return;
        }
        throw new Error(apiMessage(created.error, 'Не удалось создать расшифровку'));
      }
      const job = created.data;
      for (let part = 0; part < totalParts; part += 1) {
        await uploadTranscriptionChunk<Transcription>(
          `/api/v1/transcriptions/${job.id}/parts/${part}`,
          file.slice(part * CHUNK_BYTES, Math.min(file.size, (part + 1) * CHUNK_BYTES)),
        );
        setProgress(Math.round(((part + 1) / totalParts) * 100));
      }
      const completed = await api.POST('/api/v1/transcriptions/{job_id}/complete', {
        params: { path: { job_id: job.id } },
      });
      if (completed.error || !completed.data) {
        throw new Error(apiMessage(completed.error, 'Не удалось запустить распознавание'));
      }
      onUploaded(completed.data);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'LIMIT_EXCEEDED') {
        onLimit(limitFromUnknown(caught.details, entitlements));
      } else {
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить файл');
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="text-fg-muted hover:text-fg focus-visible:ring-primary mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
        onClick={onOpenLibrary}
      >
        <Icon name="back" />
        Все конспекты
      </button>
      <header className="border-border bg-surface rounded-xl border px-5 py-4 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Новая расшифровка</h1>
        <p className="text-fg-muted mt-2">
          Загрузите аудио или видео — обработка продолжится, даже если закрыть страницу.
        </p>
      </header>

      <div className="border-border bg-surface mt-5 rounded-xl border p-4 sm:p-6">
        <div
          role="button"
          tabIndex={0}
          aria-label="Выбрать аудио или видео"
          className={`focus-visible:ring-primary flex min-h-[420px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 ${dragging ? 'border-primary bg-primary-subtle' : 'border-primary/60 hover:bg-primary-subtle/40'}`}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(event) => {
            if (!uploading && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setDragging(false);
            void chooseFile(event.dataTransfer.files[0]);
          }}
        >
          <span className="text-primary mb-5 grid h-16 w-16 place-items-center" aria-hidden="true">
            <Icon name="upload" className="h-14 w-14" />
          </span>
          <h2 className="text-2xl font-semibold">Перетащите файл сюда</h2>
          <p className="text-fg-muted mt-2">или выберите его на устройстве</p>
          <Button type="button" className="mt-6 min-w-56" disabled={uploading}>
            Выбрать файл
          </Button>
          <p className="text-fg-subtle mt-4 text-sm">
            MP3, WAV, M4A, MP4, WEBM, OGG, FLAC и TS · до 1 ГБ
          </p>
        </div>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="audio/*,video/*,.ts,.m4a,.flac,.ogg,.webm"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            void chooseFile(event.target.files?.[0])
          }
        />

        {file ? (
          <div className="border-border bg-surface-muted mt-4 flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <Icon name="file" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{file.name}</p>
              <p className="text-fg-muted text-xs">
                {formatBytes(file.size)}
                {durationSeconds ? ` · ${formatDuration(durationSeconds)}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="text-fg-muted hover:text-danger min-h-11 rounded-lg px-3 text-sm"
              onClick={() => setFile(null)}
            >
              Убрать
            </button>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Язык записи
            <select
              className="border-border bg-surface focus:border-primary focus:ring-primary mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:ring-1"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="ru">Русский</option>
              <option value="en">Английский</option>
              <option value="">Определить автоматически</option>
            </select>
          </label>
          {durationError ? (
            <label className="text-sm font-medium">
              Длительность, минут
              <input
                className="border-border bg-surface focus:border-primary focus:ring-primary mt-2 h-11 w-full rounded-lg border px-3 outline-none focus:ring-1"
                type="number"
                min="1"
                max="240"
                value={manualMinutes}
                onChange={(event) => setManualMinutes(event.target.value)}
              />
            </label>
          ) : null}
        </div>

        {uploading ? (
          <div className="mt-5" aria-live="polite">
            <div className="bg-surface-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-fg-muted mt-2 text-sm">Загружено {progress}%</p>
          </div>
        ) : null}
        {error ? (
          <p className="text-danger mt-4 text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button disabled={!file || uploading} loading={uploading} onClick={() => void upload()}>
            Начать расшифровку
          </Button>
        </div>
      </div>
    </div>
  );
}

function DocumentWorkspace({ job }: { job: Transcription }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(job.title ?? job.filename);
  const [text, setText] = useState(job.result_text ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setTitle(job.title ?? job.filename);
    setText(job.result_text ?? '');
    setSaveState('idle');
  }, [job.id, job.filename, job.result_text, job.title]);

  useEffect(() => {
    if (
      job.status !== 'completed' ||
      !title.trim() ||
      (title === (job.title ?? job.filename) && text === (job.result_text ?? ''))
    ) {
      return;
    }
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      const { data, error } = await api.PATCH('/api/v1/transcriptions/{job_id}', {
        params: { path: { job_id: job.id } },
        body: { title: title.trim(), result_text: text },
      });
      if (error || !data) {
        setSaveState('error');
        return;
      }
      queryClient.setQueryData<Transcription[]>(['transcriptions'], (items = []) =>
        items.map((item) => (item.id === data.id ? data : item)),
      );
      setSaveState('saved');
    }, 750);
    return () => window.clearTimeout(timer);
  }, [job, queryClient, text, title]);

  const isBusy = busyStatuses.has(job.status);
  return (
    <div>
      <Link
        to="/transcriptions"
        className="text-fg-muted hover:text-fg focus-visible:ring-primary mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2"
      >
        <Icon name="back" />
        Все конспекты
      </Link>
      <header className="border-border bg-surface rounded-xl border px-5 py-4 sm:px-6">
        <label className="sr-only" htmlFor="transcription-title">
          Название расшифровки
        </label>
        <input
          id="transcription-title"
          className="text-fg focus:ring-primary w-full rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none focus:ring-2 sm:text-3xl"
          value={title}
          readOnly={job.status !== 'completed'}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div className="text-fg-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span>{formatDate(job.created_at)}</span>
          {job.duration_seconds ? <span>· {formatDuration(job.duration_seconds)}</span> : null}
          <span>· {statusLabels[job.status]}</span>
          {saveState !== 'idle' ? (
            <span
              className={saveState === 'error' ? 'text-danger' : 'text-primary'}
              aria-live="polite"
            >
              ·{' '}
              {saveState === 'saving'
                ? 'Сохраняем…'
                : saveState === 'saved'
                  ? 'Изменения сохранены'
                  : 'Не удалось сохранить'}
            </span>
          ) : null}
        </div>
      </header>

      <div className="border-border bg-surface mt-5 min-h-[640px] rounded-xl border">
        {job.status === 'completed' ? (
          <textarea
            aria-label="Текст расшифровки"
            className="selection:bg-primary-subtle selection:text-fg min-h-[638px] w-full resize-none rounded-xl bg-transparent px-5 py-6 text-base leading-7 outline-none sm:px-9 sm:py-8 lg:px-14"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        ) : isBusy ? (
          <ProcessingState job={job} />
        ) : (
          <div className="flex min-h-[638px] flex-col items-center justify-center px-6 text-center">
            <span className="text-danger">
              <Icon name="warning" className="h-12 w-12" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">Не удалось обработать файл</h2>
            <p className="text-fg-muted mt-2 max-w-md">
              {job.error_message ?? 'Попробуйте загрузить запись ещё раз.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessingState({ job }: { job: Transcription }) {
  return (
    <div
      className="flex min-h-[638px] flex-col items-center justify-center px-6 text-center"
      aria-live="polite"
    >
      <span className="text-primary animate-pulse">
        <Icon name="audio" className="h-14 w-14" />
      </span>
      <h2 className="mt-5 text-xl font-semibold">{statusLabels[job.status]}</h2>
      <p className="text-fg-muted mt-2 max-w-md">
        Обработка идёт на сервере. Эту страницу можно закрыть и вернуться позже.
      </p>
      <div className="bg-surface-muted mt-6 h-2 w-full max-w-sm overflow-hidden rounded-full">
        <div className="bg-primary h-full w-2/3 animate-pulse rounded-full" />
      </div>
    </div>
  );
}

function UtilityRail({
  selected,
  jobs,
  entitlements,
  onCreate,
  onOpenLibrary,
  onOpenJob,
  onDelete,
}: {
  selected: Transcription | null;
  jobs: Transcription[];
  entitlements?: Entitlements;
  onCreate: () => void;
  onOpenLibrary: () => void;
  onOpenJob: (job: Transcription) => void;
  onDelete: (job: Transcription) => void;
}) {
  const ready = selected?.status === 'completed';
  return (
    <aside className="space-y-5 xl:sticky xl:top-6">
      <div className="border-border bg-surface rounded-xl border p-4">
        <Button fullWidth onClick={onCreate}>
          <Icon name="upload" />
          Загрузить файл
        </Button>
        {ready ? (
          <div className="mt-3 space-y-2">
            <RailButton
              onClick={() => void navigator.clipboard.writeText(selected.result_text ?? '')}
              icon="copy"
            >
              Копировать
            </RailButton>
            <RailButton onClick={() => downloadText(selected, 'txt')} icon="download">
              Скачать .txt
            </RailButton>
            <RailButton onClick={() => downloadText(selected, 'md')} icon="download">
              Скачать .md
            </RailButton>
            <button
              type="button"
              className="text-danger hover:bg-danger-subtle flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium transition-colors"
              onClick={() => onDelete(selected)}
            >
              <Icon name="delete" />
              Удалить расшифровку
            </button>
          </div>
        ) : selected && ['uploading', 'queued', 'failed'].includes(selected.status) ? (
          <button
            type="button"
            className="text-danger hover:bg-danger-subtle mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium"
            onClick={() => onDelete(selected)}
          >
            <Icon name="delete" />
            {selected.status === 'failed' ? 'Удалить задание' : 'Отменить задание'}
          </button>
        ) : null}
        <button
          type="button"
          className="text-primary hover:bg-primary-subtle mt-2 min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium"
          onClick={onOpenLibrary}
        >
          Открыть библиотеку
        </button>
      </div>

      {jobs.length ? (
        <div className="border-border bg-surface rounded-xl border">
          <h2 className="px-4 pt-4 text-lg font-semibold">В обработке · {jobs.length}</h2>
          <div className="divide-border mt-2 divide-y">
            {jobs.slice(0, 4).map((job) => (
              <button
                key={job.id}
                type="button"
                className="hover:bg-surface-muted flex min-h-20 w-full items-start gap-3 px-4 py-3 text-left transition-colors"
                onClick={() => onOpenJob(job)}
              >
                <Icon name="audio" className="mt-0.5 h-6 w-6 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {job.title ?? job.filename}
                  </span>
                  <span className="text-fg-muted mt-1 block text-xs">
                    {statusLabels[job.status]}
                  </span>
                  <span className="bg-surface-muted mt-2 block h-1.5 overflow-hidden rounded-full">
                    <span className="bg-primary block h-full w-2/3 animate-pulse rounded-full" />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <QuotaSummary entitlements={entitlements} />
    </aside>
  );
}

function QuotaSummary({ entitlements }: { entitlements?: Entitlements }) {
  if (!entitlements) return null;
  const limit = entitlements.limits[TRANSCRIPTION_LIMIT];
  const remaining = entitlements.remaining[TRANSCRIPTION_LIMIT];
  const used = entitlements.usage[TRANSCRIPTION_LIMIT] ?? 0;
  const percent =
    limit && limit > 0 ? Math.min((used / limit) * 100, 100) : limit === null ? 0 : 100;
  return (
    <div className="border-border border-t px-1 pt-4">
      <p className="text-sm font-medium">На этой неделе</p>
      <p className="text-fg-muted mt-2 text-sm">
        {limit === null ? 'Расшифровка без лимита' : `${remaining ?? 0} из ${limit} минут осталось`}
      </p>
      {limit !== null ? (
        <div className="bg-surface-muted mt-3 h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: `${100 - percent}%` }} />
        </div>
      ) : null}
      <p className="text-fg-subtle mt-2 text-xs">
        {formatReset(entitlements.resets_at[TRANSCRIPTION_LIMIT])}
      </p>
    </div>
  );
}

function LibraryDrawer({
  jobs,
  onClose,
  onOpen,
}: {
  jobs: Transcription[];
  onClose: () => void;
  onOpen: (job: Transcription) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = jobs.filter((job) =>
    (job.title ?? job.filename).toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')),
  );
  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="library-title"
    >
      <button
        type="button"
        aria-label="Закрыть библиотеку"
        className="bg-overlay/35 absolute inset-0"
        onClick={onClose}
      />
      <section className="border-border bg-surface absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l shadow-xl">
        <header className="border-border flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 id="library-title" className="text-xl font-semibold">
              Библиотека конспектов
            </h2>
            <p className="text-fg-muted mt-1 text-sm">
              {jobs.length} {pluralize(jobs.length, 'запись', 'записи', 'записей')}
            </p>
          </div>
          <button
            type="button"
            className="hover:bg-surface-muted grid h-11 w-11 place-items-center rounded-lg"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="border-border border-b p-4">
          <label className="sr-only" htmlFor="transcription-search">
            Найти расшифровку
          </label>
          <input
            id="transcription-search"
            className="border-border bg-surface focus:border-primary h-11 w-full rounded-lg border px-3 outline-none"
            placeholder="Найти по названию"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {filtered.length ? (
            filtered.map((job) => (
              <button
                key={job.id}
                type="button"
                className="hover:bg-surface-muted focus-visible:ring-primary flex min-h-20 w-full items-start gap-3 rounded-lg px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2"
                onClick={() => onOpen(job)}
              >
                <Icon
                  name={job.status === 'completed' ? 'file' : 'audio'}
                  className="mt-0.5 h-6 w-6 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{job.title ?? job.filename}</span>
                  <span className="text-fg-muted mt-1 block text-sm">
                    {statusLabels[job.status]} · {formatDate(job.created_at)}
                    {job.duration_seconds ? ` · ${formatDuration(job.duration_seconds)}` : ''}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="text-fg-muted p-5 text-center">Ничего не найдено.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function LimitDialog({ details, onClose }: { details: LimitDetails; onClose: () => void }) {
  const remaining = Math.max(details.limit - details.current, 0);
  return (
    <Modal title="Недостаточно минут" onClose={onClose}>
      <p className="text-fg-muted">
        Для этой записи нужно {details.requested} минут, а на текущей неделе осталось {remaining}.
      </p>
      <div className="bg-surface-muted mt-5 rounded-lg p-4 text-sm">
        <p className="font-medium">
          Лимит: {details.current} из {details.limit} минут использовано
        </p>
        <p className="text-fg-muted mt-1">{formatReset(details.resetsAt)}</p>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
        <Link
          to="/billing"
          className="bg-primary text-primary-fg hover:bg-primary-hover inline-flex h-10 items-center justify-center rounded-md px-4 font-medium"
        >
          Повысить план
        </Link>
      </div>
    </Modal>
  );
}

function DeleteDialog({
  job,
  onClose,
  onDeleted,
}: {
  job: Transcription;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await api.DELETE('/api/v1/transcriptions/{job_id}', {
        params: { path: { job_id: job.id } },
      });
      if (error) throw new Error(apiMessage(error, 'Не удалось удалить расшифровку'));
    },
    onSuccess: onDeleted,
  });
  const cancel = ['uploading', 'queued'].includes(job.status);
  return (
    <Modal title={cancel ? 'Отменить задание?' : 'Удалить расшифровку?'} onClose={onClose}>
      <p className="text-fg-muted">
        {cancel
          ? 'Загрузка остановится, а зарезервированные минуты вернутся в недельный лимит.'
          : 'Текст будет удалён без возможности восстановления. Исходный файл уже не хранится.'}
      </p>
      {mutation.error ? (
        <p className="text-danger mt-4 text-sm" role="alert">
          {mutation.error.message}
        </p>
      ) : null}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>
          Оставить
        </Button>
        <Button variant="danger" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {cancel ? 'Отменить задание' : 'Удалить'}
        </Button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="bg-overlay/40 fixed inset-0 z-[60] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <section className="border-border bg-surface w-full max-w-lg rounded-xl border p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="modal-title" className="text-xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            className="hover:bg-surface-muted grid h-11 w-11 place-items-center rounded-lg"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  );
}

function RailButton({
  icon,
  onClick,
  children,
}: {
  icon: IconName;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="border-border hover:bg-surface-muted flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors"
      onClick={onClick}
    >
      <Icon name={icon} />
      {children}
    </button>
  );
}

function PageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-8 text-center">
      <p className="text-fg-muted">{children}</p>
    </div>
  );
}

type IconName =
  'audio' | 'back' | 'close' | 'copy' | 'delete' | 'download' | 'file' | 'upload' | 'warning';
function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    back: <path d="m15 18-6-6 6-6M9 12h11" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
      </>
    ),
    delete: (
      <>
        <path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14" />
        <path d="M10 11v6m4-6v6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 19h14" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v5h5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
        <path d="M5 15a4 4 0 0 0 1 8h12a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.3 13" />
      </>
    ),
    audio: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function apiMessage(error: unknown, fallback: string) {
  return typeof error === 'object' &&
    error &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : fallback;
}

function limitFromError(
  error: { details?: Record<string, unknown> },
  entitlements?: Entitlements,
): LimitDetails {
  return limitFromUnknown(error.details, entitlements);
}

function limitFromUnknown(
  details: Record<string, unknown> | undefined,
  entitlements?: Entitlements,
): LimitDetails {
  return {
    limit:
      typeof details?.limit === 'number'
        ? details.limit
        : (entitlements?.limits[TRANSCRIPTION_LIMIT] ?? 0),
    current:
      typeof details?.current === 'number'
        ? details.current
        : (entitlements?.usage[TRANSCRIPTION_LIMIT] ?? 0),
    requested: typeof details?.requested === 'number' ? details.requested : 1,
    resetsAt:
      typeof details?.resets_at === 'string'
        ? details.resets_at
        : (entitlements?.resets_at[TRANSCRIPTION_LIMIT] ?? null),
  };
}

function readMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    media.preload = 'metadata';
    media.onloadedmetadata = () => {
      const duration = Math.ceil(media.duration);
      URL.revokeObjectURL(url);
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error('duration unavailable'));
    };
    media.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('duration unavailable'));
    };
    media.src = url;
  });
}

function downloadText(job: Transcription, extension: 'txt' | 'md') {
  const blob = new Blob([job.result_text ?? ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(job.title ?? job.filename)}.${extension}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sanitizeFilename(value: string) {
  return (
    value
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim() || 'transcription'
  );
}

function formatBytes(value: number) {
  return value < 1024 * 1024
    ? `${Math.max(1, Math.round(value / 1024))} КБ`
    : `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

function formatDuration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${pluralize(minutes, 'минута', 'минуты', 'минут')}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(value),
  );
}

function formatReset(value: string | null | undefined) {
  if (!value) return 'Лимит не сбрасывается';
  return `Сброс ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(value))}`;
}

function pluralize(value: number, one: string, few: string, many: string) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
