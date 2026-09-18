'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';

type Stage = 'idle' | 'uploading' | 'done' | 'error';

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

export function Transcriber({ initialAccess }: { initialAccess: boolean }) {
  const [hasAccess, setHasAccess] = useState(initialAccess);
  const [accessError, setAccessError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
      setStage('error');
      setStatus('Файл должен быть не больше 1 ГБ.');
      return;
    }
    setFile(nextFile);
    setResult('');
    setStatus('');
    setStage('idle');
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  async function transcribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setStage('uploading');
    setStatus('Загружаем файл и распознаём речь. Эту вкладку пока не закрывайте.');
    setResult('');
    setCopied(false);
    const form = new FormData(event.currentTarget);
    form.set('file', file, file.name);
    form.set('vad_filter', form.has('vad_filter') ? 'true' : 'false');
    form.set('word_timestamps', form.has('word_timestamps') ? 'true' : 'false');
    try {
      const response = await fetch('/rasshifrovka/api/transcribe', { method: 'POST', body: form });
      const body = (await response.json().catch(() => ({}))) as {
        text?: unknown;
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? 'Не удалось расшифровать запись');
      if (typeof body.text !== 'string') throw new Error('Сервис вернул ответ без текста');
      setResult(body.text.trim());
      setStatus('Расшифровка готова');
      setStage('done');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Не удалось расшифровать запись');
      setStage('error');
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!hasAccess) {
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
  }

  return (
    <form className="transcriber-workspace" onSubmit={transcribe}>
      <div className="transcriber-card transcriber-upload-card">
        <div
          className={`transcriber-dropzone${dragging ? 'is-over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click();
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
          <input type="checkbox" name="vad_filter" value="true" defaultChecked />{' '}
          <span>Убирать длинные паузы</span>
        </label>
        <label className="transcriber-check">
          <input type="checkbox" name="word_timestamps" value="true" />{' '}
          <span>Добавить таймкоды слов</span>
        </label>
        <button
          className="transcriber-button"
          disabled={!file || stage === 'uploading'}
          type="submit"
        >
          {stage === 'uploading' ? 'Расшифровываем…' : 'Начать расшифровку'}
        </button>
        <p className="transcriber-hint">
          Обработка large-v3 может занять больше времени, чем длится само аудио.
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
                <button
                  type="button"
                  onClick={() => downloadText(result, file?.name ?? 'transcription')}
                >
                  Скачать .txt
                </button>
              </div>
            ) : null}
          </div>
          {stage === 'uploading' ? (
            <div className="transcriber-progress">
              <span />
            </div>
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
