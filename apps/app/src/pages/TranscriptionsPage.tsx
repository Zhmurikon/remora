import { isLimitExceeded, type components } from '@remora/api-client';
import { Button } from '@remora/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError } from '../lib/api';
import {
  clearLectureIntent,
  loadLectureDraft,
  removeLectureDraft,
} from '../features/study/lecture-demo-draft';
import { useAuthStore } from '../features/auth/auth-store';
import { GenerationWorkspace } from '../components/GenerationWorkspace';
import sourceArtwork from '../../../web/public/images/collections/study-folder.webp';
import './ai-assistant.css';
import { BillingNotice } from '../features/billing/BillingNotice';
import { BillingLimitDialog } from '../features/billing/BillingLimitDialog';

type Transcription = components['schemas']['TranscriptionPublic'];
type Entitlements = components['schemas']['EntitlementsPublic'];
type AssistantTask = components['schemas']['AssistantPublic'];
type JobStatus = components['schemas']['TranscriptionStatus'];

const CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 2;
const UPLOAD_RETRIES = 8;
const TRANSCRIPTION_LIMIT = 'ai.transcription_minutes_per_week';
const FAST_MODE_MULTIPLIER = 4;
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
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(!jobId || jobId === 'new');
  useEffect(() => setCreating(!jobId || jobId === 'new'), [jobId]);
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

  const tasksQuery = useQuery({
    queryKey: ['assistant-tasks'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/assistant/tasks');
      if (error || !data) throw new Error(apiMessage(error, 'Не удалось загрузить задачи'));
      return data;
    },
    refetchInterval: (query) =>
      query.state.data?.some((t) => !['completed', 'failed'].includes(t.status)) ? 2500 : false,
  });
  const childSources = new Set(
    (tasksQuery.data ?? []).flatMap((t) => t.source_ids.filter((id) => id !== t.source_id)),
  );
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);
  const historyJobs = jobs.filter((j) => !childSources.has(j.id));
  const selected = useMemo(() => {
    if (creating || jobId === 'new') return null;
    if (jobId) return jobs.find((job) => job.id === jobId) ?? null;
    return null;
  }, [creating, jobId, jobs]);
  const showUploader = creating || !jobId || jobId === 'new';

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
      queryClient.invalidateQueries({ queryKey: ['assistant-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] }),
    ]);
    setCreating(false);
    navigate(`/transcriptions/${job.id}`);
  }

  if (jobsQuery.isLoading || tasksQuery.isLoading) {
    return <PageMessage>Загружаем библиотеку…</PageMessage>;
  }

  return (
    <div className="ai-assistant">
      {jobsQuery.isError ? (
        <div className="ai-notice" role="alert">
          Не удалось загрузить задачи.{' '}
          <button onClick={() => void jobsQuery.refetch()}>Повторить</button>
        </div>
      ) : null}
      {tasksQuery.isError ? (
        <p className="ai-notice" role="alert">
          Не удалось загрузить состояние задач.{' '}
          <button onClick={() => void tasksQuery.refetch()}>Повторить</button>
        </p>
      ) : null}
      {entitlementsQuery.isError ? (
        <div className="ai-notice" role="alert">
          Не удалось проверить доступ к генерации.{' '}
          <button onClick={() => void entitlementsQuery.refetch()}>Повторить</button>
        </div>
      ) : null}
      {showUploader || selected?.status === 'uploading' ? (
        <UploadWorkspace
          draftId={jobId === 'new' ? search.get('draft') : null}
          resumeJob={selected?.status === 'uploading' ? selected : undefined}
          entitlements={entitlementsQuery.data}
          onLimit={setLimitDetails}
          onUploaded={(job) => void refreshAfterUpload(job)}
        />
      ) : selected ? (
        <DocumentWorkspace
          key={selected.id}
          job={selected}
          task={tasksQuery.data?.find((t) => t.source_id === selected.id)}
          allSources={jobs}
          entitlements={entitlementsQuery.data}
          onDelete={() => setDeleteTarget(selected)}
        />
      ) : (
        <PageMessage>
          Задача не найдена. <Link to="/transcriptions">Вернуться к ИИ-помощнику</Link>
        </PageMessage>
      )}
      {showUploader ? (
        <section className="ai-history" aria-labelledby="ai-history-title">
          <header>
            <h2 id="ai-history-title">Последние задачи</h2>
            <button onClick={() => setLibraryOpen(true)}>Вся история →</button>
          </header>
          {!jobs.length && !jobsQuery.isError ? (
            <p className="ai-muted">
              Здесь появятся ваши материалы. Начните с загрузки материалов.
            </p>
          ) : null}
          {historyJobs.slice(0, 5).map((job) => (
            <button className="ai-history-row" key={job.id} onClick={() => openJob(job)}>
              <Icon name="file" />
              <span>
                <strong>{job.title ?? job.filename}</strong>
                <small>
                  {formatDate(job.created_at)}
                  {job.duration_seconds ? ` · ${formatDuration(job.duration_seconds)}` : ''}
                </small>
              </span>
              <span className="ai-status">
                {(() => {
                  const task = tasksQuery.data?.find((t) => t.source_id === job.id);
                  return task
                    ? ({
                        waiting: 'Изучаем материалы',
                        notes: 'Готовим конспект',
                        cards: 'Создаём карточки',
                        completed: 'Результат готов',
                        failed: 'Нужна ваша помощь',
                      }[task.status] ?? task.status)
                    : job.status === 'completed'
                      ? 'Источник обработан'
                      : statusLabels[job.status];
                })()}
              </span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
        </section>
      ) : null}

      {libraryOpen ? (
        <LibraryDrawer jobs={historyJobs} onClose={() => setLibraryOpen(false)} onOpen={openJob} />
      ) : null}
      {limitDetails ? (
        <BillingLimitDialog details={limitDetails} onClose={() => setLimitDetails(null)} />
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
  draftId,
  resumeJob,
  entitlements,
  onLimit,
  onUploaded,
}: {
  draftId: string | null;
  resumeJob?: Transcription;
  entitlements?: Entitlements;
  onLimit: (details: LimitDetails) => void;
  onUploaded: (job: Transcription) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(resumeJob?.id ?? null);
  const queryClient = useQueryClient();
  const [uploadJob, setUploadJob] = useState<Transcription | undefined>(resumeJob);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<'notes' | 'both' | 'cards' | 'transcript'>('notes');
  const choosing = useRef(0);
  const [attachments, setAttachments] = useState<{ file: File; duration: number | null }[]>([]);
  const [destination, setDestination] = useState<'later' | 'new' | 'existing'>('later');
  const [courseId, setCourseId] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [detail, setDetail] = useState<'short' | 'balanced' | 'detailed'>('balanced');
  const [formulas, setFormulas] = useState(true);
  const [diagrams, setDiagrams] = useState(false);
  const [cardCount, setCardCount] = useState(12);
  const [startingTask, setStartingTask] = useState(false);
  const taskRequest = useRef(crypto.randomUUID());
  const uploadedSources = useRef(new Map<File, Transcription>());
  const pendingSources = useRef(new Map<File, Transcription>());
  const courses = useQuery({
    queryKey: ['assistant-courses'],
    enabled: destination === 'existing',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/courses');
      if (error || !data) throw new Error('Не удалось загрузить курсы');
      return data;
    },
  });
  const sourceLimit = entitlements?.limits['ai.sources_per_task'] ?? 1;
  const documentFile = (f: File) => /\.(pdf|pptx|docx|txt|md)$/i.test(f.name);

  const [language, setLanguage] = useState('ru');
  const [fastMode, setFastMode] = useState(false);
  const [phraseTimestamps, setPhraseTimestamps] = useState(false);
  const [speakerLabeling, setSpeakerLabeling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [readingDuration, setReadingDuration] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const currentJob = uploadJob ?? resumeJob;
  useEffect(
    () => () => {
      abortRef.current?.abort();
      choosing.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!startingTask) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [startingTask]);

  const email = useAuthStore((state) => state.user?.email);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  useEffect(() => {
    let active = true;
    setDraftFile(null);
    if (draftId) {
      if (email) clearLectureIntent(draftId, email);
      void loadLectureDraft(draftId)
        .then((saved) => {
          if (!active) return;
          setDraftFile(saved);
          if (!saved)
            setError('Запись больше не сохранена в этом браузере. Выберите файл ещё раз.');
        })
        .catch(() => {
          if (active) setError('Не удалось открыть сохранённую запись. Выберите файл ещё раз.');
        });
    }
    return () => {
      active = false;
    };
  }, [draftId, email]);

  useEffect(() => {
    if (resumeJob) {
      setUploadJob(resumeJob);
      activeJobIdRef.current = resumeJob.id;
    }
  }, [resumeJob]);

  async function chooseFile(next: File | undefined) {
    if (next) await chooseFiles([next]);
  }
  async function chooseFiles(nextFiles: File[]) {
    if (uploading || startingTask) return;
    const selection = ++choosing.current;
    setError('');
    if (attachments.length + nextFiles.length > Math.max(1, sourceLimit)) {
      setError(`В одной задаче доступно до ${sourceLimit} источников по вашему тарифу.`);
      return;
    }
    setReadingDuration(true);
    const added: { file: File; duration: number | null }[] = [];
    try {
      for (const next of nextFiles) {
        if (next.size === 0) throw new Error('Файл пуст. Выберите другой документ.');
        if (next.size > (documentFile(next) ? 25 * 1024 * 1024 : MAX_FILE_BYTES))
          throw new Error('Запись — до 1 ГБ, документ — до 25 МБ.');
        if (
          !documentFile(next) &&
          !/^(audio|video)\//.test(next.type) &&
          !/\.(aac|ac3|aiff|amr|ape|avi|flac|flv|m2ts|m4a|m4v|mkv|mov|mp3|mp4|mpeg|mpg|mts|ogg|opus|ts|vob|wav|webm|wma|wmv|3gp)$/i.test(
            next.name,
          )
        )
          throw new Error('Поддерживаются аудио, видео, PDF, PPTX, DOCX, TXT и Markdown.');
        if (
          currentJob &&
          (next.name !== currentJob.filename || next.size !== currentJob.size_bytes)
        )
          throw new Error(`Выберите исходный файл «${currentJob.filename}».`);
        const duration = documentFile(next)
          ? null
          : (currentJob?.duration_seconds ?? (await readMediaDuration(next)));
        added.push({ file: next, duration });
      }
      if (selection !== choosing.current) return;
      setAttachments((previous) => [...previous, ...added]);
      if (added[0]) {
        setFile(added[0].file);
        setDurationSeconds(added[0].duration);
      }
    } catch (caught) {
      if (selection === choosing.current)
        setError(caught instanceof Error ? caught.message : 'Не удалось прочитать файл');
    } finally {
      if (selection === choosing.current) setReadingDuration(false);
    }
  }
  async function startTask() {
    if (!attachments.length || startingTask) return;
    setStartingTask(true);
    setError('');
    try {
      const sources: Transcription[] = [];
      for (const attachment of attachments) {
        let source = uploadedSources.current.get(attachment.file);
        if (!source) source = await upload(attachment.file, attachment.duration);
        if (!source) return;
        uploadedSources.current.set(attachment.file, source);
        sources.push(source);
      }
      const { data, error } = await api.POST('/api/v1/assistant/tasks', {
        body: {
          request_id: taskRequest.current,
          source_ids: sources.map((source) => source.id),
          result,
          options: {
            destination: result === 'transcript' ? 'later' : destination,
            course_id: destination === 'existing' ? courseId : null,
            course_title: courseTitle,
            detail,
            formulas,
            diagrams,
            card_count: cardCount,
          },
        },
      });
      if (error || !data)
        throw new Error(
          apiMessage(error, 'Не удалось запустить задачу. Файлы сохранены, повторите запуск.'),
        );
      try {
        sessionStorage.setItem(`ai-result:${sources[0]!.id}`, result);
      } catch {
        /* Сценарий хранится также на сервере. */
      }
      if (draftId) void removeLectureDraft(draftId).catch(() => undefined);
      onUploaded(sources[0]!);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать задачу');
    } finally {
      setStartingTask(false);
    }
  }

  async function upload(selectedFile = file, selectedDuration = durationSeconds) {
    if (!selectedFile || uploading) return;
    if (selectedDuration === null && !documentFile(selectedFile)) {
      setError('Не удалось автоматически определить длительность записи.');
      return;
    }
    const seconds = selectedDuration ?? 0;
    const requested = Math.ceil(seconds / 60) * (fastMode ? FAST_MODE_MULTIPLIER : 1);
    const remaining = entitlements?.remaining[TRANSCRIPTION_LIMIT];
    if (!currentJob && remaining !== null && remaining !== undefined && remaining < requested) {
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
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const totalParts = Math.ceil(selectedFile.size / CHUNK_BYTES);
      let job =
        pendingSources.current.get(selectedFile) ??
        (currentJob?.filename === selectedFile.name ? currentJob : undefined);
      if (job) {
        const latest = await api.GET('/api/v1/transcriptions/{job_id}', {
          params: { path: { job_id: job.id } },
        });
        if (latest.data && latest.data.status !== 'uploading') return latest.data;
      }
      if (!job) {
        const created = await api.POST('/api/v1/transcriptions', {
          body: {
            filename: selectedFile.name,
            content_type: selectedFile.type || 'application/octet-stream',
            size_bytes: selectedFile.size,
            total_parts: totalParts,
            duration_seconds: documentFile(selectedFile) ? null : seconds,
            language: language || null,
            fast_mode: fastMode,
            phrase_timestamps: phraseTimestamps,
            speaker_labeling: speakerLabeling,
          },
        });
        if (created.error || !created.data) {
          if (isLimitExceeded(created.error)) {
            onLimit(limitFromError(created.error, entitlements));
            return;
          }
          throw new Error(apiMessage(created.error, 'Не удалось создать расшифровку'));
        }
        job = created.data;
        pendingSources.current.set(selectedFile, job);

        activeJobIdRef.current = job.id;
        await queryClient.invalidateQueries({ queryKey: ['transcriptions'] });
      }

      const uploadState = await api.GET('/api/v1/transcriptions/{job_id}/upload', {
        params: { path: { job_id: job.id } },
      });
      if (uploadState.error || !uploadState.data) {
        throw new Error(apiMessage(uploadState.error, 'Не удалось продолжить загрузку'));
      }
      const uploaded = new Set(uploadState.data.uploaded_parts.map((part) => part.part_number));
      let completedBytes = uploadState.data.uploaded_parts.reduce(
        (sum, part) => sum + part.size_bytes,
        0,
      );
      setProgress(Math.round((completedBytes / selectedFile.size) * 100));
      const pending = Array.from({ length: totalParts }, (_, index) => index + 1).filter(
        (part) => !uploaded.has(part),
      );
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const partNumber = pending[cursor];
          cursor += 1;
          if (partNumber === undefined) return;
          const start = (partNumber - 1) * CHUNK_BYTES;
          const chunk = selectedFile.slice(start, Math.min(selectedFile.size, start + CHUNK_BYTES));
          await uploadPartWithRetry(job.id, partNumber, chunk, controller.signal);
          completedBytes += chunk.size;
          setProgress(Math.round((completedBytes / selectedFile.size) * 100));
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, () => worker()),
      );
      const completed = await api.POST('/api/v1/transcriptions/{job_id}/complete', {
        params: { path: { job_id: job.id } },
      });
      if (completed.error || !completed.data) {
        throw new Error(apiMessage(completed.error, 'Не удалось запустить распознавание'));
      }
      try {
        sessionStorage.setItem(`ai-result:${job.id}`, result);
      } catch {
        /* Выбор результата не должен мешать загрузке. */
      }
      activeJobIdRef.current = null;
      setUploadJob(undefined);
      if (draftId) void removeLectureDraft(draftId).catch(() => undefined);
      return completed.data;
    } catch (caught) {
      controller.abort();
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setError('Загрузка отменена.');
      } else if (caught instanceof ApiRequestError && caught.code === 'LIMIT_EXCEEDED') {
        onLimit(limitFromUnknown(caught.details, entitlements));
      } else {
        setError(caught instanceof Error ? caught.message : 'Не удалось загрузить файл');
      }
    } finally {
      abortRef.current = null;
      setUploading(false);
    }
  }

  async function cancelUpload() {
    abortRef.current?.abort();
    const jobId = activeJobIdRef.current;
    if (jobId) {
      await api.DELETE('/api/v1/transcriptions/{job_id}', {
        params: { path: { job_id: jobId } },
      });
      activeJobIdRef.current = null;
      for (const [pendingFile, source] of pendingSources.current) {
        if (source.id === jobId) pendingSources.current.delete(pendingFile);
      }
      setUploadJob(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transcriptions'] }),
        queryClient.invalidateQueries({ queryKey: ['billing-entitlements'] }),
      ]);
    }
    setProgress(0);
    setUploading(false);
  }

  const permitted =
    (attachments.every((a) => documentFile(a.file)) ||
      entitlements?.features['ai.transcription'] === true) &&
    (result === 'transcript' || entitlements?.features['ai.generation'] === true);
  const launchLabel =
    result === 'transcript'
      ? 'Создать расшифровку'
      : result === 'cards'
        ? 'Создать карточки'
        : result === 'both'
          ? 'Создать конспект и карточки'
          : 'Создать конспект';
  return (
    <div>
      <header className="ai-heading">
        <p className="ai-eyebrow">ИИ-помощник</p>
        <h1>{currentJob ? 'Продолжим загрузку' : 'Что будем изучать?'}</h1>
        <p>
          {currentJob
            ? `Выберите исходный файл «${currentJob.filename}» — загруженные части сохранятся.`
            : 'Загрузите материалы — получите понятный конспект и карточки.'}
        </p>
      </header>
      <div className="ai-create-grid">
        <section className="ai-sources" aria-label="Ваши материалы">
          <h2>Ваши материалы</h2>
          <div
            className={`ai-dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!uploading) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event: DragEvent<HTMLDivElement>) => {
              event.preventDefault();
              setDragging(false);
              if (!uploading && !startingTask)
                void chooseFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <img src={sourceArtwork} alt="" width="300" height="200" />
            <h3>Добавьте файлы к задаче</h3>
            <p>Перетащите файл сюда или выберите на устройстве</p>
            <Button
              variant="secondary"
              disabled={uploading || readingDuration}
              onClick={() => inputRef.current?.click()}
            >
              Выбрать файл
            </Button>
            <small>Аудио, видео, PDF, PPTX, DOCX и текст</small>
          </div>
          <input
            ref={inputRef}
            hidden
            multiple
            type="file"
            aria-label="Выбрать материалы"
            accept=".pdf,.pptx,.docx,.txt,.md,audio/*,video/*,.aac,.ac3,.aiff,.amr,.ape,.avi,.flac,.flv,.m2ts,.m4a,.m4v,.mkv,.mov,.mp3,.mp4,.mpeg,.mpg,.mts,.ogg,.opus,.ts,.vob,.wav,.webm,.wma,.wmv,.3gp"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void chooseFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          {draftFile && !file ? (
            <div className="ai-file">
              <span>{draftFile.name}</span>
              <button onClick={() => void chooseFile(draftFile)}>Использовать запись</button>
            </div>
          ) : null}
          {attachments.map((attachment, index) => (
            <div className="ai-file" key={index}>
              <Icon name={documentFile(attachment.file) ? 'file' : 'audio'} />
              <div>
                <strong>{attachment.file.name}</strong>
                <small>
                  {formatBytes(attachment.file.size)}
                  {attachment.duration
                    ? ` · ${formatDuration(attachment.duration)}`
                    : ' · Документ'}
                </small>
              </div>
              <button
                aria-label={`Убрать ${attachment.file.name}`}
                disabled={uploading || startingTask || !!currentJob}
                onClick={() => setAttachments((previous) => previous.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
          {readingDuration ? <p role="status">Проверяем файлы…</p> : null}
          <p className="ai-source-foot">
            <span>
              {attachments.length} из {sourceLimit} источников
            </span>
            <Link to="/billing">Лимиты тарифа</Link>
          </p>
          <p className="ai-muted ai-small">
            Запись — до 1 ГБ. Документ — до 25 МБ. PDF должен содержать текст; сканы пока не
            поддерживаются.
          </p>
          {error ? (
            <p className="ai-notice" role="alert">
              {error}
            </p>
          ) : null}
          {uploading ? (
            <div className="ai-upload-progress" role="status">
              <progress aria-label="Загрузка записи" value={progress} max="100" />
              <p>Загружено {progress}%</p>
              <Button variant="secondary" onClick={() => void cancelUpload()}>
                Отменить загрузку
              </Button>
            </div>
          ) : null}
        </section>
        <section className="ai-setup" aria-label="Настройки результата">
          <fieldset disabled={uploading || startingTask || !!currentJob}>
            <legend>Что получить?</legend>
            {(
              [
                ['notes', 'Конспект'],
                ['both', 'Конспект и карточки'],
                ['cards', 'Карточки'],
              ] as const
            ).map(([value, label]) => (
              <label className={`ai-choice ${result === value ? 'is-selected' : ''}`} key={value}>
                <input
                  type="radio"
                  name="ai-result"
                  value={value}
                  checked={result === value}
                  onChange={() => setResult(value)}
                />
                {label}
              </label>
            ))}
            <label className="ai-transcript-choice">
              <input
                type="radio"
                name="ai-result"
                checked={result === 'transcript'}
                onChange={() => setResult('transcript')}
              />{' '}
              Только расшифровка
            </label>
          </fieldset>
          {result !== 'transcript' ? (
            <fieldset className="ai-destination" disabled={startingTask}>
              <legend>Куда сохранить конспект?</legend>
              <select
                aria-label="Куда сохранить конспект"
                value={destination}
                onChange={(event) => setDestination(event.target.value as typeof destination)}
              >
                <option value="later">Решить позже</option>
                <option value="new">В новый курс</option>
                <option value="existing">В существующий курс</option>
              </select>
              {destination === 'new' ? (
                <label className="ai-stack">
                  Название курса
                  <input
                    className="ai-field"
                    value={courseTitle}
                    maxLength={160}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    placeholder="Предложим по названию файла"
                  />
                </label>
              ) : null}
              {destination === 'existing' ? (
                <label>
                  Выберите курс
                  <select
                    aria-label="Существующий курс"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                  >
                    <option value="">Выберите курс</option>
                    {courses.data?.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                        {course.is_published ? ' · открытый курс' : ''}
                      </option>
                    ))}
                  </select>
                  {courses.isError ? (
                    <button type="button" onClick={() => void courses.refetch()}>
                      Повторить загрузку курсов
                    </button>
                  ) : null}
                </label>
              ) : null}
              <p className="ai-muted ai-small">
                {destination === 'later'
                  ? 'Конспект сохранится только для вас. Добавить его в курс можно позже.'
                  : 'Конспект станет уроком курса с тем же доступом. Правки будут общими.'}
              </p>
            </fieldset>
          ) : null}
          <details className="ai-advanced">
            <summary>Дополнительные настройки</summary>
            <div>
              <label>
                Подробность конспекта
                <select value={detail} onChange={(e) => setDetail(e.target.value as typeof detail)}>
                  <option value="short">Кратко</option>
                  <option value="balanced">Сбалансированно</option>
                  <option value="detailed">Подробно</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formulas}
                  onChange={(e) => setFormulas(e.target.checked)}
                />{' '}
                Добавлять формулы по теме
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={diagrams}
                  onChange={(e) => setDiagrams(e.target.checked)}
                />{' '}
                Добавлять текстовые схемы и таблицы
              </label>
              <label>
                Максимум карточек
                <select value={cardCount} onChange={(e) => setCardCount(Number(e.target.value))}>
                  {[3, 6, 9, 12].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                Язык записи
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={uploading || !!currentJob}
                >
                  <option value="ru">Русский</option>
                  <option value="en">Английский</option>
                  <option value="">Определить автоматически</option>
                </select>
              </label>
              <TranscriptionOption
                checked={fastMode}
                onChange={setFastMode}
                title="Быстрый режим"
                badge="Расход ×4"
                description="Запись попадёт в ускоренную очередь."
                disabled={uploading || !!currentJob}
                warning
              />
              <TranscriptionOption
                checked={phraseTimestamps}
                onChange={setPhraseTimestamps}
                title="Временные метки"
                badge="Без доп. расхода"
                description="Время начала каждой фразы."
                disabled={uploading || !!currentJob}
              />
              <TranscriptionOption
                checked={speakerLabeling}
                onChange={setSpeakerLabeling}
                title="Определять дикторов"
                badge="Без доп. расхода"
                description="До двух говорящих в монозаписи."
                disabled={uploading || !!currentJob}
              />
              {fastMode ? (
                <p className="ai-notice">Быстрый режим: 20 минут записи спишут 80 минут лимита.</p>
              ) : null}
            </div>
          </details>
          <Button
            fullWidth
            disabled={
              !attachments.length ||
              readingDuration ||
              uploading ||
              startingTask ||
              (result !== 'transcript' && destination === 'existing' && !courseId) ||
              (!currentJob && !permitted)
            }
            onClick={() => void startTask()}
          >
            {uploading || startingTask
              ? 'Подготавливаем…'
              : currentJob
                ? 'Продолжить загрузку'
                : launchLabel}
          </Button>
          <details className="ai-limits">
            <summary>Доступ и остаток лимита</summary>
            <QuotaSummary entitlements={entitlements} />
          </details>
          {!entitlements ? (
            <p className="ai-small ai-muted">Проверяем доступ к обработке…</p>
          ) : !permitted ? (
            <p className="ai-small ai-muted">
              Для новой обработки нужна подписка. <Link to="/billing">Посмотреть тарифы</Link>
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function TranscriptionOption({
  checked,
  onChange,
  title,
  badge,
  description,
  disabled,
  warning = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  badge: string;
  description: string;
  disabled: boolean;
  warning?: boolean;
}) {
  return (
    <label
      className={`border-border flex min-h-32 cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${checked ? 'border-primary bg-primary-subtle/40' : 'hover:bg-surface-muted'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="checkbox"
        className="border-border text-primary focus:ring-primary mt-1 h-5 w-5 shrink-0 rounded"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span
          className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${warning ? 'bg-warning-subtle text-warning' : 'bg-surface-muted text-fg-muted'}`}
        >
          {badge}
        </span>
        <span className="text-fg-muted mt-2 block text-sm leading-5">{description}</span>
      </span>
    </label>
  );
}

function DocumentWorkspace({
  job,
  entitlements,
  onDelete,
  task,
  allSources,
}: {
  job: Transcription;
  task?: AssistantTask;
  allSources: Transcription[];
  entitlements?: Entitlements;
  onDelete: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(() => {
    if (task?.result === 'transcript') return 1;
    if (task?.result === 'cards') return 3;
    try {
      return sessionStorage.getItem(`ai-result:${job.id}`) === 'transcript' ? 1 : 2;
    } catch {
      return 2;
    }
  });
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(job.title ?? job.filename);
  const [text, setText] = useState(job.result_text ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

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
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Последовательная запись не даёт старому запросу затереть более свежий текст.
      saveQueue.current = saveQueue.current.then(async () => {
        if (cancelled) return;
        setSaveState('saving');
        try {
          const { data, error } = await api.PATCH('/api/v1/transcriptions/{job_id}', {
            params: { path: { job_id: job.id } },
            body: { title: title.trim(), result_text: text },
          });
          if (cancelled) return;
          if (error || !data) {
            setSaveState('error');
            return;
          }
          queryClient.setQueryData<Transcription[]>(['transcriptions'], (items = []) =>
            items.map((item) => (item.id === data.id ? data : item)),
          );
          setSaveState('saved');
        } catch {
          if (!cancelled) setSaveState('error');
        }
      });
    }, 750);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job, queryClient, text, title]);

  const isBusy = busyStatuses.has(job.status);
  const sourceReady =
    title === (job.title ?? job.filename) &&
    text === (job.result_text ?? '') &&
    saveState !== 'error' &&
    !!text.trim();
  const resultQuery = useQuery({
    queryKey: ['generations', job.id],
    enabled: job.status === 'completed',
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/transcriptions/{source_id}/generations', {
        params: { path: { source_id: job.id } },
      });
      if (error || !data) throw new Error(apiMessage(error, 'Не удалось загрузить результаты'));
      return data;
    },
  });
  const hasCards = resultQuery.data?.some((g) => g.kind === 'cards') ?? false;
  const [autoCreateCards, setAutoCreateCards] = useState(false);
  const [cardNoteId, setCardNoteId] = useState<string>();
  const [taskError, setTaskError] = useState('');
  const sourceActions = (
    <div className="ai-source-actions">
      {task?.source_ids
        .filter((id) => id !== job.id)
        .map((id) => {
          const item = allSources.find((s) => s.id === id);
          return item ? (
            <details key={id}>
              <summary>{item.filename}</summary>
              <p className="ai-small">{item.result_text ?? statusLabels[item.status]}</p>
            </details>
          ) : null;
        })}
      <button className="ai-file-link" onClick={() => setStep(1)}>
        <Icon name="audio" />
        <span>{job.filename}</span>
        <span aria-hidden="true">↗</span>
      </button>
      <details>
        <summary>Расшифровка и выгрузка</summary>
        <div className="ai-stack">
          <button onClick={() => setStep(1)}>Открыть расшифровку</button>
          <RailButton onClick={() => downloadText(job, 'txt')} icon="download">
            Расшифровка .txt
          </RailButton>
          <RailButton onClick={() => downloadText(job, 'md')} icon="download">
            Расшифровка .md
          </RailButton>
          {job.has_structured_result ? (
            <RailButton onClick={() => void downloadStructuredResult(job)} icon="download">
              Скачать данные .json
            </RailButton>
          ) : null}
        </div>
      </details>
    </div>
  );
  return (
    <div>
      <Link to="/transcriptions" className="ai-back">
        ← ИИ-помощник
      </Link>
      <header className="ai-heading ai-result-heading">
        <label className="sr-only" htmlFor="transcription-title">
          Название материала
        </label>
        <input
          id="transcription-title"
          value={title}
          readOnly={job.status !== 'completed'}
          onChange={(event) => setTitle(event.target.value)}
        />
        <p>
          {formatDate(job.created_at)}
          {job.duration_seconds ? ` · ${formatDuration(job.duration_seconds)}` : ''}
          {saveState === 'error'
            ? ' · Не удалось сохранить название или расшифровку'
            : saveState === 'saving'
              ? ' · Сохраняем…'
              : ''}
        </p>
      </header>
      {task && task.status !== 'completed' ? (
        <div className="ai-notice" role="status">
          {task.status === 'failed'
            ? task.error_message
            : ({
                waiting: 'Изучаем исходные материалы…',
                notes: 'Готовим конспект…',
                cards: 'Создаём карточки…',
              }[task.status] ?? 'Обрабатываем задачу…')}
          {task.status === 'failed' &&
          allSources.some((s) => task.source_ids.includes(s.id) && s.status === 'failed') ? (
            <Link to="/transcriptions">Загрузить исправленный файл в новую задачу</Link>
          ) : task.status === 'failed' ? (
            <button
              onClick={async () => {
                const { error } = await api.POST('/api/v1/assistant/tasks/{task_id}/retry', {
                  params: { path: { task_id: task.id } },
                });
                if (error) setTaskError(apiMessage(error, 'Не удалось повторить'));
                else await queryClient.invalidateQueries({ queryKey: ['assistant-tasks'] });
              }}
            >
              Повторить задачу
            </button>
          ) : (
            <span> Можно закрыть страницу и вернуться позже.</span>
          )}
        </div>
      ) : null}
      {taskError ? <p role="alert">{taskError}</p> : null}
      <nav className="ai-result-tabs" aria-label="Материалы задачи">
        <button
          aria-pressed={step === 2}
          disabled={job.status !== 'completed'}
          onClick={() => setStep(2)}
        >
          Конспект
        </button>
        {!task ||
        task.result === 'cards' ||
        task.result === 'both' ||
        hasCards ||
        autoCreateCards ? (
          <button
            aria-pressed={step === 3}
            disabled={job.status !== 'completed'}
            onClick={() => setStep(3)}
          >
            Карточки
          </button>
        ) : null}
        <button aria-pressed={step === 1} onClick={() => setStep(1)}>
          Расшифровка
        </button>
      </nav>
      {job.status === 'completed' && step !== 1 ? (
        <GenerationWorkspace
          key={`${job.id}:${step}`}
          source={job}
          kind={step === 2 ? 'notes' : 'cards'}
          entitlements={entitlements}
          sourceReady={sourceReady}
          onNext={(noteId) => {
            setCardNoteId(noteId);
            setAutoCreateCards(true);
            setStep(3);
          }}
          autoCreateCards={autoCreateCards}
          noteId={cardNoteId}
          sourceIds={task?.source_ids}
          sources={sourceActions}
          taskPending={!!task && !['completed', 'failed'].includes(task.status)}
        />
      ) : (
        <div className="ai-result-grid">
          <section className="ai-document">
            {job.status === 'completed' ? (
              <>
                <div className="ai-document-toolbar">
                  <h2>Расшифровка</h2>
                  <span aria-live="polite">
                    {saveState === 'saving'
                      ? 'Сохраняем…'
                      : saveState === 'error'
                        ? 'Не удалось сохранить'
                        : 'Изменения сохраняются автоматически'}
                  </span>
                </div>
                <textarea
                  aria-label="Текст расшифровки"
                  className="ai-transcript"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </>
            ) : isBusy ? (
              <ProcessingState job={job} />
            ) : (
              <div className="ai-empty">
                <h2>Не удалось обработать запись</h2>
                <p>{job.error_message ?? 'Попробуйте загрузить файл ещё раз.'}</p>
                <Link to="/transcriptions">Загрузить другую запись</Link>
              </div>
            )}
          </section>
          <aside className="ai-result-rail">
            <section>
              <h2>Исходные материалы</h2>
              {sourceActions}
            </section>
            <QuotaSummary entitlements={entitlements} />
          </aside>
        </div>
      )}
      <details className="ai-task-settings">
        <summary>Управление задачей</summary>
        <p>
          Удаление задачи удалит исходную расшифровку и версии результатов. Сохранённые наборы
          останутся.
        </p>
        {['uploading', 'queued', 'failed', 'completed'].includes(job.status) ? (
          <Button variant="danger" onClick={onDelete}>
            {job.status === 'queued' ? 'Отменить задание' : 'Удалить задачу'}
          </Button>
        ) : (
          <p>Удаление станет доступно после обработки записи.</p>
        )}
      </details>
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

function QuotaSummary({ entitlements }: { entitlements?: Entitlements }) {
  if (!entitlements) return null;
  const limit = entitlements.limits[TRANSCRIPTION_LIMIT];
  const remaining = entitlements.remaining[TRANSCRIPTION_LIMIT];
  return (
    <>
      <section className="billing-quota" aria-label="Квота расшифровки">
        <h3>На этой неделе</h3>
        <p>
          {limit === null
            ? 'Расшифровка без лимита'
            : `${remaining ?? 0} из ${limit} минут осталось`}
        </p>
        {typeof limit === 'number' && limit > 0 ? (
          <meter
            min={0}
            max={limit}
            value={Math.max(0, Math.min(remaining ?? 0, limit))}
            aria-label="Оставшиеся минуты расшифровки"
          />
        ) : null}
        <p>
          Генерация:{' '}
          {entitlements.remaining['ai.generation_tokens_per_week'] === null
            ? 'без лимита'
            : `${(entitlements.remaining['ai.generation_tokens_per_week'] ?? 0).toLocaleString('ru-RU')} токенов осталось`}
          .
        </p>
        <p className="billing-quota-reset">
          {formatReset(entitlements.resets_at[TRANSCRIPTION_LIMIT])}
        </p>
        {entitlements.features['ai.transcription'] ? (
          <Link className="billing-support-link" to="/billing">
            Тариф и подписка
          </Link>
        ) : null}
      </section>
      {!entitlements.features['ai.transcription'] ? (
        <BillingNotice title="Расшифровка с ИИ">
          Новые записи можно расшифровать на Plus и Pro. Уже готовые материалы остаются доступны.
        </BillingNotice>
      ) : null}
    </>
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const [search, setSearch] = useState('');
  const filtered = jobs.filter((job) =>
    (job.title ?? job.filename).toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')),
  );
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="ai-native-dialog"
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
    </dialog>
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
    <Modal title={cancel ? 'Отменить задание?' : 'Удалить задачу?'} onClose={onClose}>
      <p className="text-fg-muted">
        {cancel
          ? 'Загрузка остановится, а зарезервированные минуты вернутся в недельный лимит.'
          : 'Источники, версии конспекта и черновики карточек будут удалены без восстановления. Уроки в курсах и сохранённые наборы останутся.'}
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="ai-native-dialog ai-native-modal p-4"
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
    </dialog>
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

async function uploadPartWithRetry(
  jobId: string,
  partNumber: number,
  chunk: Blob,
  signal: AbortSignal,
) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < UPLOAD_RETRIES; attempt += 1) {
    signal.throwIfAborted();
    try {
      const signed = await api.POST('/api/v1/transcriptions/{job_id}/upload/parts', {
        params: { path: { job_id: jobId } },
        body: { part_numbers: [partNumber] },
      });
      if (signed.error || !signed.data?.[0]) {
        throw new Error(apiMessage(signed.error, 'Не удалось подготовить часть файла'));
      }
      const response = await fetch(signed.data[0].url, {
        method: 'PUT',
        body: chunk,
        credentials: 'omit',
        signal,
      });
      if (!response.ok) throw new Error(`Хранилище вернуло ошибку ${response.status}`);
      return;
    } catch (caught) {
      if (signal.aborted) throw new DOMException('Загрузка отменена', 'AbortError');
      lastError = caught instanceof Error ? caught : new Error('Не удалось загрузить часть файла');
      if (attempt + 1 < UPLOAD_RETRIES) {
        await abortableDelay(Math.min(2 ** attempt * 1_000, 8_000), signal);
      }
    }
  }
  if (lastError instanceof TypeError) {
    throw new Error('Соединение прервалось. Проверьте интернет и продолжите загрузку.');
  }
  throw lastError ?? new Error('Не удалось загрузить часть файла');
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Загрузка отменена', 'AbortError'));
      },
      { once: true },
    );
  });
}

const BROWSER_METADATA_EXTENSIONS = new Set([
  'aac',
  'm4a',
  'm4v',
  'mp3',
  'mp4',
  'ogg',
  'opus',
  'wav',
  'webm',
]);

async function readMediaDuration(file: File): Promise<number> {
  if (canUseBrowserMetadata(file)) {
    try {
      return await readBrowserMediaDuration(file);
    } catch {
      // Поддержка контейнеров различается между браузерами, поэтому пробуем универсальный анализатор.
    }
  }

  const { default: mediaInfoFactory } = await import('mediainfo.js');
  const mediaInfo = await mediaInfoFactory({
    format: 'object',
    locateFile: () => `${import.meta.env.BASE_URL}assets/mediainfo/MediaInfoModule.wasm`,
  });
  try {
    const result = await mediaInfo.analyzeData(file.size, async (size, offset) => {
      const chunk = await file.slice(offset, offset + size).arrayBuffer();
      return new Uint8Array(chunk);
    });
    const general = result.media?.track.find((track) => track['@type'] === 'General');
    const duration = general?.Duration;
    if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
      throw new Error('duration unavailable');
    }
    return Math.ceil(duration);
  } finally {
    mediaInfo.close();
  }
}

function canUseBrowserMetadata(file: File) {
  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en') ?? '';
  return BROWSER_METADATA_EXTENSIONS.has(extension);
}

function readBrowserMediaDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    let settled = false;
    media.preload = 'metadata';
    const timeout = window.setTimeout(
      () => finish(() => reject(new Error('duration unavailable'))),
      5_000,
    );

    function finish(callback: () => void) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      callback();
    }

    media.onloadedmetadata = () => {
      const duration = Math.ceil(media.duration);
      finish(() => {
        if (Number.isFinite(duration) && duration > 0) resolve(duration);
        else reject(new Error('duration unavailable'));
      });
    };
    media.onerror = () => finish(() => reject(new Error('duration unavailable')));
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

async function downloadStructuredResult(job: Transcription) {
  const { data, error } = await api.GET('/api/v1/transcriptions/{job_id}/structured-result', {
    params: { path: { job_id: job.id } },
  });
  if (error || !data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(job.title ?? job.filename)}.json`;
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
