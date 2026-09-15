'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface AudioPlayerProps {
  src: string | null;
  /** Ссылка на следующую карточку: греется заранее, чтобы не было паузы. */
  preloadSrc?: string | null;
  autoPlay?: boolean;
  /** Сбрасывает состояние при переходе к следующей карточке. */
  trackId?: string;
  onEnded?: () => void;
  className?: string;
}

const SPEEDS = [0.75, 1, 1.25] as const;

/**
 * Плеер для режима «Аудирование».
 *
 * Предзагрузка следующего файла обязательна: пауза на загрузку между карточками
 * ломает ритм тренировки сильнее, чем кажется. Браузер сам решит, сколько
 * успеет скачать, но запрос уже будет отправлен.
 */
export function AudioPlayer({
  src,
  preloadSrc,
  autoPlay = true,
  trackId,
  onEnded,
  className,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.playbackRate = speed;
    if (!autoPlay) return;
    // Браузер может отклонить автовоспроизведение без жеста пользователя —
    // это не ошибка, просто оставляем кнопку.
    void audio.play().catch(() => setPlaying(false));
  }, [autoPlay, speed, src, trackId]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  }

  function replay() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    audio.currentTime = 0;
    void audio.play().catch(() => setFailed(true));
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
      />
      {preloadSrc && <audio src={preloadSrc} preload="auto" aria-hidden="true" />}

      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        className="bg-primary text-primary-fg focus-visible:ring-primary grid h-14 w-14 place-items-center rounded-full text-2xl focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
      >
        {playing ? '⏸' : '▶'}
      </button>

      <button
        type="button"
        onClick={replay}
        disabled={!src}
        aria-label="Повторить"
        className="border-border hover:bg-surface-muted grid h-11 w-11 place-items-center rounded-full border text-lg disabled:opacity-50"
      >
        ↺
      </button>

      <div className="flex items-center gap-1" role="group" aria-label="Скорость">
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSpeed(value);
              if (audioRef.current) audioRef.current.playbackRate = value;
            }}
            aria-pressed={speed === value}
            className={cn(
              'min-h-11 rounded-md px-3 text-sm font-medium transition-colors',
              speed === value
                ? 'bg-primary-subtle text-primary'
                : 'text-fg-muted hover:bg-surface-muted',
            )}
          >
            {value}×
          </button>
        ))}
      </div>

      {failed && <p className="text-danger text-sm">Не удалось воспроизвести аудио</p>}
    </div>
  );
}
