'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';

type JobStatus = 'uploading' | 'queued' | 'converting' | 'transcribing' | 'completed' | 'failed';
type Job = {
  id: string;
  filename: string;
  status: JobStatus;
  result_text: string | null;
  error_message: string | null;
};

const CHUNK_BYTES = 16 * 1024 * 1024;
const JOB_KEY = 'remora-transcription-job';
const statusText: Record<JobStatus, string> = {
  uploading: 'Загружаем файл',
  queued: 'Файл загружен и ожидает обработки',
  converting: 'Извлекаем аудиодорожку',
  transcribing: 'Распознаём речь',
  completed: 'Расшифровка готова',
  failed: 'Не удалось обработать файл',
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function downloadText(text: string, sourceName: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sourceName.replace(/\.[^.]+$/, '') || 'transcription'}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? 'Сервер временно недоступен');
  return body;
}

async function uploadWithRetry(url: string, chunk: Blob) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'PUT', body: chunk });
      if (response.ok) return;
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? 'Не удалось загрузить часть файла');
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Не удалось загрузить файл');
}

export function Transcriber({ initialAccess }: { initialAccess: boolean }) {
  const [hasAccess, setHasAccess] = useState(initialAccess);
  const [accessError, setAccessError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [stage, setStage] = useState<JobStatus | 'idle'>('idle');
  const [status, setStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState('');
  const [resultFilename, setResultFilename] = useState('transcription');
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(JOB_KEY);
    if (stored) setJobId(stored);
  }, []);

  useEffect(() => {
    if (!jobId || !hasAccess) return;
    let stopped = false;
    async function check() {
      try {
        const job = await json<Job>(
          await fetch(`/rasshifrovka/api/jobs/${jobId}`, { cache: 'no-store' }),
        );
        if (stopped) return;
        setStage(job.status);
        setStatus(job.error_message || statusText[job.status]);
        setResultFilename(job.filename);
        if (job.status === 'completed') {
          setResult(job.result_text ?? '');
          localStorage.removeItem(JOB_KEY);
          setJobId(null);
        } else if (job.status === 'failed') {
          localStorage.removeItem(JOB_KEY);
          setJobId(null);
        }
      } catch (error) {
        if (!stopped)
          setStatus(error instanceof Error ? error.message : 'Не удалось получить статус');
      }
    }
    void check();
    const timer = window.setInterval(check, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [hasAccess, jobId]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessError('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/rasshifrovka/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: form.get('code') }),
    });
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setAccessError(body.message ?? 'Не удалось проверить код');
      return;
    }
    setHasAccess(true);
  }

  function selectFile(nextFile: File | undefined) {
    if (!nextFile) return;
    if (nextFile.size > 1024 * 1024 * 1024) {
      setStage('failed');
      setStatus('Файл должен быть не больше 1 ГБ.');
      return;
    }
    setFile(nextFile);
    setResult('');
    setStatus('');
    setStage('idle');
    setUploadProgress(0);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  async function transcribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const form = new FormData(event.currentTarget);
    setStage('uploading');
    setStatus('Создаём загрузку');
    setResult('');
    setUploadProgress(0);
    try {
      const totalParts = Math.ceil(file.size / CHUNK_BYTES);
      const job = await json<Job>(
        await fetch('/rasshifrovka/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            content_type: file.type || 'application/octet-stream',
            size_bytes: file.size,
            total_parts: totalParts,
            language: form.get('language') || null,
            beam_size: Number(form.get('beam_size')),
            vad_filter: form.has('vad_filter'),
            word_timestamps: form.has('word_timestamps'),
          }),
        }),
      );
      setJobId(job.id);
      localStorage.setItem(JOB_KEY, job.id);
      for (let part = 0; part < totalParts; part += 1) {
        setStatus(`Загружаем файл: ${part + 1} из ${totalParts}`);
        await uploadWithRetry(
          `/rasshifrovka/api/jobs/${job.id}/parts/${part}`,
          file.slice(part * CHUNK_BYTES, Math.min(file.size, (part + 1) * CHUNK_BYTES)),
        );
        setUploadProgress(Math.round(((part + 1) / totalParts) * 100));
      }
      await json<Job>(await fetch(`/rasshifrovka/api/jobs/${job.id}/complete`, { method: 'POST' }));
      setStage('queued');
      setStatus(statusText.queued);
      setFile(null);
    } catch (error) {
      setStage('failed');
      setStatus(error instanceof Error ? error.message : 'Не удалось загрузить файл');
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!hasAccess)
    return (
      <div
        className="transcriber-gate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-title"
      >
        <form className="transcriber-gate-card" onSubmit={unlock}>
          <div className="transcriber-mark" aria-hidden="true">
            R
          </div>
          <h1 id="gate-title">Закрытый инструмент</h1>
          <p>Введите код доступа. На этом устройстве повторно спрашивать его не будем.</p>
          <label htmlFor="access-code">Код доступа</label>
          <input
            id="access-code"
            name="code"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder="Четыре цифры"
            required
            autoFocus
          />
          <p className="transcriber-error" role="alert">
            {accessError}
          </p>
          <button className="transcriber-button" type="submit">
            Продолжить
          </button>
        </form>
      </div>
    );

  const busy =
    stage === 'uploading' ||
    stage === 'queued' ||
    stage === 'converting' ||
    stage === 'transcribing';
  return (
    <form className="transcriber-workspace" onSubmit={transcribe}>
      <div className="transcriber-card transcriber-upload-card">
        <div
          className={`transcriber-dropzone${dragging ? 'is-over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => !busy && fileInput.current?.click()}
          onKeyDown={(event) => {
            if (!busy && (event.key === 'Enter' || event.key === ' ')) fileInput.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-label="Выбрать аудио или видео"
        >
          <span className="transcriber-upload-icon" aria-hidden="true">
            ↑
          </span>
          <h2>Перетащите файл сюда</h2>
          <p>или выберите его с компьютера</p>
          <span className="transcriber-file-button">Выбрать файл</span>
          <small>MP3, WAV, M4A, MP4, WEBM, OGG, FLAC и TS · до 1 ГБ</small>
        </div>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="audio/*,video/*,.ts,.m4a,.flac,.ogg,.webm"
          onChange={(event: ChangeEvent<HTMLInputElement>) => selectFile(event.target.files?.[0])}
        />
        {file ? (
          <div className="transcriber-selected" aria-live="polite">
            <span className="transcriber-file-type">
              {file.name.split('.').pop()?.slice(0, 4) || 'file'}
            </span>
            <span className="transcriber-file-copy">
              <strong>{file.name}</strong>
              <small>{formatSize(file.size)}</small>
            </span>
            <button type="button" aria-label="Убрать файл" onClick={() => setFile(null)}>
              ×
            </button>
          </div>
        ) : null}
      </div>
      <aside className="transcriber-card transcriber-settings">
        <h2>Настройки</h2>
        <label htmlFor="language">Язык записи</label>
        <select id="language" name="language" defaultValue="ru">
          <option value="">Определить автоматически</option>
          <option value="ru">Русский</option>
          <option value="en">Английский</option>
        </select>
        <label htmlFor="beam_size">Точность распознавания</label>
        <select id="beam_size" name="beam_size" defaultValue="5">
          <option value="3">Быстрее</option>
          <option value="5">Оптимальная</option>
          <option value="8">Максимальная</option>
        </select>
        <label className="transcriber-check">
          <input type="checkbox" name="vad_filter" defaultChecked />
          <span>Убирать длинные паузы</span>
        </label>
        <label className="transcriber-check">
          <input type="checkbox" name="word_timestamps" />
          <span>Добавить таймкоды слов</span>
        </label>
        <button className="transcriber-button" disabled={!file || busy} type="submit">
          {busy ? 'Обрабатываем…' : 'Начать расшифровку'}
        </button>
        <p className="transcriber-hint">
          После загрузки вкладку можно закрыть. Обработка продолжится на сервере.
        </p>
      </aside>
      {(status || result) && (
        <section className={`transcriber-card transcriber-result ${stage}`} aria-live="polite">
          <div className="transcriber-result-head">
            <div>
              <p className="transcriber-kicker">Результат</p>
              <h2>{status}</h2>
            </div>
            {result ? (
              <div className="transcriber-result-actions">
                <button type="button" onClick={copyResult}>
                  {copied ? 'Скопировано' : 'Копировать'}
                </button>
                <button type="button" onClick={() => downloadText(result, resultFilename)}>
                  Скачать .txt
                </button>
              </div>
            ) : null}
          </div>
          {busy ? (
            <>
              <div className="transcriber-progress">
                <span
                  style={
                    stage === 'uploading'
                      ? { width: `${uploadProgress}%`, transform: 'none', animation: 'none' }
                      : undefined
                  }
                />
              </div>
              <p className="transcriber-hint">
                {stage === 'uploading'
                  ? `${uploadProgress}%`
                  : 'Статус обновляется автоматически каждые 5 секунд'}
              </p>
            </>
          ) : null}
          {result ? (
            <textarea
              aria-label="Текст расшифровки"
              value={result}
              onChange={(event) => setResult(event.target.value)}
            />
          ) : null}
        </section>
      )}
    </form>
  );
}
