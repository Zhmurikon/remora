/**
 * Общая оболочка тренировки: прогресс, выход, состояние синхронизации.
 * Одинаковая для всех режимов, чтобы «Карточки» и «Заучивание» ощущались
 * как один продукт, а не как два разных экрана.
 */

import { Button } from '@remora/ui';
import type { ReactNode } from 'react';
import { useStudyStore } from './study-store';

interface StudyShellProps {
  title: string;
  subtitle?: string;
  done: number;
  total: number;
  onExit: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function StudyShell({
  title,
  subtitle,
  done,
  total,
  onExit,
  children,
  footer,
}: StudyShellProps) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex min-h-[70vh] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-fg-muted mt-1 text-sm">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          <SyncIndicator />
          <Button variant="ghost" onClick={onExit}>
            Завершить
          </Button>
        </div>
      </header>

      <div
        className="bg-surface-muted mt-5 h-2 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`Пройдено ${done} из ${total}`}
      >
        <div
          className="bg-primary duration-normal h-full rounded-full transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-fg-subtle mt-2 text-sm">
        {done} из {total}
      </p>

      <div className="mt-6 flex-1">{children}</div>
      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}

/** Состояние отправки ответов. Молчит, пока всё в порядке. */
export function SyncIndicator() {
  const sync = useStudyStore((state) => state.sync);
  const pending = useStudyStore((state) => state.pending);
  const syncNow = useStudyStore((state) => state.syncNow);

  if (sync === 'idle' && pending === 0) return null;
  if (sync === 'offline') {
    return (
      <button
        type="button"
        onClick={() => void syncNow()}
        className="bg-warning-subtle text-warning min-h-11 rounded-md px-3 text-sm font-medium"
      >
        Нет связи · {pending} не отправлено · повторить
      </button>
    );
  }
  return (
    <span className="text-fg-subtle text-sm" aria-live="polite">
      {sync === 'syncing' ? 'Сохраняем…' : `${pending} в очереди`}
    </span>
  );
}
