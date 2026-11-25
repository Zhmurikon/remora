import { Button } from '@remora/ui';
import { useRef, type ReactNode, type RefObject } from 'react';
import { AnswerRewards } from './rewards/StudyRewards';
import { useStudyStore } from './study-store';
import './study-modes.css';

interface StudyShellProps {
  title: string;
  subtitle?: string;
  done: number;
  questionIndex?: number;
  bodyRef?: RefObject<HTMLDivElement | null>;
  total: number;
  onExit: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function StudyShell({
  title,
  subtitle,
  done,
  questionIndex = done,
  bodyRef,
  total,
  onExit,
  children,
  footer,
}: StudyShellProps) {
  const defaultBody = useRef<HTMLDivElement>(null);
  const body = bodyRef ?? defaultBody;
  const completed = Math.max(0, Math.min(done, total));
  const percent = total > 0 ? (completed / total) * 100 : 0;
  return (
    <div className="study-layout">
      <section className="study-workspace" data-study-answering="" aria-label={title}>
        <header className="study-header">
          <div>
            <p className="study-eyebrow">Тренировка</p>
            <h1>{title}</h1>
            {subtitle && <p className="study-subtitle">{subtitle}</p>}
          </div>
          <Button variant="ghost" onClick={onExit} className="study-exit">
            Завершить <span aria-hidden="true">↗</span>
          </Button>
        </header>
        <div className="study-progress">
          <div className="study-progress-copy">
            <span>
              Пройдено <strong>{completed}</strong> из {total}
            </span>
            <span>Осталось {Math.max(0, total - completed)}</span>
          </div>
          <div
            className="study-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={completed}
            aria-label={`Пройдено ${completed} из ${total}`}
          >
            <div style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        </div>
        <SyncIndicator />
        <div ref={body} className="study-body">
          {children}
          <AnswerRewards body={body} questionIndex={questionIndex} />
        </div>
        {footer && <footer className="study-footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function StudyHint({ children }: { children: ReactNode }) {
  return (
    <details className="study-hint">
      <summary>Подсказка</summary>
      <p>{children}</p>
    </details>
  );
}

export function StudyState({
  title,
  children,
  loading = false,
  error = false,
  actions,
}: {
  title: string;
  children?: ReactNode;
  loading?: boolean;
  error?: boolean;
  actions?: ReactNode;
}) {
  return (
    <section className="study-workspace study-state" aria-busy={loading}>
      <p className="study-eyebrow">Тренировка</p>
      <h1>{title}</h1>
      {children && (
        <div className="study-state-description" role={error ? 'alert' : undefined}>
          {children}
        </div>
      )}
      {loading && (
        <div className="study-skeleton" role="status">
          <span className="sr-only">Загрузка</span>
          <span />
          <span />
        </div>
      )}
      {actions && <div className="study-state-actions">{actions}</div>}
    </section>
  );
}

export function SyncIndicator() {
  const sync = useStudyStore((state) => state.sync);
  const pending = useStudyStore((state) => state.pending);
  const syncNow = useStudyStore((state) => state.syncNow);

  return (
    <div
      className={`study-sync ${sync === 'offline' ? 'study-sync-offline' : ''}`}
      role="status"
      aria-live="polite"
    >
      {sync === 'offline' ? (
        <>
          <span>
            Нет связи.{' '}
            {pending > 0 ? `Ответы сохранены на устройстве: ${pending}.` : 'Проверьте подключение.'}
          </span>
          <Button variant="ghost" onClick={() => void syncNow()}>
            Повторить отправку
          </Button>
        </>
      ) : sync === 'syncing' ? (
        'Отправляем ответы…'
      ) : pending > 0 ? (
        `Сохранено на устройстве · в очереди ${pending}`
      ) : null}
    </div>
  );
}
