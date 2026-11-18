'use client';

import type { ReactNode } from 'react';

const paths = {
  top: 'M5 4h14M12 20V8m-5 5 5-5 5 5',
  bottom: 'M5 20h14M12 4v12m-5-5 5 5 5-5',
  previous: 'm14.5 5-7 7 7 7',
  next: 'm9.5 5 7 7-7 7',
  outline: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 0v16',
};

export function ReaderIconButton({
  icon,
  label,
  title = label,
  disabled,
  onClick,
}: {
  icon: keyof typeof paths;
  label: string;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="reader-control reader-icon"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={paths[icon]} />
      </svg>
    </button>
  );
}

type LessonJump = { title: string; go: () => void };

export function ReaderToolbar({
  label = 'Навигация по уроку',
  tabs,
  largeText,
  toggleText,
  showOutline,
  neighbors,
}: {
  label?: string;
  tabs?: ReactNode;
  largeText: boolean;
  toggleText?: () => void;
  showOutline?: () => void;
  neighbors?: { previous?: LessonJump; next?: LessonJump };
}) {
  return (
    <nav className="reader-tools" aria-label={label}>
      <div className="reader-tabs">{tabs}</div>
      <div className="reader-options">
        {showOutline && (
          <ReaderIconButton icon="outline" label="Показать список уроков" onClick={showOutline} />
        )}
        {toggleText && (
          <button
            type="button"
            className="reader-control reader-type"
            aria-label="Крупный текст"
            title={largeText ? 'Обычный текст' : 'Крупный текст'}
            aria-pressed={largeText}
            onClick={toggleText}
          >
            Аа
          </button>
        )}
      </div>
      <div className="reader-movement">
        <div className="reader-jumps" role="group" aria-label="Прокрутка страницы">
          <ReaderIconButton
            icon="top"
            label="В начало страницы"
            onClick={() => window.scrollTo({ top: 0 })}
          />
          <ReaderIconButton
            icon="bottom"
            label="В конец страницы"
            onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight })}
          />
        </div>
        {neighbors && (
          <div className="reader-neighbors" role="group" aria-label="Соседние уроки">
            <ReaderIconButton
              icon="previous"
              label="Предыдущий урок"
              title={neighbors.previous && `Предыдущий урок — ${neighbors.previous.title}`}
              disabled={!neighbors.previous}
              onClick={() => neighbors.previous?.go()}
            />
            <ReaderIconButton
              icon="next"
              label="Следующий урок"
              title={neighbors.next && `Следующий урок — ${neighbors.next.title}`}
              disabled={!neighbors.next}
              onClick={() => neighbors.next?.go()}
            />
          </div>
        )}
      </div>
    </nav>
  );
}
